// Compile-only projection of the local Wrangler-generated workerd contracts.
// Full generated types are retained in evidence-private/generated-workerd-runtime.d.ts.
// This avoids merging every workerd browser global into the app's DOM typings.
declare module "cloudflare:workers" {
  export abstract class DurableObject<Env = unknown> {
    protected ctx: unknown;
    protected env: Env;
    constructor(ctx: unknown, env: Env);
  }
}
declare const scheduler: { wait(delay: number, options?: { signal?: AbortSignal }): Promise<void> };
