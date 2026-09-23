import { definePlugin } from "nitro";

import { runReplicationBatch, type ReplicationRuntimeEnv } from "../src/lib/replication-runtime";

export default definePlugin((nitroApp) => {
  nitroApp.hooks.hook("cloudflare:scheduled", async ({ env, context }) => {
    const task = runReplicationBatch((env ?? {}) as ReplicationRuntimeEnv, 10).catch((error) => {
      console.error("[replication] scheduled batch failed", error instanceof Error ? error.message : "unknown error");
    });
    context.waitUntil(task);
    await task;
  });
});
