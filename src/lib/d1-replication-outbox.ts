export type ReplicationOutboxStatus = "pending" | "processing" | "synced" | "failed";
export type ReplicatedEntityType =
  | "profiles"
  | "generation_tasks"
  | "generation_history"
  | "credit_usage_logs"
  | "user_orders"
  | "coupons"
  | "redeem_logs";

export type ReplicationEventType = `${ReplicatedEntityType}.upsert` | `${ReplicatedEntityType}.delete`;

type BoundValue = string | number | null;

export interface D1PreparedStatementLike {
  bind(...values: BoundValue[]): D1PreparedStatementLike;
}

export interface D1DatabaseLike {
  prepare(sql: string): D1PreparedStatementLike;
  batch<T = unknown>(statements: D1PreparedStatementLike[]): Promise<T[]>;
}

export type ReplicationOutboxEvent = {
  id?: string;
  eventType: ReplicationEventType;
  entityType: ReplicatedEntityType;
  entityId: string;
  payload: unknown;
  idempotencyKey: string;
  createdAt?: string;
  condition?: {
    sql: string;
    values: BoundValue[];
  };
};

const forbiddenPayloadKeyPattern = /api[_-]?key|secret|token|jwt|authorization|service[_-]?role|provider[_-]?secret|private[_-]?key|credential|signature|^sig$/i;
const bearerLikeValuePattern = /\bBearer\s+[A-Za-z0-9._~+/=-]+|eyJ[A-Za-z0-9_-]{20,}/i;
const inputParamSecretKeyPattern = /api[_-]?key|access[_-]?token|secret|token|jwt|authorization|service[_-]?role|provider[_-]?secret|private[_-]?key|credential|signature|^sig$/i;
const signedUrlQueryKeyPattern = /^(?:x-amz-(?:algorithm|credential|date|expires|security-token|signature|signedheaders)|x-goog-(?:algorithm|credential|date|expires|signedheaders|signature)|awsaccesskeyid|signature|sig|token|access[_-]?token|sv|st|se|spr|sp|sr|skoid|sktid|skt|ske|sks|skv)$/i;

function sanitizeSignedUrl(value: string): string {
  if (!/^https?:\/\//i.test(value)) return value;

  try {
    const url = new URL(value);
    const retainedParams = Array.from(url.searchParams.entries()).filter(([key]) => !signedUrlQueryKeyPattern.test(key));
    url.search = "";
    for (const [key, paramValue] of retainedParams) url.searchParams.append(key, paramValue);
    return url.toString();
  } catch {
    return value;
  }
}

function sanitizeInputParamString(value: string): string {
  return sanitizeSignedUrl(
    value
      .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
      .replace(/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[JWT_REDACTED]"),
  );
}

function sanitizeInputParamsValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => sanitizeInputParamsValue(item));

  if (value && typeof value === "object") {
    const sanitized: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      if (inputParamSecretKeyPattern.test(key)) continue;
      sanitized[key] = sanitizeInputParamsValue(child);
    }
    return sanitized;
  }

  return typeof value === "string" ? sanitizeInputParamString(value) : value;
}

function sanitizeInputParamsField(value: unknown): unknown {
  if (typeof value !== "string") return sanitizeInputParamsValue(value);

  try {
    return JSON.stringify(sanitizeInputParamsValue(JSON.parse(value)));
  } catch {
    return "[REDACTED_INPUT_PARAMS]";
  }
}

function cloneAndSanitizeReplicationPayload(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => cloneAndSanitizeReplicationPayload(item));

  if (value && typeof value === "object") {
    const cloned: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      cloned[key] = key === "input_params"
        ? sanitizeInputParamsField(child)
        : cloneAndSanitizeReplicationPayload(child);
    }
    return cloned;
  }

  return value;
}

export function sanitizeReplicationPayload(value: unknown): unknown {
  return cloneAndSanitizeReplicationPayload(value);
}

export function buildReplicationOutboxStatement(db: D1DatabaseLike, event: ReplicationOutboxEvent): D1PreparedStatementLike {
  const sanitizedPayload = sanitizeReplicationPayload(event.payload);
  assertSafeReplicationPayload(sanitizedPayload);
  const createdAt = event.createdAt ?? new Date().toISOString();
  const id = event.id ?? crypto.randomUUID();
  const payloadJson = JSON.stringify(sanitizedPayload);
  if (payloadJson == null) throw new Error("Replication payload is not JSON serializable");
  const conditionSql = event.condition ? ` WHERE ${event.condition.sql}` : "";
  const conditionValues = event.condition?.values ?? [];

  return db.prepare(`
    INSERT INTO replication_outbox (
      id,
      event_type,
      entity_type,
      entity_id,
      payload,
      idempotency_key,
      status,
      attempt_count,
      created_at
    ) SELECT ?, ?, ?, ?, ?, ?, 'pending', 0, ?${conditionSql}
    ON CONFLICT(idempotency_key) DO NOTHING
  `).bind(
    id,
    event.eventType,
    event.entityType,
    event.entityId,
    payloadJson,
    event.idempotencyKey,
    createdAt,
    ...conditionValues,
  );
}

export async function executeBusinessBatchWithOutbox(input: {
  db: D1DatabaseLike;
  businessStatements: D1PreparedStatementLike[];
  outboxEvents: ReplicationOutboxEvent[];
}): Promise<unknown[]> {
  if (input.businessStatements.length === 0) {
    throw new Error("At least one business statement is required before outbox events are written");
  }
  if (input.outboxEvents.length === 0) {
    throw new Error("D1 authoritative writes must include at least one replication outbox event");
  }

  const outboxStatements = input.outboxEvents.map((event) => buildReplicationOutboxStatement(input.db, event));
  return input.db.batch([...input.businessStatements, ...outboxStatements]);
}

export function buildReplicationHealthQueries(db: D1DatabaseLike): {
  pending: D1PreparedStatementLike;
  lastSuccess: D1PreparedStatementLike;
} {
  return {
    pending: db.prepare(`
      SELECT
        COUNT(*) AS pendingReplication,
        MIN(created_at) AS oldestPendingAt
      FROM replication_outbox
      WHERE status IN ('pending', 'processing', 'failed')
    `),
    lastSuccess: db.prepare(`
      SELECT MAX(synced_at) AS lastReplicationAt
      FROM replication_outbox
      WHERE status = 'synced'
    `),
  };
}

export function assertSafeReplicationPayload(value: unknown, path = "payload"): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertSafeReplicationPayload(item, `${path}[${index}]`));
    return;
  }

  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (forbiddenPayloadKeyPattern.test(key)) {
        throw new Error(`Replication payload contains forbidden secret-like key at ${path}.${key}`);
      }
      assertSafeReplicationPayload(child, `${path}.${key}`);
    }
    return;
  }

  if (typeof value === "string" && bearerLikeValuePattern.test(value)) {
    throw new Error(`Replication payload contains forbidden credential-like value at ${path}`);
  }
}
