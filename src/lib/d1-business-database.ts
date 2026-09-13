import type {
  BusinessDatabase,
  CompletePaidOrderInput,
  CompletePaidOrderResult,
  ConsumeCreditsForGenerationInput,
  ConsumeCreditsResult,
  Coupon,
  CreateGenerationTaskInput,
  FinalizeGenerationTaskInput,
  FinalizeGenerationTaskResult,
  GenerationHistory,
  GenerationTask,
  JsonValue,
  ModelConfig,
  Profile,
  RechargePackage,
  RedeemCouponInput,
  RedeemCouponResult,
  UpdateProfileInput,
  UpdateGenerationTaskLifecycleInput,
  UserOrder,
} from "@/lib/business-database";
import {
  boolFromD1,
  boolToD1,
  centiCreditToCredits,
  creditsToCentiCredit,
  fenToYuan,
  jsonFromD1,
  jsonToD1,
  nowIso,
  randomId,
  yuanToFen,
} from "@/lib/business-database";
import type { ReplicatedEntityType, ReplicationEventType, ReplicationOutboxEvent } from "@/lib/d1-replication-outbox";
import { buildReplicationOutboxStatement } from "@/lib/d1-replication-outbox";

type BoundValue = string | number | null;

export interface D1PreparedStatementLike {
  bind(...values: BoundValue[]): D1PreparedStatementLike;
  first<T = Record<string, unknown>>(columnName?: string): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results?: T[] } | T[]>;
  run(): Promise<D1RunResult>;
}

export interface D1RunResult {
  success?: boolean;
  meta?: { changes?: number; rows_written?: number; rows_read?: number };
}

export interface D1DatabaseBindingLike {
  prepare(sql: string): D1PreparedStatementLike;
  batch<T = unknown>(statements: D1PreparedStatementLike[]): Promise<T[]>;
}

type RawRow = Record<string, unknown>;

export class D1BusinessDatabase implements BusinessDatabase {
  readonly primary = "d1" as const;

  constructor(private readonly db: D1DatabaseBindingLike) {}

  async getProfile(userId: string): Promise<Profile | null> {
    const row = await this.first<RawRow>("SELECT * FROM profiles WHERE id = ?", userId);
    return row ? mapProfile(row) : null;
  }

