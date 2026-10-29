/**
 * The legacy D1-to-Lovable mirror is intentionally disabled. Historical
 * outbox rows are retained for audit; D1 is the sole business authority.
 */
export type ReplicationRuntimeEnv = Record<string, unknown>;

export type ReplicationProcessorResult = {
  scanned: number;
  synced: number;
  failed: number;
  deferred: number;
  disabled: true;
};

export async function runReplicationBatch(
  _env: ReplicationRuntimeEnv,
  _batchSize = 10,
): Promise<ReplicationProcessorResult> {
  return { scanned: 0, synced: 0, failed: 0, deferred: 0, disabled: true };
}