  async ensureProfile(input: { id: string; email?: string | null; displayName?: string | null; avatarUrl?: string | null; now?: string }): Promise<Profile> {
    const existing = await this.getProfile(input.id);
    if (existing) return existing;

    const now = input.now ?? nowIso();
    const row = {
      id: input.id,
      email: input.email ?? null,
      display_name: input.displayName ?? null,
      avatar_url: input.avatarUrl ?? null,
      credits: 20,
      created_at: now,
      updated_at: now,
    };
    await this.batchWithOutbox([
      this.db.prepare(`
        INSERT INTO profiles (id, email, display_name, avatar_url, credits, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(row.id, row.email, row.display_name, row.avatar_url, row.credits, row.created_at, row.updated_at),
    ], [rowStateEvent("profiles", row.id, row, `profiles:${row.id}:ensure`)]);
    return mapProfile(row);
  }

  async updateProfile(input: UpdateProfileInput): Promise<Profile> {
    const now = input.now ?? nowIso();
    const existing = await this.ensureProfile({
      id: input.userId,
      email: input.email,
      displayName: input.displayName,
      avatarUrl: input.avatarUrl,
      now,
    });
    const row = {
      ...profileToRaw(existing),
      email: input.email !== undefined ? input.email : existing.email,
      display_name: input.displayName !== undefined ? input.displayName : existing.display_name,
      avatar_url: input.avatarUrl !== undefined ? input.avatarUrl : existing.avatar_url,
      updated_at: now,
    };
    await this.batchWithOutbox([
      this.db.prepare(`
        UPDATE profiles
        SET email = ?, display_name = ?, avatar_url = ?, updated_at = ?
        WHERE id = ?
      `).bind(row.email, row.display_name, row.avatar_url, row.updated_at, input.userId),
    ], [rowStateEvent("profiles", input.userId, row, `profiles:${input.userId}:profile-update:${now}`)]);
    return mapProfile(row);
  }

  async getCredits(userId: string): Promise<number> {
    const row = await this.first<{ credits: number }>("SELECT credits FROM profiles WHERE id = ?", userId);
    return centiCreditToCredits(row?.credits ?? 0);
  }

  async createGenerationTask(input: CreateGenerationTaskInput): Promise<GenerationTask> {
    const existing = await this.first<RawRow>("SELECT * FROM generation_tasks WHERE request_id = ?", input.requestId);
    if (existing) return mapGenerationTask(existing);

    const now = input.now ?? nowIso();
    const row = {
      id: input.id ?? randomId(),
      request_id: input.requestId,
      user_id: input.userId,
      status: "queued",
      model_id: input.modelId,
      prompt: input.prompt ?? null,
      input_params: jsonToD1(input.inputParams, {}),
      credits_required: creditsToCentiCredit(input.creditsRequired, "generation_tasks.credits_required"),
      deduction_status: "not_charged",
      deduction_id: null,
      charged_at: null,
      refunded_at: null,
      result_image_url: null,
      result_payload: null,
      error_code: null,
      error_message: null,
      started_at: null,
      completed_at: null,
      created_at: now,
      updated_at: now,
    };

    await this.batchWithOutbox([
      this.db.prepare(`
        INSERT INTO generation_tasks (
          id, request_id, user_id, status, model_id, prompt, input_params, credits_required,
          deduction_status, deduction_id, charged_at, refunded_at, result_image_url, result_payload,
          error_code, error_message, started_at, completed_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        row.id, row.request_id, row.user_id, row.status, row.model_id, row.prompt, row.input_params,
        row.credits_required, row.deduction_status, row.deduction_id, row.charged_at, row.refunded_at,
        row.result_image_url, row.result_payload, row.error_code, row.error_message, row.started_at,
        row.completed_at, row.created_at, row.updated_at,
      ),
    ], [rowStateEvent("generation_tasks", row.id, row, `generation_tasks:${row.request_id}:create`)]);

    return mapGenerationTask(row);
  }

  async getGenerationTask(taskId: string): Promise<GenerationTask | null> {
    const row = await this.first<RawRow>("SELECT * FROM generation_tasks WHERE id = ?", taskId);
    return row ? mapGenerationTask(row) : null;
  }

  async getGenerationTaskByRequestId(requestId: string): Promise<GenerationTask | null> {
    const row = await this.first<RawRow>("SELECT * FROM generation_tasks WHERE request_id = ?", requestId);
    return row ? mapGenerationTask(row) : null;
  }

  async getUserGenerationTask(input: { taskId: string; userId: string }): Promise<GenerationTask | null> {
    const row = await this.first<RawRow>("SELECT * FROM generation_tasks WHERE id = ? AND user_id = ?", input.taskId, input.userId);
    return row ? mapGenerationTask(row) : null;
  }

  async listUserGenerationTasks(input: {
    userId: string;
    statuses?: GenerationTask["status"][];
    deductionStatus?: GenerationTask["deduction_status"];
    limit?: number;
    order?: "asc" | "desc";
  }): Promise<GenerationTask[]> {
    const { where, values } = buildTaskFilter(input);
    const order = input.order === "desc" ? "DESC" : "ASC";
    const limitSql = input.limit ? " LIMIT ?" : "";
    const rows = await this.all<RawRow>(
      `SELECT * FROM generation_tasks WHERE ${where} ORDER BY created_at ${order}${limitSql}`,
      ...compactBind([...values, input.limit]),
    );
    return rows.map(mapGenerationTask);
  }

  async countUserGenerationTasks(input: {
    userId: string;
    statuses?: GenerationTask["status"][];
    deductionStatus?: GenerationTask["deduction_status"];
  }): Promise<number> {
    const { where, values } = buildTaskFilter(input);
    const row = await this.first<{ count: number }>(`SELECT COUNT(*) AS count FROM generation_tasks WHERE ${where}`, ...values);
    return Number(row?.count ?? 0);
  }

  async claimQueuedGenerationTask(input: { taskId: string; userId: string; now?: string }): Promise<GenerationTask | null> {
    const existing = await this.first<RawRow>(
      "SELECT * FROM generation_tasks WHERE id = ? AND user_id = ? AND status = 'queued' AND deduction_status = 'not_charged'",
      input.taskId,
      input.userId,
    );
    if (!existing) return null;
    const now = input.now ?? nowIso();
    const next = { ...existing, status: "running", started_at: now, updated_at: now };
    await this.batchWithOutbox([
      this.db.prepare(`
        UPDATE generation_tasks
        SET status = 'running', started_at = ?, updated_at = ?
        WHERE id = ? AND user_id = ? AND status = 'queued' AND deduction_status = 'not_charged'
      `).bind(now, now, input.taskId, input.userId),
    ], [rowStateEvent("generation_tasks", input.taskId, next, `generation_tasks:${input.taskId}:claim:${now}`)]);
    return mapGenerationTask(next);
  }

  async cancelUserQueuedGenerationTasks(input: { userId: string; now?: string }): Promise<number> {
    const rows = await this.all<RawRow>(`
      SELECT * FROM generation_tasks
      WHERE user_id = ? AND deduction_status = 'not_charged' AND status IN ('queued', 'running')
    `, input.userId);
    if (rows.length === 0) return 0;
    const now = input.now ?? nowIso();
    const nextRows: RawRow[] = rows.map((row) => ({ ...row, status: "canceled", completed_at: now, updated_at: now }));
    await this.batchWithOutbox([
      this.db.prepare(`
        UPDATE generation_tasks
        SET status = 'canceled', completed_at = ?, updated_at = ?
        WHERE user_id = ? AND deduction_status = 'not_charged' AND status IN ('queued', 'running')
      `).bind(now, now, input.userId),
    ], nextRows.map((row) => rowStateEvent("generation_tasks", String(row.id), row, `generation_tasks:${String(row.id)}:cancel:${now}`)));
    return rows.length;
  }

  async cancelQueuedGenerationTask(input: { taskId: string; userId: string; now?: string }): Promise<GenerationTask | null> {
    const existing = await this.first<RawRow>(
      "SELECT * FROM generation_tasks WHERE id = ? AND user_id = ? AND status = 'queued' AND deduction_status = 'not_charged'",
      input.taskId,
      input.userId,
    );
    if (!existing) return null;
    const now = input.now ?? nowIso();
    const next = { ...existing, status: "canceled", completed_at: now, updated_at: now };
    await this.batchWithOutbox([
      this.db.prepare(`
        UPDATE generation_tasks
        SET status = 'canceled', completed_at = ?, updated_at = ?
        WHERE id = ? AND user_id = ? AND status = 'queued' AND deduction_status = 'not_charged'
      `).bind(now, now, input.taskId, input.userId),
    ], [rowStateEvent("generation_tasks", input.taskId, next, `generation_tasks:${input.taskId}:cancel:${now}`)]);
    return mapGenerationTask(next);
  }

  async updateGenerationTaskLifecycle(input: UpdateGenerationTaskLifecycleInput): Promise<GenerationTask> {
    const existing = await this.getUserScopedTaskForUpdate(input.taskId, input.userId);
    if (!existing) throw new Error("generation task not found");
    const now = input.now ?? nowIso();
    const next = {
      ...existing.raw,
      status: input.status ?? existing.raw.status,
      deduction_status: input.deductionStatus ?? existing.raw.deduction_status,
      deduction_id: input.deductionId !== undefined ? input.deductionId : existing.raw.deduction_id,
      charged_at: input.chargedAt !== undefined ? input.chargedAt : existing.raw.charged_at,
      refunded_at: input.refundedAt !== undefined ? input.refundedAt : existing.raw.refunded_at,
      result_image_url: input.resultImageUrl !== undefined ? input.resultImageUrl : existing.raw.result_image_url,
      result_payload: input.resultPayload !== undefined ? jsonToD1(input.resultPayload, null) : existing.raw.result_payload,
      error_code: input.errorCode !== undefined ? input.errorCode : existing.raw.error_code,
      error_message: input.errorMessage !== undefined ? input.errorMessage : existing.raw.error_message,
      started_at: input.startedAt !== undefined ? input.startedAt : existing.raw.started_at,
      completed_at: input.completedAt !== undefined ? input.completedAt : existing.raw.completed_at,
      updated_at: now,
    };

    await this.batchWithOutbox([
      this.db.prepare(`
        UPDATE generation_tasks
        SET status = ?, deduction_status = ?, deduction_id = ?, charged_at = ?, refunded_at = ?,
            result_image_url = ?, result_payload = ?, error_code = ?, error_message = ?,
            started_at = ?, completed_at = ?, updated_at = ?
        WHERE id = ? ${input.userId ? "AND user_id = ?" : ""}
      `).bind(...compactBind([
        bindValue(next.status), bindValue(next.deduction_status), bindValue(next.deduction_id), bindValue(next.charged_at), bindValue(next.refunded_at),
        bindValue(next.result_image_url), bindValue(next.result_payload), bindValue(next.error_code), bindValue(next.error_message),
        bindValue(next.started_at), bindValue(next.completed_at), bindValue(next.updated_at), input.taskId, input.userId,
      ])),
    ], [rowStateEvent("generation_tasks", input.taskId, next, `generation_tasks:${input.taskId}:lifecycle:${now}`)]);
    return mapGenerationTask(next);
  }

  async consumeCreditsForGeneration(input: ConsumeCreditsForGenerationInput): Promise<ConsumeCreditsResult> {
    const now = input.now ?? nowIso();
    const idempotencyKey = input.idempotencyKey ?? (input.historyId ? `history:${input.historyId}` : null);
    if (idempotencyKey) {
      const existingLedger = await this.first<RawRow>("SELECT * FROM credit_usage_logs WHERE idempotency_key = ?", idempotencyKey);
      if (existingLedger) {
        return {
          success: true,
          message: "already charged",
          credits: await this.getCredits(input.userId),
          cost: centiCreditToCredits(existingLedger.amount as number),
          history_id: asNullableString(existingLedger.generation_history_id),
        };
      }
    }
    const model = await this.readEnabledModel(input.modelKey);
    if (!model) return { success: false, message: "model not found or disabled", credits: 0, cost: 0, history_id: null };
    const costCenti = input.cost == null ? Number(model.cost) : creditsToCentiCredit(input.cost, "generation.cost");
    const profile = await this.ensureProfile({ id: input.userId, now });
    const currentCenti = creditsToCentiCredit(profile.credits, "profiles.credits");
    if (currentCenti < costCenti) {
      return { success: false, message: "insufficient credits", credits: profile.credits, cost: centiCreditToCredits(costCenti), history_id: null };
    }

    const historyId = input.historyId ?? randomId();
    const ledgerId = input.ledgerId ?? randomId();
    const ledgerKey = idempotencyKey ?? `history:${historyId}`;
    const creditsAfterCenti = currentCenti - costCenti;
    const historyRow = {
      id: historyId,
      user_id: input.userId,
      model: String(model.name),
      cost: costCenti,
      prompt: input.prompt ?? "",
      image_url: null,
      created_at: now,
      generation_task_id: input.generationTaskId ?? null,
    };
    const ledgerRow = {
      id: ledgerId,
      user_id: input.userId,
      amount: costCenti,
      source: input.generationTaskId ? "generation_task" : "legacy_generation",
      model_key: input.modelKey,
      model_name: input.modelName ?? String(model.name),
      generation_history_id: historyId,
      generation_task_id: input.generationTaskId ?? null,
      idempotency_key: ledgerKey,
      created_at: now,
      metadata: jsonToD1({ prompt: input.prompt ?? "" }, {}),
    };
    const profileRow = { ...profileToRaw(profile), credits: creditsAfterCenti, updated_at: now };

    await this.batchWithOutbox([
      this.db.prepare("UPDATE profiles SET credits = ?, updated_at = ? WHERE id = ? AND credits >= ?")
        .bind(creditsAfterCenti, now, input.userId, costCenti),
      this.db.prepare(`
        INSERT INTO generation_history (id, user_id, model, cost, prompt, image_url, created_at, generation_task_id)
        SELECT ?, ?, ?, ?, ?, ?, ?, ?
        WHERE EXISTS (SELECT 1 FROM profiles WHERE id = ? AND credits = ? AND updated_at = ?)
      `).bind(historyRow.id, historyRow.user_id, historyRow.model, historyRow.cost, historyRow.prompt, historyRow.image_url, historyRow.created_at, historyRow.generation_task_id, input.userId, creditsAfterCenti, now),
      this.db.prepare(`
        INSERT INTO credit_usage_logs (id, user_id, amount, source, model_key, model_name, generation_history_id, generation_task_id, idempotency_key, created_at, metadata)
        SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        WHERE EXISTS (SELECT 1 FROM generation_history WHERE id = ?)
      `).bind(ledgerRow.id, ledgerRow.user_id, ledgerRow.amount, ledgerRow.source, ledgerRow.model_key, ledgerRow.model_name, ledgerRow.generation_history_id, ledgerRow.generation_task_id, ledgerRow.idempotency_key, ledgerRow.created_at, ledgerRow.metadata, historyId),
    ], [
      rowStateEvent("profiles", input.userId, profileRow, `profiles:${input.userId}:consume:${ledgerKey}`),
      rowStateEvent("generation_history", historyId, historyRow, `generation_history:${historyId}:consume`),
      rowStateEvent("credit_usage_logs", ledgerId, ledgerRow, `credit_usage_logs:${ledgerKey}`),
    ]);

    return { success: true, message: "charged", credits: centiCreditToCredits(creditsAfterCenti), cost: centiCreditToCredits(costCenti), history_id: historyId };
  }

  async finalizeUserGenerationTaskOnce(input: FinalizeGenerationTaskInput): Promise<FinalizeGenerationTaskResult> {
    if (!input.imageUrl.trim()) {
      return { success: false, message: "image url is required", credits: 0, cost: 0, history_id: null, deduction_status: null };
    }
    const now = input.now ?? nowIso();
    const task = await this.getUserGenerationTask({ taskId: input.taskId, userId: input.userId });
    if (!task) {
      return { success: false, message: "task not found or not owned by current user", credits: 0, cost: 0, history_id: null, deduction_status: null };
    }
    const existingHistory = await this.first<RawRow>("SELECT * FROM generation_history WHERE generation_task_id = ?", input.taskId);
    if (task.deduction_status === "charged") {
      return {
        success: true,
        message: "already finalized",
        credits: await this.getCredits(input.userId),
        cost: task.credits_required,
        history_id: existingHistory?.id == null ? task.deduction_id : String(existingHistory.id),
        deduction_status: "charged",
      };
    }
    if (task.deduction_status !== "not_charged") {
      return { success: false, message: "task deduction status is not finalizable", credits: await this.getCredits(input.userId), cost: task.credits_required, history_id: null, deduction_status: task.deduction_status };
    }
    if (!new Set(["running", "succeeded"]).has(task.status)) {
      return { success: false, message: "task status is not finalizable", credits: await this.getCredits(input.userId), cost: task.credits_required, history_id: null, deduction_status: task.deduction_status };
    }

    const model = await this.readEnabledModel(task.model_id);
    if (!model) {
      await this.updateGenerationTaskLifecycle({ taskId: input.taskId, userId: input.userId, errorMessage: "model not found or disabled", now });
      return { success: false, message: "model not found or disabled", credits: await this.getCredits(input.userId), cost: 0, history_id: null, deduction_status: task.deduction_status };
    }

    const costCenti = Number(model.cost);
    const profile = await this.ensureProfile({ id: input.userId, now });
    const currentCenti = creditsToCentiCredit(profile.credits, "profiles.credits");
    if (currentCenti < costCenti) {
      await this.updateGenerationTaskLifecycle({ taskId: input.taskId, userId: input.userId, errorMessage: "insufficient credits", now });
      return { success: false, message: "insufficient credits", credits: profile.credits, cost: centiCreditToCredits(costCenti), history_id: null, deduction_status: task.deduction_status };
    }

    const historyId = input.historyId ?? randomId();
    const ledgerId = input.ledgerId ?? randomId();
    const ledgerKey = `task:${input.taskId}`;
    const creditsAfterCenti = currentCenti - costCenti;
    const historyRow = {
      id: historyId,
      user_id: input.userId,
      model: String(model.name),
      cost: costCenti,
      prompt: task.prompt ?? "",
      image_url: input.imageUrl,
      created_at: now,
      generation_task_id: input.taskId,
    };
    const ledgerRow = {
      id: ledgerId,
      user_id: input.userId,
      amount: costCenti,
      source: "generation_task",
      model_key: task.model_id,
      model_name: String(model.name),
      generation_history_id: historyId,
      generation_task_id: input.taskId,
      idempotency_key: ledgerKey,
      created_at: now,
      metadata: jsonToD1({ prompt: task.prompt ?? "" }, {}),
    };
    const taskRow = {
      ...generationTaskToRaw(task),
      status: "succeeded",
      deduction_status: "charged",
      deduction_id: historyId,
      charged_at: now,
      result_image_url: input.imageUrl,
      result_payload: input.resultPayload == null ? null : jsonToD1(input.resultPayload, null),
      completed_at: task.completed_at ?? now,
      updated_at: now,
      error_message: null,
    };
    const profileRow = { ...profileToRaw(profile), credits: creditsAfterCenti, updated_at: now };

    await this.batchWithOutbox([
      this.db.prepare(`
        UPDATE profiles
        SET credits = ?, updated_at = ?
        WHERE id = ?
          AND credits >= ?
          AND EXISTS (
            SELECT 1 FROM generation_tasks
            WHERE id = ? AND user_id = ? AND deduction_status = 'not_charged' AND status IN ('running', 'succeeded')
          )
          AND NOT EXISTS (SELECT 1 FROM generation_history WHERE generation_task_id = ?)
      `).bind(creditsAfterCenti, now, input.userId, costCenti, input.taskId, input.userId, input.taskId),
      this.db.prepare(`
        INSERT INTO generation_history (id, user_id, model, cost, prompt, image_url, created_at, generation_task_id)
        SELECT ?, ?, ?, ?, ?, ?, ?, ?
        WHERE EXISTS (SELECT 1 FROM profiles WHERE id = ? AND credits = ? AND updated_at = ?)
      `).bind(historyRow.id, historyRow.user_id, historyRow.model, historyRow.cost, historyRow.prompt, historyRow.image_url, historyRow.created_at, historyRow.generation_task_id, input.userId, creditsAfterCenti, now),
      this.db.prepare(`
        INSERT INTO credit_usage_logs (id, user_id, amount, source, model_key, model_name, generation_history_id, generation_task_id, idempotency_key, created_at, metadata)
        SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        WHERE EXISTS (SELECT 1 FROM generation_history WHERE id = ?)
      `).bind(ledgerRow.id, ledgerRow.user_id, ledgerRow.amount, ledgerRow.source, ledgerRow.model_key, ledgerRow.model_name, ledgerRow.generation_history_id, ledgerRow.generation_task_id, ledgerRow.idempotency_key, ledgerRow.created_at, ledgerRow.metadata, historyId),
      this.db.prepare(`
        UPDATE generation_tasks
        SET status = 'succeeded', deduction_status = 'charged', deduction_id = ?, charged_at = ?,
            result_image_url = ?, result_payload = ?, completed_at = COALESCE(completed_at, ?),
            updated_at = ?, error_message = NULL
        WHERE id = ? AND user_id = ? AND deduction_status = 'not_charged'
          AND EXISTS (SELECT 1 FROM credit_usage_logs WHERE idempotency_key = ?)
      `).bind(historyId, now, input.imageUrl, taskRow.result_payload, now, now, input.taskId, input.userId, ledgerKey),
    ], [
      rowStateEvent("profiles", input.userId, profileRow, `profiles:${input.userId}:finalize:${input.taskId}`),
      rowStateEvent("generation_history", historyId, historyRow, `generation_history:${historyId}:finalize`),
      rowStateEvent("credit_usage_logs", ledgerId, ledgerRow, `credit_usage_logs:${ledgerKey}`),
      rowStateEvent("generation_tasks", input.taskId, taskRow, `generation_tasks:${input.taskId}:finalize`),
    ]);

    return { success: true, message: "finalized", credits: centiCreditToCredits(creditsAfterCenti), cost: centiCreditToCredits(costCenti), history_id: historyId, deduction_status: "charged" };
  }

  async getGenerationHistory(input: { historyId: string; userId?: string }): Promise<GenerationHistory | null> {
    const row = input.userId
      ? await this.first<RawRow>("SELECT * FROM generation_history WHERE id = ? AND user_id = ?", input.historyId, input.userId)
      : await this.first<RawRow>("SELECT * FROM generation_history WHERE id = ?", input.historyId);
    return row ? mapGenerationHistory(row) : null;
  }

  async listGenerationHistory(input: {
    userId?: string;
    since?: string;
    imageOnly?: boolean;
    limit: number;
    offset: number;
  }): Promise<{ rows: GenerationHistory[]; total: number }> {
    const clauses: string[] = [];
    const values: BoundValue[] = [];
    if (input.imageOnly) clauses.push("image_url IS NOT NULL");
    if (input.userId) {
      clauses.push("user_id = ?");
      values.push(input.userId);
    }
    if (input.since) {
      clauses.push("created_at >= ?");
      values.push(input.since);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const totalRow = await this.first<{ count: number }>(`SELECT COUNT(*) AS count FROM generation_history ${where}`, ...values);
    const rows = await this.all<RawRow>(
      `SELECT * FROM generation_history ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      ...values,
      input.limit,
      input.offset,
    );
    return { rows: rows.map(mapGenerationHistory), total: Number(totalRow?.count ?? 0) };
  }

  async getGenerationTasksByIds(taskIds: string[]): Promise<GenerationTask[]> {
    if (taskIds.length === 0) return [];
    const placeholders = taskIds.map(() => "?").join(", ");
    const rows = await this.all<RawRow>(`SELECT * FROM generation_tasks WHERE id IN (${placeholders})`, ...taskIds);
    return rows.map(mapGenerationTask);
  }

  async getProfilesByIds(userIds: string[]): Promise<Profile[]> {
    if (userIds.length === 0) return [];
    const placeholders = userIds.map(() => "?").join(", ");
    const rows = await this.all<RawRow>(`SELECT * FROM profiles WHERE id IN (${placeholders})`, ...userIds);
    return rows.map(mapProfile);
  }

  async setGenerationHistoryImageUrl(input: { historyId: string; userId: string; imageUrl: string; now?: string }): Promise<GenerationHistory> {
    const existing = await this.first<RawRow>("SELECT * FROM generation_history WHERE id = ? AND user_id = ?", input.historyId, input.userId);
    if (!existing) throw new Error("history not found");
    const row = { ...existing, image_url: input.imageUrl };
    await this.batchWithOutbox([
      this.db.prepare("UPDATE generation_history SET image_url = ? WHERE id = ? AND user_id = ?")
        .bind(input.imageUrl, input.historyId, input.userId),
    ], [rowStateEvent("generation_history", input.historyId, row, `generation_history:${input.historyId}:image:${input.now ?? nowIso()}`)]);
    return mapGenerationHistory(row);
  }

  async setLatestGenerationHistoryImageUrl(): Promise<void> {
    throw new Error("D1 history image updates require an explicit history_id");
  }

  async createUserOrder(input: { id?: string; userId: string; outTradeNo: string; amount: number; credits: number; payType?: string | null; now?: string }): Promise<UserOrder> {
    const existing = await this.first<RawRow>("SELECT * FROM user_orders WHERE out_trade_no = ?", input.outTradeNo);
    if (existing) return mapUserOrder(existing);
    const now = input.now ?? nowIso();
    const row = {
      id: input.id ?? randomId(),
      user_id: input.userId,
      out_trade_no: input.outTradeNo,
      amount: yuanToFen(input.amount, "user_orders.amount"),
      credits: creditsToCentiCredit(input.credits, "user_orders.credits"),
      status: "pending",
      pay_type: input.payType ?? null,
      trade_no: null,
      paid_at: null,
      created_at: now,
      updated_at: now,
    };
    await this.batchWithOutbox([
      this.db.prepare(`
        INSERT INTO user_orders (id, user_id, out_trade_no, amount, credits, status, pay_type, trade_no, paid_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(row.id, row.user_id, row.out_trade_no, row.amount, row.credits, row.status, row.pay_type, row.trade_no, row.paid_at, row.created_at, row.updated_at),
    ], [rowStateEvent("user_orders", row.id, row, `user_orders:${row.out_trade_no}:create`)]);
    return mapUserOrder(row);
  }

  async getUserOrder(input: { outTradeNo: string; userId: string }): Promise<UserOrder | null> {
    const row = await this.first<RawRow>("SELECT * FROM user_orders WHERE out_trade_no = ? AND user_id = ?", input.outTradeNo, input.userId);
    return row ? mapUserOrder(row) : null;
  }

  async getOrderByOutTradeNo(outTradeNo: string): Promise<UserOrder | null> {
    const row = await this.first<RawRow>("SELECT * FROM user_orders WHERE out_trade_no = ?", outTradeNo);
    return row ? mapUserOrder(row) : null;
  }

  async completePaidOrder(input: CompletePaidOrderInput): Promise<CompletePaidOrderResult> {
    const now = input.now ?? nowIso();
    const order = await this.first<RawRow>("SELECT * FROM user_orders WHERE out_trade_no = ?", input.outTradeNo);
    if (!order) return { success: false, message: "order not found", order: null, credits: null, alreadyPaid: false };
    if (order.status === "paid") {
      return { success: true, message: "already paid", order: mapUserOrder(order), credits: centiCreditToCredits(order.credits as number), alreadyPaid: true };
    }
    if (order.status !== "pending") {
      return { success: false, message: "order is not pending", order: mapUserOrder(order), credits: null, alreadyPaid: false };
    }
    const profile = await this.ensureProfile({ id: String(order.user_id), now });
    const amountCenti = Number(order.credits);
    const creditsAfterCenti = creditsToCentiCredit(profile.credits, "profiles.credits") + amountCenti;
    const ledgerKey = `payment:${input.outTradeNo}`;
    const ledgerRow = {
      id: randomId(),
      user_id: String(order.user_id),
      amount: amountCenti,
      source: "payment",
      model_key: null,
      model_name: null,
      generation_history_id: null,
      generation_task_id: null,
      idempotency_key: ledgerKey,
      created_at: now,
      metadata: jsonToD1({ direction: "credit", reason: "payment", out_trade_no: input.outTradeNo, order_id: String(order.id) }, {}),
    };
    const orderRow = { ...order, status: "paid", trade_no: input.tradeNo, paid_at: now, updated_at: now };
    const profileRow = { ...profileToRaw(profile), credits: creditsAfterCenti, updated_at: now };
    const ledgerCondition = { sql: "EXISTS (SELECT 1 FROM credit_usage_logs WHERE idempotency_key = ?)", values: [ledgerKey] };

    const results = await this.batchWithOutbox([
      this.db.prepare("UPDATE user_orders SET status = 'paid', trade_no = ?, paid_at = ?, updated_at = ? WHERE out_trade_no = ? AND status = 'pending'")
        .bind(input.tradeNo, now, now, input.outTradeNo),
      this.db.prepare(`
        UPDATE profiles
        SET credits = credits + ?, updated_at = ?
        WHERE id = ? AND changes() = 1
      `).bind(amountCenti, now, order.user_id as string),
      this.db.prepare(`
        INSERT INTO credit_usage_logs (
          id, user_id, amount, source, model_key, model_name, generation_history_id, generation_task_id, idempotency_key, created_at, metadata
        ) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE changes() = 1
      `).bind(
        ledgerRow.id, ledgerRow.user_id, ledgerRow.amount, ledgerRow.source, ledgerRow.model_key, ledgerRow.model_name,
        ledgerRow.generation_history_id, ledgerRow.generation_task_id, ledgerRow.idempotency_key, ledgerRow.created_at, ledgerRow.metadata,
      ),
    ], [
      { ...rowStateEvent("user_orders", String(order.id), orderRow, `user_orders:${input.outTradeNo}:paid`), condition: ledgerCondition },
      { ...rowStateEvent("profiles", String(order.user_id), profileRow, `profiles:${String(order.user_id)}:order:${input.outTradeNo}`), condition: ledgerCondition },
      { ...rowStateEvent("credit_usage_logs", ledgerRow.id, ledgerRow, `credit_usage_logs:${ledgerKey}`), condition: ledgerCondition },
    ]);

    if (Number((results[0] as D1RunResult | undefined)?.meta?.changes ?? 0) !== 1) {
      const paidOrder = await this.getOrderByOutTradeNo(input.outTradeNo);
      return { success: true, message: "already paid", order: paidOrder, credits: paidOrder?.credits ?? null, alreadyPaid: true };
    }

    return { success: true, message: "paid", order: mapUserOrder(orderRow), credits: centiCreditToCredits(Number(order.credits)), alreadyPaid: false };
  }

  async redeemCoupon(input: RedeemCouponInput): Promise<RedeemCouponResult> {
    const code = input.code.trim();
    const now = input.now ?? nowIso();
    const coupon = await this.first<RawRow>("SELECT * FROM coupons WHERE code = ?", code);
    if (!coupon) return { success: false, message: "卡密无效", amount: 0, credits: await this.getCredits(input.userId), redeem_log_id: null };
    if (boolFromD1(coupon.is_used)) return { success: false, message: "卡密已被使用", amount: 0, credits: await this.getCredits(input.userId), redeem_log_id: null };
    const profile = await this.ensureProfile({ id: input.userId, email: input.userEmail ?? null, now });
    const redeemLogId = input.redeemLogId ?? randomId();
    const amountCenti = Number(coupon.amount);
    const creditsAfterCenti = creditsToCentiCredit(profile.credits, "profiles.credits") + amountCenti;
    const ledgerKey = `coupon:${code}`;
    const couponRow = { ...coupon, is_used: 1, used_by: input.userId, used_by_email: input.userEmail ?? (profile.email ?? null), used_at: now };
    const profileRow = { ...profileToRaw(profile), credits: creditsAfterCenti, updated_at: now };
    const redeemRow = {
      id: redeemLogId,
      user_id: input.userId,
      code,
      amount: amountCenti,
      success: 1,
      error_message: null,
      redeemed_at: now,
    };
    const ledgerRow = {
      id: ledgerKey,
      user_id: input.userId,
      amount: amountCenti,
      source: "coupon_redeem",
      model_key: null,
      model_name: null,
      generation_history_id: null,
      generation_task_id: null,
      idempotency_key: ledgerKey,
      created_at: now,
      metadata: jsonToD1({ direction: "credit", reason: "coupon_redeem", coupon_code: code, redeem_log_id: redeemLogId }, {}),
    };
    const redeemCondition = { sql: "EXISTS (SELECT 1 FROM redeem_logs WHERE id = ?)", values: [redeemLogId] };

    const results = await this.batchWithOutbox([
      this.db.prepare("UPDATE coupons SET is_used = 1, used_by = ?, used_by_email = ?, used_at = ? WHERE code = ? AND is_used = 0")
        .bind(input.userId, couponRow.used_by_email as string | null, now, code),
      this.db.prepare(`
        UPDATE profiles
        SET credits = credits + ?, updated_at = ?
        WHERE id = ? AND changes() = 1
      `).bind(amountCenti, now, input.userId),
      this.db.prepare(`
        INSERT INTO credit_usage_logs (
          id, user_id, amount, source, model_key, model_name, generation_history_id, generation_task_id, idempotency_key, created_at, metadata
        ) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE changes() = 1
      `).bind(
        ledgerRow.id, ledgerRow.user_id, ledgerRow.amount, ledgerRow.source, ledgerRow.model_key, ledgerRow.model_name,
        ledgerRow.generation_history_id, ledgerRow.generation_task_id, ledgerRow.idempotency_key, ledgerRow.created_at, ledgerRow.metadata,
      ),
      this.db.prepare(`
        INSERT INTO redeem_logs (id, user_id, code, amount, success, error_message, redeemed_at)
        SELECT ?, ?, ?, ?, 1, NULL, ? WHERE changes() = 1
      `).bind(redeemRow.id, redeemRow.user_id, redeemRow.code, redeemRow.amount, redeemRow.redeemed_at),
    ], [
      { ...rowStateEvent("coupons", String(coupon.id), couponRow, `coupons:${code}:redeem`), condition: redeemCondition },
      { ...rowStateEvent("profiles", input.userId, profileRow, `profiles:${input.userId}:coupon:${code}`), condition: redeemCondition },
      { ...rowStateEvent("credit_usage_logs", ledgerRow.id, ledgerRow, `credit_usage_logs:${ledgerKey}`), condition: redeemCondition },
      { ...rowStateEvent("redeem_logs", redeemLogId, redeemRow, `redeem_logs:${redeemLogId}:redeem`), condition: redeemCondition },
    ]);

    if (Number((results[0] as D1RunResult | undefined)?.meta?.changes ?? 0) !== 1) {
      return { success: false, message: "卡密已被使用", amount: 0, credits: await this.getCredits(input.userId), redeem_log_id: null };
    }

    return { success: true, message: "兑换成功", amount: centiCreditToCredits(amountCenti), credits: centiCreditToCredits(creditsAfterCenti), redeem_log_id: redeemLogId };
  }

  async listModelsConfig(input: { includeSecrets?: boolean; enabledOnly?: boolean } = {}): Promise<ModelConfig[]> {
    const columns = input.includeSecrets
      ? "*"
      : "id, model_key, name, description, cost, sort_order, extra_params, is_enabled, updated_at";
    const rows = input.enabledOnly === false
      ? await this.all<RawRow>(`SELECT ${columns} FROM models_config ORDER BY sort_order ASC`)
      : await this.all<RawRow>(`SELECT ${columns} FROM models_config WHERE is_enabled = 1 ORDER BY sort_order ASC`);
    return rows.map(mapModelConfig);
  }

  async getGlobalConfig(): Promise<Record<string, unknown> | null> {
    return await this.first<RawRow>("SELECT * FROM global_config LIMIT 1");
  }

  async getAdminSettings(): Promise<Record<string, unknown> | null> {
    return await this.first<RawRow>("SELECT * FROM admin_settings WHERE id = 1 LIMIT 1");
  }

  async listAnnouncements(): Promise<Record<string, unknown>[]> {
    return await this.all<RawRow>("SELECT * FROM announcements ORDER BY created_at DESC");
  }

  async listAds(): Promise<Record<string, unknown>[]> {
    return await this.all<RawRow>("SELECT * FROM ads ORDER BY sort_order ASC");
  }

  async listStyleTemplates(): Promise<Record<string, unknown>[]> {
    return await this.all<RawRow>("SELECT * FROM style_templates ORDER BY sort_order ASC");
  }

  async listRechargePackages(): Promise<RechargePackage[]> {
    const rows = await this.all<RawRow>("SELECT * FROM recharge_packages WHERE is_visible = 1 ORDER BY sort_order ASC");
    return rows.map(mapRechargePackage);
  }

  async getReplicationHealth(now = new Date()) {
    const pending = await this.first<{ pendingReplication: number; oldestPendingAt: string | null }>(`
      SELECT COUNT(*) AS pendingReplication, MIN(created_at) AS oldestPendingAt
      FROM replication_outbox
      WHERE status IN ('pending', 'processing', 'failed')
    `);
    const success = await this.first<{ lastReplicationAt: string | null }>(`
      SELECT MAX(synced_at) AS lastReplicationAt
      FROM replication_outbox
      WHERE status = 'synced'
    `);
    const oldestPendingSeconds = pending?.oldestPendingAt
      ? Math.max(0, Math.floor((now.getTime() - new Date(pending.oldestPendingAt).getTime()) / 1000))
      : null;
    return {
      d1Primary: true,
      pendingReplication: Number(pending?.pendingReplication ?? 0),
      oldestPendingSeconds,
      lastReplicationAt: success?.lastReplicationAt ?? null,
    };
  }

  private async readEnabledModel(modelKey: string): Promise<RawRow | null> {
    return await this.first<RawRow>("SELECT * FROM models_config WHERE model_key = ? AND is_enabled = 1", modelKey);
  }

  private async getUserScopedTaskForUpdate(taskId: string, userId?: string): Promise<{ raw: RawRow } | null> {
    const row = userId
      ? await this.first<RawRow>("SELECT * FROM generation_tasks WHERE id = ? AND user_id = ?", taskId, userId)
      : await this.first<RawRow>("SELECT * FROM generation_tasks WHERE id = ?", taskId);
    return row ? { raw: row } : null;
  }

  private async first<T = RawRow>(sql: string, ...values: BoundValue[]): Promise<T | null> {
    return await this.db.prepare(sql).bind(...values).first<T>();
  }

  private async all<T = RawRow>(sql: string, ...values: BoundValue[]): Promise<T[]> {
    const result = await this.db.prepare(sql).bind(...values).all<T>();
    return Array.isArray(result) ? result : result.results ?? [];
  }

  private async batchWithOutbox(businessStatements: D1PreparedStatementLike[], events: ReplicationOutboxEvent[]) {
    if (businessStatements.length === 0) throw new Error("D1 business transaction requires business statements");
    if (events.length === 0) throw new Error("D1 business transaction requires replication outbox events");
    const outbox = events.map((event) => buildReplicationOutboxStatement(this.db, event));
    return await this.db.batch([...businessStatements, ...(outbox as unknown as D1PreparedStatementLike[])]);
  }
}

function rowStateEvent(entityType: ReplicatedEntityType, entityId: string, row: RawRow, idempotencyKey: string) {
  return {
    eventType: `${entityType}.upsert` as ReplicationEventType,
    entityType,
    entityId,
    payload: { row },
    idempotencyKey,
    createdAt: String(row.updated_at ?? row.created_at ?? new Date().toISOString()),
  };
}

function compactBind(values: Array<BoundValue | undefined>): BoundValue[] {
  return values.filter((value): value is BoundValue => value !== undefined);
}

function buildTaskFilter(input: {
  userId: string;
  statuses?: GenerationTask["status"][];
  deductionStatus?: GenerationTask["deduction_status"];
}): { where: string; values: BoundValue[] } {
  const clauses = ["user_id = ?"];
  const values: BoundValue[] = [input.userId];
  if (input.statuses?.length) {
    clauses.push(`status IN (${input.statuses.map(() => "?").join(", ")})`);
    values.push(...input.statuses);
  }
  if (input.deductionStatus) {
    clauses.push("deduction_status = ?");
    values.push(input.deductionStatus);
  }
  return { where: clauses.join(" AND "), values };
}

function bindValue(value: unknown): BoundValue {
  if (value == null) return null;
  if (typeof value === "string" || typeof value === "number") return value;
  return JSON.stringify(value);
}

function mapProfile(row: RawRow): Profile {
  return {
    id: String(row.id),
    email: asNullableString(row.email),
    display_name: asNullableString(row.display_name),
    avatar_url: asNullableString(row.avatar_url),
    credits: centiCreditToCredits(row.credits as number),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function profileToRaw(row: Profile): RawRow {
  return {
    id: row.id,
    email: row.email,
    display_name: row.display_name,
    avatar_url: row.avatar_url,
    credits: creditsToCentiCredit(row.credits, "profiles.credits"),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapGenerationTask(row: RawRow): GenerationTask {
  return {
    id: String(row.id),
    request_id: String(row.request_id),
    user_id: String(row.user_id),
    status: row.status as GenerationTask["status"],
    model_id: String(row.model_id),
    prompt: asNullableString(row.prompt),
    input_params: jsonFromD1(row.input_params) ?? {},
    credits_required: centiCreditToCredits(row.credits_required as number),
    deduction_status: row.deduction_status as GenerationTask["deduction_status"],
    deduction_id: asNullableString(row.deduction_id),
    charged_at: asNullableString(row.charged_at),
    refunded_at: asNullableString(row.refunded_at),
    result_image_url: asNullableString(row.result_image_url),
    result_payload: jsonFromD1(row.result_payload),
    error_code: asNullableString(row.error_code),
    error_message: asNullableString(row.error_message),
    started_at: asNullableString(row.started_at),
    completed_at: asNullableString(row.completed_at),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function generationTaskToRaw(row: GenerationTask): RawRow {
  return {
    ...row,
    input_params: jsonToD1(row.input_params, {}),
    credits_required: creditsToCentiCredit(row.credits_required, "generation_tasks.credits_required"),
    result_payload: row.result_payload == null ? null : jsonToD1(row.result_payload, null),
  };
}

function mapGenerationHistory(row: RawRow): GenerationHistory {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    model: String(row.model),
    cost: centiCreditToCredits(row.cost as number),
    prompt: asNullableString(row.prompt),
    image_url: asNullableString(row.image_url),
    created_at: String(row.created_at),
    generation_task_id: asNullableString(row.generation_task_id),
  };
}

function mapUserOrder(row: RawRow): UserOrder {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    out_trade_no: String(row.out_trade_no),
    amount: fenToYuan(row.amount as number),
    credits: centiCreditToCredits(row.credits as number),
    status: String(row.status),
    pay_type: asNullableString(row.pay_type),
    trade_no: asNullableString(row.trade_no),
    paid_at: asNullableString(row.paid_at),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function mapModelConfig(row: RawRow): ModelConfig {
  return {
    id: String(row.id),
    model_key: String(row.model_key),
    name: String(row.name),
    description: asNullableString(row.description),
    cost: centiCreditToCredits(row.cost as number),
    sort_order: Number(row.sort_order ?? 0),
    api_url: asNullableString(row.api_url),
    api_key: asNullableString(row.api_key),
    request_format: asNullableString(row.request_format),
    prompt_key: asNullableString(row.prompt_key),
    fetch_url: asNullableString(row.fetch_url),
    extra_params: jsonFromD1(row.extra_params),
    is_enabled: row.is_enabled == null ? undefined : boolFromD1(row.is_enabled),
    created_at: asNullableString(row.created_at) ?? undefined,
    updated_at: String(row.updated_at),
  };
}

function mapRechargePackage(row: RawRow): RechargePackage {
  return {
    id: String(row.id),
    title: String(row.title),
    subtitle: asNullableString(row.subtitle),
    price: String(row.price),
    credits: centiCreditToCredits(row.credits as number),
    features: jsonFromD1(row.features) ?? [],
    badge_text: asNullableString(row.badge_text),
    is_popular: boolFromD1(row.is_popular),
    highlighted: boolFromD1(row.highlighted),
    is_visible: boolFromD1(row.is_visible),
    sort_order: Number(row.sort_order ?? 0),
    button_text: String(row.button_text),
    purchase_url: asNullableString(row.purchase_url),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function asNullableString(value: unknown): string | null {
  return value == null ? null : String(value);
}

export function d1Boolean(value: boolean): number {
  return boolToD1(value);
}

export function d1Json(value: JsonValue | null | undefined, fallback?: JsonValue): string {
  return jsonToD1(value, fallback);
}
