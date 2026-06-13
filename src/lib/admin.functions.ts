import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { checkPromptSafety, SAFETY_SERVER_BLOCK_MESSAGE } from "@/lib/promptSafety";
import { pollFoxApiTask, submitFoxApiImageEdit, submitFoxApiImageGenerationTask } from "@/lib/foxapi-backup";

const FOXAPI_BACKUP_MODEL_KEY = "gpt-image-2-backup";

async function assertAdmin(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["admin", "founder"]);
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("无管理员权限");
}

async function assertFounder(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "founder")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("仅创始人可执行该操作");
}

function getBeijingDayRange(now = new Date()) {
  const beijingOffsetMs = 8 * 60 * 60 * 1000;
  const beijingNow = new Date(now.getTime() + beijingOffsetMs);
  const year = beijingNow.getUTCFullYear();
  const month = beijingNow.getUTCMonth();
  const day = beijingNow.getUTCDate();
  const startUtcMs = Date.UTC(year, month, day, 0, 0, 0, 0) - beijingOffsetMs;
  const endUtcMs = startUtcMs + 24 * 60 * 60 * 1000;

  return {
    startUtc: new Date(startUtcMs).toISOString(),
    endUtc: new Date(endUtcMs).toISOString(),
  };
}

// --- Users ---
export const adminListUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data: profiles, error } = await supabaseAdmin
      .from("profiles")
      .select("id, email, display_name, credits, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const { data: usageTotals, error: usageError } = await (supabaseAdmin as any)
      .rpc("admin_credit_usage_totals");
    if (usageError) throw new Error(usageError.message);
    const sumMap = new Map<string, number>();
    for (const r of (usageTotals ?? []) as Array<{ user_id: string; total_spent: number | string }>) {
      sumMap.set(r.user_id, Number(r.total_spent ?? 0));
    }
    const banMap = new Map<string, boolean>();
    const authUsers: Array<{ id: string; email: string | null; created_at: string }> = [];
    try {
      let page = 1;
      while (page < 20) {
        const { data: au, error: aerr } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
        if (aerr) break;
        for (const u of au?.users ?? []) {
          const until = (u as any).banned_until as string | null | undefined;
          banMap.set(u.id, !!until && new Date(until).getTime() > Date.now());
          authUsers.push({ id: u.id, email: u.email ?? null, created_at: (u as any).created_at ?? new Date().toISOString() });
        }
        if (!au || au.users.length < 1000) break;
        page++;
      }
    } catch { /* ignore */ }

    // 合并：以 auth.users 为基准，profile 缺失则用 auth 信息补齐（保证新注册用户也能显示）
    const profileMap = new Map<string, any>();
    for (const p of (profiles ?? []) as any[]) profileMap.set(p.id, p);
    const merged = authUsers.map(au => {
      const p = profileMap.get(au.id);
      return {
        id: au.id,
        email: p?.email ?? au.email,
        display_name: p?.display_name ?? null,
        credits: Number(p?.credits ?? 0),
        created_at: p?.created_at ?? au.created_at,
        total_spent: sumMap.get(au.id) ?? 0,
        is_banned: banMap.get(au.id) ?? false,
      };
    });
    // 若 auth 列表为空（极少数情况），回退到 profiles
    if (merged.length === 0) {
      return (profiles ?? []).map((p: any) => ({
        ...p,
        total_spent: sumMap.get(p.id) ?? 0,
        is_banned: banMap.get(p.id) ?? false,
      }));
    }
    merged.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return merged;
  });

export const adminGetUserCreditUsageLogs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      userId: z.string().uuid(),
      limit: z.number().int().min(1).max(100).optional(),
      offset: z.number().int().min(0).optional(),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const limit = Math.min(100, Math.max(1, Number(data.limit ?? 50)));
    const offset = Math.max(0, Number(data.offset ?? 0));
    const { data: rows, error, count } = await (supabaseAdmin as any)
      .from("credit_usage_logs")
      .select(
        "id, user_id, amount, source, model_key, model_name, generation_history_id, generation_task_id, idempotency_key, created_at, metadata",
        { count: "exact" },
      )
      .eq("user_id", data.userId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw new Error(error.message);

    const historyIds = Array.from(new Set((rows ?? [])
      .map((row: any) => row.generation_history_id)
      .filter((value: unknown): value is string => typeof value === "string" && value.length > 0)));
    const taskIds = Array.from(new Set((rows ?? [])
      .map((row: any) => row.generation_task_id)
      .filter((value: unknown): value is string => typeof value === "string" && value.length > 0)));
    const historyImageById = new Map<string, string | null>();
    const historyImageByTaskId = new Map<string, string | null>();

    if (historyIds.length > 0) {
      const { data: historyRows, error: historyError } = await (supabaseAdmin as any)
        .from("generation_history")
        .select("id, image_url")
        .eq("user_id", data.userId)
        .in("id", historyIds);
      if (historyError) throw new Error(historyError.message);
      for (const history of historyRows ?? []) {
        historyImageById.set(history.id, history.image_url ?? null);
      }
    }

    if (taskIds.length > 0) {
      const { data: taskHistoryRows, error: taskHistoryError } = await (supabaseAdmin as any)
        .from("generation_history")
        .select("generation_task_id, image_url")
        .eq("user_id", data.userId)
        .in("generation_task_id", taskIds);
      if (taskHistoryError) throw new Error(taskHistoryError.message);
      for (const history of taskHistoryRows ?? []) {
        if (history.generation_task_id && !historyImageByTaskId.has(history.generation_task_id)) {
          historyImageByTaskId.set(history.generation_task_id, history.image_url ?? null);
        }
      }
    }

    const items = (rows ?? []).map((row: any) => ({
      ...row,
      image_url: historyImageById.get(row.generation_history_id) ?? historyImageByTaskId.get(row.generation_task_id) ?? null,
    }));

    return {
      items,
      total: count ?? 0,
      limit,
      offset,
    };
  });

export const adminBanUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ userId: z.string().uuid(), banned: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { data: roles } = await supabaseAdmin
      .from("user_roles").select("role").eq("user_id", data.userId);
    if ((roles ?? []).some((r: any) => r.role === "founder")) {
      throw new Error("不能封禁创始人账号");
    }
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      ban_duration: data.banned ? "876000h" : "none",
    } as any);
    if (error) throw new Error(error.message);
    return { ok: true, banned: data.banned };
  });

export const adminDeleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    if (data.userId === context.userId) throw new Error("不能删除自己");
    const { data: roles } = await supabaseAdmin
      .from("user_roles").select("role").eq("user_id", data.userId);
    if ((roles ?? []).some((r: any) => r.role === "founder")) {
      throw new Error("不能删除创始人账号");
    }
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId);
    await supabaseAdmin.from("generation_history").delete().eq("user_id", data.userId);
    await supabaseAdmin.from("profiles").delete().eq("id", data.userId);
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminResetPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ userId: z.string().uuid(), newPassword: z.string().min(6).max(72) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      password: data.newPassword,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminAdjustCredits = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ userId: z.string().uuid(), delta: z.number().int().min(-1000000).max(1000000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { data: row, error: e1 } = await supabaseAdmin
      .from("profiles")
      .select("credits")
      .eq("id", data.userId)
      .single();
    if (e1) throw new Error(e1.message);
    const next = Math.max(0, (row?.credits ?? 0) + data.delta);
    const { error: e2 } = await supabaseAdmin
      .from("profiles")
      .update({ credits: next, updated_at: new Date().toISOString() })
      .eq("id", data.userId);
    if (e2) throw new Error(e2.message);
    return { credits: next };
  });

// --- Coupons ---
function makeCode() {
  const seg = () =>
    Math.random().toString(36).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4).padEnd(4, "X");
  return `LUMEN-${seg()}-${seg()}`;
}

export const adminListCoupons = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data, error } = await supabaseAdmin
      .from("coupons")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return data;
  });

export const adminDeleteCoupon = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ couponId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { data: row, error: e1 } = await supabaseAdmin
      .from("coupons").select("is_used").eq("id", data.couponId).maybeSingle();
    if (e1) throw new Error(e1.message);
    if (!row) throw new Error("卡密不存在");
    if (row.is_used) throw new Error("已使用的卡密不可删除");
    const { error } = await supabaseAdmin.from("coupons").delete().eq("id", data.couponId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminGenerateCoupons = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ count: z.number().int().min(1).max(500), amount: z.number().int().min(1).max(1000000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const rows = Array.from({ length: data.count }, () => ({
      code: makeCode(),
      amount: data.amount,
      created_by: context.userId,
    }));
    const { data: inserted, error } = await supabaseAdmin
      .from("coupons")
      .insert(rows)
      .select("code, amount");
    if (error) throw new Error(error.message);
    return inserted;
  });

// --- Redeem (user) ---
// Calls the secure RPC `redeem_gift_card`. The function runs inside a
// transaction with FOR UPDATE row locking and writes an audit row to
// `redeem_logs`. No direct table writes happen from the client.
export const redeemCoupon = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ code: z.string().min(3).max(64).regex(/^[A-Za-z0-9_-]+$/) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: res, error } = await supabase.rpc("redeem_gift_card", { input_code: data.code.trim() });
    if (error) {
      // The RPC raises on every failure path; surface the human-readable message.
      return { success: false, message: error.message || "兑换失败", amount: 0 };
    }
    const row = Array.isArray(res) ? res[0] : res;
    return row as { success: boolean; message: string; amount: number };
  });

// --- Models config (PUBLIC: safe columns only, no api_key) ---
export const listModelsConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    // Use supabaseAdmin with explicit safe-column projection so the public RLS
    // policy can be removed (api_key / api_url / fetch_url are never returned).
    const { data, error } = await supabaseAdmin
      .from("models_config")
      .select("id, model_key, name, description, cost, sort_order, updated_at")
      .eq("is_enabled", true)
      .order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

// Admin variant: includes api_url & api_key + dynamic adapter fields
export const adminListModelsConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data, error } = await supabaseAdmin
      .from("models_config")
      .select("id, model_key, name, description, cost, api_url, api_key, request_format, prompt_key, fetch_url, extra_params, is_enabled, sort_order, updated_at")
      .order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const adminUpdateModelPrice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ id: z.string().uuid(), cost: z.number().min(0).max(100000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin
      .from("models_config")
      .update({ cost: data.cost, updated_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminUpdateModel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      id: z.string().uuid(),
      name: z.string().min(1).max(64).optional(),
      model_key: z.string().min(1).max(64).regex(/^[a-zA-Z0-9_\-.]+$/).optional(),
      description: z.string().max(200).nullable().optional(),
      cost: z.number().min(0).max(100000).optional(),
      api_url: z.string().min(1).max(500).nullable().optional(),
      api_key: z.string().max(500).nullable().optional(),
      request_format: z.enum(["async_id", "sync_url"]).optional(),
      prompt_key: z.string().min(1).max(64).optional(),
      fetch_url: z.string().min(1).max(500).nullable().optional(),
      extra_params: z.record(z.string(), z.any()).optional(),
      is_enabled: z.boolean().optional(),
      sort_order: z.number().int().min(0).max(10000).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { id, ...rest } = data;
    const patch = { ...rest, updated_at: new Date().toISOString() };
    const { error } = await supabaseAdmin.from("models_config").update(patch as never).eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminCreateModel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      name: z.string().min(1).max(64),
      model_key: z.string().min(1).max(64).regex(/^[a-zA-Z0-9_\-.]+$/),
      description: z.string().max(200).optional(),
      cost: z.number().min(0).max(100000).default(1),
      api_url: z.string().min(1).max(500).optional(),
      api_key: z.string().max(500).optional(),
      request_format: z.enum(["async_id", "sync_url"]).default("async_id"),
      prompt_key: z.string().min(1).max(64).default("prompt"),
      fetch_url: z.string().min(1).max(500).optional(),
      extra_params: z.record(z.string(), z.any()).optional(),
      sort_order: z.number().int().min(0).max(10000).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { data: row, error } = await supabaseAdmin
      .from("models_config")
      .insert({
        name: data.name,
        model_key: data.model_key,
        description: data.description ?? null,
        cost: data.cost,
        api_url: data.api_url ?? null,
        api_key: data.api_key ?? null,
        request_format: data.request_format,
        prompt_key: data.prompt_key,
        fetch_url: data.fetch_url ?? null,
        extra_params: data.extra_params ?? {},
        sort_order: data.sort_order ?? 999,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const adminDeleteModel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin.from("models_config").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// --- Generation: deduct credits + log history (legacy, kept for compat) ---
export const consumeGeneration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ modelKey: z.string().min(1).max(64), prompt: z.string().max(4000).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: res, error } = await supabase.rpc("consume_credits_for_generation", {
      _model_key: data.modelKey,
      _prompt: data.prompt ?? "",
    });
    if (error) throw new Error(error.message);
    const row = Array.isArray(res) ? res[0] : res;
    return row as { success: boolean; message: string; credits: number; cost: number };
  });

// --- 获取当前用户生成历史（分页 + 缩略图）---
// 列表只返回轻量 thumbnailUrl，原图 originalImageUrl 用于详情/下载。
function buildHistoryThumbUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (/^(blob:|data:)/i.test(url)) return url;
  if (!url.includes("/storage/v1/object/public/") && !url.includes("/storage/v1/render/image/public/")) {
    return url;
  }
  const transformed = url.includes("/storage/v1/object/public/")
    ? url.replace("/storage/v1/object/public/", "/storage/v1/render/image/public/")
    : url;
  const sep = transformed.includes("?") ? "&" : "?";
  return `${transformed}${sep}width=480&quality=62&resize=contain`;
}

export const getMyGenerationHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { limit?: number; offset?: number } | undefined) => ({
    limit: Math.min(50, Math.max(1, Number(input?.limit ?? 20))),
    offset: Math.max(0, Number(input?.offset ?? 0)),
  }))
  .handler(async ({ context, data }) => {
    const { userId } = context;
    const { limit, offset } = data;

    // 判断是否管理员（admin / founder）
    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .in("role", ["admin", "founder"]);
    const isAdmin = !!(roles && roles.length > 0);
    const maxKeep = isAdmin ? 300 : 100;
    const maxDays = 15;
    const cutoff = new Date(Date.now() - maxDays * 24 * 60 * 60 * 1000).toISOString();

    // 自动清理：超过 15 天 或 超过 maxKeep 张，删除最旧的
    try {
      await supabaseAdmin
        .from("generation_history")
        .delete()
        .eq("user_id", userId)
        .lt("created_at", cutoff);

      const { data: keepIds } = await supabaseAdmin
        .from("generation_history")
        .select("id")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .range(0, maxKeep - 1);
      const keepSet = (keepIds ?? []).map((r: any) => r.id);
      if (keepSet.length >= maxKeep) {
        await supabaseAdmin
          .from("generation_history")
          .delete()
          .eq("user_id", userId)
          .not("id", "in", `(${keepSet.map((id: string) => `"${id}"`).join(",")})`);
      }
    } catch (e) {
      console.warn("[history] prune failed", e);
    }

    // 管理员可以查看所有用户的历史（用于核查违规）；普通用户只能看自己的
    if (offset >= maxKeep) {
      return { items: [], total: maxKeep, limit, offset, maxKeep, maxDays, isAdmin };
    }
    const endIdx = Math.min(offset + limit, maxKeep) - 1;
    let query = supabaseAdmin
      .from("generation_history")
      .select("id, user_id, model, prompt, image_url, created_at, cost", { count: "exact" })
      .not("image_url", "is", null)
      .order("created_at", { ascending: false })
      .range(offset, endIdx);
    if (!isAdmin) {
      query = query
        .eq("user_id", userId)
        .gte("created_at", cutoff);
    }
    const { data: rows, error, count } = await query;
    if (error) throw new Error(error.message);

    // 管理员需要显示作者信息
    let authorEmailMap = new Map<string, string | null>();
    if (isAdmin && rows && rows.length > 0) {
      const uids = Array.from(new Set(rows.map((r: any) => r.user_id)));
      const { data: profs } = await supabaseAdmin
        .from("profiles")
        .select("id, email")
        .in("id", uids);
      const profileEmailMap = new Map((profs ?? []).map((p: any) => [p.id, p.email ?? null]));
      authorEmailMap = new Map(uids.map((uid) => [uid, profileEmailMap.get(uid) ?? null]));
      await Promise.all(uids.map(async (uid) => {
        try {
          const { data: authData, error: authError } = await supabaseAdmin.auth.admin.getUserById(uid);
          if (!authError && authData.user?.email) {
            authorEmailMap.set(uid, authData.user.email);
          }
        } catch {
          // Keep profiles.email fallback.
        }
      }));
    }

    const items = (rows ?? []).map((r: any) => {
      const authorEmail = authorEmailMap.get(r.user_id) ?? null;
      return {
        id: r.id as string,
        userId: r.user_id as string,
        model: r.model as string,
        prompt: (r.prompt ?? null) as string | null,
        finalPrompt: (r.prompt ?? null) as string | null,
        styleName: null as string | null,
        aspectRatio: null as string | null,
        createdAt: r.created_at as string,
        originalImageUrl: r.image_url as string,
        thumbnailUrl: buildHistoryThumbUrl(r.image_url),
        status: "done" as const,
        cost: Number(r.cost ?? 0),
        authorName: null,
        authorEmail,
        // backward-compat:
        image_url: r.image_url as string,
        created_at: r.created_at as string,
      };
    });
    const total = Math.min(count ?? items.length, maxKeep);
    return { items, total, limit, offset, maxKeep, maxDays, isAdmin };
  });

export const getMyGenerationTasks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { data: activeRows, error: activeError } = await (supabaseAdmin as any)
      .from("generation_tasks")
      .select("id, request_id, user_id, status, model_id, prompt, input_params, created_at, updated_at, started_at, completed_at, result_image_url, error_code, error_message, deduction_status, deduction_id")
      .eq("user_id", userId)
      .in("status", ["queued", "running"])
      .order("created_at", { ascending: true })
      .limit(3);
    if (activeError) throw new Error(activeError.message);

    const rows = activeRows ?? [];

    const items = (rows ?? []).map((r: any) => ({
      id: r.id as string,
      requestId: r.request_id as string,
      userId: r.user_id as string,
      status: r.status as "queued" | "running" | "succeeded" | "failed",
      modelId: r.model_id as string,
      prompt: (r.prompt ?? null) as string | null,
      inputParams: (r.input_params ?? {}) as Record<string, unknown>,
      createdAt: r.created_at as string,
      updatedAt: r.updated_at as string,
      startedAt: (r.started_at ?? null) as string | null,
      completedAt: (r.completed_at ?? null) as string | null,
      resultImageUrl: (r.result_image_url ?? null) as string | null,
      errorCode: (r.error_code ?? null) as string | null,
      errorMessage: (r.error_message ?? null) as string | null,
      deductionStatus: (r.deduction_status ?? null) as string | null,
      deductionId: (r.deduction_id ?? null) as string | null,
    }));

    return { items, isAdmin: false };
  });

export const createGenerationTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      modelKey: z.string().min(1).max(64),
      prompt: z.string().min(1).max(4000),
      inputParams: z.record(z.string(), z.any()).optional(),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { userId } = context;

    const { count: activeCount, error: countError } = await (supabaseAdmin as any)
      .from("generation_tasks")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .in("status", ["queued", "running"]);
    if (countError) {
      if (countError.message?.includes("generation_tasks")) {
        throw new Error("任务表尚未启用，暂不能创建多任务。");
      }
      throw new Error(countError.message);
    }
    if ((activeCount ?? 0) >= 3) {
      throw new Error("当前已有 3 个进行中任务，请等待任务完成后再提交。");
    }

    const { data: model, error: modelError } = await supabaseAdmin
      .from("models_config")
      .select("model_key, cost, is_enabled")
      .eq("model_key", data.modelKey)
      .maybeSingle();
    if (modelError) throw new Error(modelError.message);
    if (!model) throw new Error("模型不存在或已不可用。");
    if ((model as any).is_enabled === false) throw new Error("模型不存在或已不可用。");

    const creditsRequired = Math.max(0, Number((model as any).cost ?? 0));
    const { data: activeTasks, error: activeTasksError } = await (supabaseAdmin as any)
      .from("generation_tasks")
      .select("credits_required")
      .eq("user_id", userId)
      .eq("deduction_status", "not_charged")
      .in("status", ["queued", "running"]);
    if (activeTasksError) throw new Error(activeTasksError.message);
    const reservedCredits = (activeTasks ?? []).reduce(
      (sum: number, task: any) => sum + Number(task.credits_required ?? 0),
      0,
    );
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("credits")
      .eq("id", userId)
      .maybeSingle();
    if (profileError) throw new Error(profileError.message);
    const availableCredits = Number((profile as any)?.credits ?? 0) - reservedCredits;
    if (availableCredits < creditsRequired) {
      throw new Error("余额不足，无法创建多任务。");
    }

    const requestId = `task_${crypto.randomUUID()}`;
    const { data: task, error: insertError } = await (supabaseAdmin as any)
      .from("generation_tasks")
      .insert({
        request_id: requestId,
        user_id: userId,
        status: "queued",
        model_id: data.modelKey,
        prompt: data.prompt,
        input_params: { ...(data.inputParams ?? {}), queueVersion: "userQueue" },
        credits_required: creditsRequired,
        deduction_status: "not_charged",
      })
      .select("id, request_id, status, prompt, model_id, credits_required")
      .single();
    if (insertError) {
      if (insertError.message?.includes("generation_tasks")) {
        throw new Error("任务表尚未启用，暂不能创建多任务。");
      }
      throw new Error(insertError.message);
    }

    return {
      taskId: task.id as string,
      requestId: task.request_id as string,
      status: task.status as "queued",
      prompt: task.prompt as string,
      modelId: task.model_id as string,
      creditsRequired: Number(task.credits_required ?? creditsRequired),
    };
  });

export const cancelMyQueuedGenerationTasks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;

    const now = new Date().toISOString();
    const { data, error } = await (supabaseAdmin as any)
      .from("generation_tasks")
      .update({
        status: "canceled",
        completed_at: now,
        updated_at: now,
      })
      .eq("user_id", userId)
      .eq("deduction_status", "not_charged")
      .in("status", ["queued", "running"])
      .select("id");
    if (error) throw new Error(error.message);

    return { canceledCount: (data ?? []).length };
  });

export const cancelGenerationTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ taskId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { userId } = context;

    const now = new Date().toISOString();
    const { data: task, error } = await (supabaseAdmin as any)
      .from("generation_tasks")
      .update({
        status: "canceled",
        completed_at: now,
        updated_at: now,
      })
      .eq("id", data.taskId)
      .eq("user_id", userId)
      .eq("status", "queued")
      .eq("deduction_status", "not_charged")
      .select("id, status")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!task) throw new Error("任务已开始、已完成、已取消，或不属于当前任务。");

    return {
      taskId: task.id as string,
      status: "canceled" as const,
    };
  });

type AdminPreviewFinalizeResult = {
  deductionStatus: string | null;
  historyId: string | null;
  credits: number | null;
  cost: number | null;
  finalizeMessage: string | null;
};

async function finalizeUserGenerationTaskOnce(
  supabase: any,
  taskId: string,
  imageUrl: string,
): Promise<AdminPreviewFinalizeResult> {
  const { data, error } = await supabase.rpc("finalize_user_generation_task_once", {
    p_task_id: taskId,
    p_image_url: imageUrl,
  });
  if (error) throw new Error(error.message);

  const row: any = Array.isArray(data) ? data[0] : data;
  if (!row?.success) {
    throw new Error(row?.message ?? "Finalize task failed");
  }
  if (row.deduction_status !== "charged" || !row.history_id) {
    throw new Error(row?.message ?? "Task finalized without charged deduction or history");
  }

  return {
    deductionStatus: (row.deduction_status ?? null) as string | null,
    historyId: (row.history_id ?? null) as string | null,
    credits: row.credits == null ? null : Number(row.credits),
    cost: row.cost == null ? null : Number(row.cost),
    finalizeMessage: (row.message ?? null) as string | null,
  };
}

export const startGenerationTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ taskId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { userId, supabase } = context;

    const { count: runningCount, error: runningCountError } = await (supabaseAdmin as any)
      .from("generation_tasks")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "running")
      .eq("deduction_status", "not_charged");
    if (runningCountError) throw new Error(runningCountError.message);
    if ((runningCount ?? 0) > 0) {
      throw new Error("已有任务正在生成，请等待当前任务完成。");
    }

    const now = new Date().toISOString();
    const { data: task, error } = await (supabaseAdmin as any)
      .from("generation_tasks")
      .update({
        status: "running",
        started_at: now,
        updated_at: now,
      })
      .eq("id", data.taskId)
      .eq("user_id", userId)
      .eq("status", "queued")
      .eq("deduction_status", "not_charged")
      .select("id, request_id, status, model_id, prompt, input_params, started_at")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!task) {
      throw new Error("任务已被处理、取消，或不属于当前任务。");
    }

    try {
      const { count: runningCountAfterClaim, error: runningAfterClaimError } = await (supabaseAdmin as any)
        .from("generation_tasks")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("status", "running")
        .eq("deduction_status", "not_charged");
      if (runningAfterClaimError) throw new Error(runningAfterClaimError.message);
      if ((runningCountAfterClaim ?? 0) > 1) {
        await (supabaseAdmin as any)
          .from("generation_tasks")
          .update({
            status: "queued",
            started_at: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", task.id)
          .eq("user_id", userId)
          .eq("status", "running")
          .eq("deduction_status", "not_charged");
        throw new Error("已有任务正在生成，请等待当前任务完成。");
      }

      const result = await submitAdminPreviewGenerationTask(task);
      const finishedAt = new Date().toISOString();

      if (result.status === "succeeded") {
        try {
          const finalizeResult = await finalizeUserGenerationTaskOnce(supabase, task.id as string, result.resultImageUrl);
          const { error: payloadUpdateError } = await (supabaseAdmin as any)
            .from("generation_tasks")
            .update({
              result_payload: result.resultPayload,
              updated_at: finishedAt,
            })
            .eq("id", task.id)
            .eq("user_id", userId);
          if (payloadUpdateError) {
            console.warn("[startGenerationTask] result_payload update failed after finalize", payloadUpdateError);
          }
          return {
            taskId: task.id as string,
            status: "succeeded" as const,
            startedAt: task.started_at as string,
            resultImageUrl: result.resultImageUrl,
            errorMessage: null as string | null,
            resultPayload: result.resultPayload,
            ...finalizeResult,
          };
        } catch (e) {
          const message = e instanceof Error ? e.message : "Finalize task failed";
          await (supabaseAdmin as any)
            .from("generation_tasks")
            .update({
              status: "failed",
              error_message: message,
              result_image_url: result.resultImageUrl,
              result_payload: result.resultPayload,
              completed_at: finishedAt,
              updated_at: finishedAt,
            })
            .eq("id", task.id)
            .eq("user_id", userId)
            .eq("status", "running")
            .eq("deduction_status", "not_charged");
          return {
            taskId: task.id as string,
            status: "failed" as const,
            startedAt: task.started_at as string,
            resultImageUrl: null as string | null,
            errorMessage: message,
            resultPayload: result.resultPayload,
          };
        }
      }

      const { error: updateError } = await (supabaseAdmin as any)
        .from("generation_tasks")
        .update({
          status: "running",
          result_payload: result.resultPayload,
          updated_at: finishedAt,
        })
        .eq("id", task.id)
        .eq("user_id", userId)
        .eq("status", "running")
        .eq("deduction_status", "not_charged");
      if (updateError) throw new Error(updateError.message);
      return {
        taskId: task.id as string,
        status: "running" as const,
        startedAt: task.started_at as string,
        resultImageUrl: null as string | null,
        errorMessage: null as string | null,
        resultPayload: result.resultPayload,
      };
    } catch (e) {
      const message = e instanceof Error ? e.message : "上游提交失败";
      const failedAt = new Date().toISOString();
      await (supabaseAdmin as any)
        .from("generation_tasks")
        .update({
          status: "failed",
          error_message: message,
          completed_at: failedAt,
          updated_at: failedAt,
        })
        .eq("id", task.id)
        .eq("user_id", userId)
        .eq("status", "running")
        .eq("deduction_status", "not_charged");
      return {
        taskId: task.id as string,
        status: "failed" as const,
        startedAt: task.started_at as string,
        resultImageUrl: null as string | null,
        errorMessage: message,
        resultPayload: null as any,
      };
    }
  });

export const pollGenerationTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ taskId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { userId, supabase } = context;

    const { data: task, error } = await (supabaseAdmin as any)
      .from("generation_tasks")
      .select("id, status, model_id, result_payload, result_image_url, error_message, deduction_status, deduction_id")
      .eq("id", data.taskId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!task) throw new Error("任务不存在，或不属于当前任务。");
    if (task.status !== "running") {
      const finalized = task.status === "succeeded" && task.deduction_status === "charged" && !!task.deduction_id;
      return {
        taskId: task.id as string,
        status: finalized ? "succeeded" as const : task.status === "succeeded" ? "failed" as const : task.status as "failed" | "queued" | "canceled",
        resultImageUrl: (task.result_image_url ?? null) as string | null,
        errorMessage: finalized ? (task.error_message ?? null) as string | null : task.status === "succeeded" ? "Task completed without charged deduction or history" : (task.error_message ?? null) as string | null,
        resultPayload: task.result_payload ?? null,
        deductionStatus: (task.deduction_status ?? null) as string | null,
        historyId: (task.deduction_id ?? null) as string | null,
      };
    }

    const providerTaskId = task.result_payload?.providerTaskId;
    if (!providerTaskId) {
      return {
        taskId: task.id as string,
        status: "running" as const,
        resultImageUrl: null as string | null,
        errorMessage: null as string | null,
        resultPayload: task.result_payload ?? null,
      };
    }

    const pollResult = await pollAdminPreviewProviderTask(String(providerTaskId), (task.model_id ?? null) as string | null);
    const now = new Date().toISOString();
    if (pollResult.status === "succeeded") {
      const resultPayload = { ...(task.result_payload ?? {}), ...pollResult.resultPayload, providerStatus: "succeeded" };
      try {
        const finalizeResult = await finalizeUserGenerationTaskOnce(supabase, task.id as string, pollResult.resultImageUrl);
        const { error: payloadUpdateError } = await (supabaseAdmin as any)
          .from("generation_tasks")
          .update({
            result_payload: resultPayload,
            updated_at: now,
          })
          .eq("id", task.id)
          .eq("user_id", userId);
        if (payloadUpdateError) {
          console.warn("[pollGenerationTask] result_payload update failed after finalize", payloadUpdateError);
        }
        return {
          taskId: task.id as string,
          status: "succeeded" as const,
          resultImageUrl: pollResult.resultImageUrl,
          errorMessage: null as string | null,
          resultPayload,
          ...finalizeResult,
        };
      } catch (e) {
        const message = e instanceof Error ? e.message : "Finalize task failed";
        await (supabaseAdmin as any)
          .from("generation_tasks")
          .update({
            status: "failed",
            error_message: message,
            result_payload: resultPayload,
            completed_at: now,
            updated_at: now,
          })
          .eq("id", task.id)
          .eq("user_id", userId)
          .eq("status", "running")
          .eq("deduction_status", "not_charged");
        return {
          taskId: task.id as string,
          status: "failed" as const,
          resultImageUrl: null as string | null,
          errorMessage: message,
          resultPayload,
        };
      }
    }

    if (pollResult.status === "failed") {
      const resultPayload = { ...(task.result_payload ?? {}), ...pollResult.resultPayload, providerStatus: "failed" };
      const { error: updateError } = await (supabaseAdmin as any)
        .from("generation_tasks")
        .update({
          status: "failed",
          error_message: pollResult.errorMessage,
          result_payload: resultPayload,
          completed_at: now,
          updated_at: now,
        })
        .eq("id", task.id)
        .eq("user_id", userId)
        .eq("status", "running")
        .eq("deduction_status", "not_charged");
      if (updateError) throw new Error(updateError.message);
      return {
        taskId: task.id as string,
        status: "failed" as const,
        resultImageUrl: null as string | null,
        errorMessage: pollResult.errorMessage,
        resultPayload,
      };
    }

    return {
      taskId: task.id as string,
      status: "running" as const,
      resultImageUrl: null as string | null,
      errorMessage: null as string | null,
      resultPayload: { ...(task.result_payload ?? {}), ...pollResult.resultPayload, providerStatus: "running" },
    };
  });

async function submitAdminPreviewGenerationTask(task: any): Promise<
  | { status: "succeeded"; resultImageUrl: string; resultPayload: Record<string, any> }
  | { status: "running"; resultImageUrl: null; resultPayload: Record<string, any> }
> {
  const inputParams = (task.input_params ?? {}) as Record<string, any>;
  const { base_url, global_api_key } = await loadGlobalConfig();
  const { data: model, error: modelError } = await supabaseAdmin
    .from("models_config")
    .select("id, model_key, name, api_url, api_key, request_format, prompt_key, extra_params, is_enabled")
    .eq("model_key", task.model_id)
    .maybeSingle();
  if (modelError) throw new Error(modelError.message);
  if (!model) throw new Error("模型不存在或已不可用。");
  if ((model as any).is_enabled === false) throw new Error("模型不存在或已不可用。");
  if (!(model as any).api_url && (model as any).model_key !== FOXAPI_BACKUP_MODEL_KEY) throw new Error("该模型尚未配置 API 接口地址。");

  const targetKey = (model as any).model_key === FOXAPI_BACKUP_MODEL_KEY
    ? ""
    : normalizeUpstreamApiKey((model as any).api_key) || normalizeUpstreamApiKey(global_api_key);
  const pureApiKey = String(targetKey).replace(/Bearer\s+/i, "").trim();
  if (!pureApiKey && (model as any).model_key !== FOXAPI_BACKUP_MODEL_KEY) throw new Error("该模型或全局接口设置尚未配置 API Key。");

  const submitUrl = (model as any).model_key === FOXAPI_BACKUP_MODEL_KEY ? "" : resolveUrl(base_url, (model as any).api_url);
  const prompt = String(task.prompt ?? "").trim();
  if (!prompt) throw new Error("任务提示词为空。");

  const aspectRatio = String(inputParams.aspectRatio ?? "1:1");
  const sizeValue = String(inputParams.size ?? "1K");
  const referenceImages = Array.isArray(inputParams.referenceImages) ? inputParams.referenceImages : [];
  if ((model as any).model_key === FOXAPI_BACKUP_MODEL_KEY) {
    const httpRefs = referenceImages.filter((u): u is string => typeof u === "string" && /^https?:\/\//i.test(u));
    const result = httpRefs.length === 0
      ? await submitFoxApiImageGenerationTask({ prompt })
      : await submitFoxApiImageEdit({ prompt, imageUrl: httpRefs[0] });
    if (!result.ok) throw new Error(result.message);
    return {
      status: "running",
      resultImageUrl: null,
      resultPayload: {
        providerTaskId: result.taskId,
        providerStatus: "submitted",
        provider: "foxapi",
        requestFormat: "async_id",
        requestId: task.request_id,
      },
    };
  }

  const requestFormat = (model as any).request_format || "async_id";
  const body = buildAdminPreviewUpstreamBody({
    model,
    prompt,
    aspectRatio,
    size: sizeValue,
    referenceImages,
  });

  const res = await fetch(submitUrl, {
    method: "POST",
    headers: buildUpstreamHeaders(pureApiKey),
    body: JSON.stringify(body),
  });
  const text = await res.text();
  const json = parseUpstreamResponse(text);
  if (!res.ok) throw new Error(friendlyUpstreamError(res.status));
  if (Number(json?.code) >= 400) throw new Error(friendlyUpstreamError(Number(json?.code) || 500));

  if (requestFormat === "sync_url") {
    const imageUrl = extractImageUrl(json ?? text);
    if (!imageUrl) throw new Error(friendlyUpstreamError(502));
    return {
      status: "succeeded",
      resultImageUrl: imageUrl,
      resultPayload: {
        requestFormat,
        providerStatus: "succeeded",
        requestId: task.request_id,
        upstreamCode: json?.code ?? null,
      },
    };
  }

  const providerTaskId = json?.data?.id ?? json?.id ?? json?.task_id ?? (typeof json?.data === "string" ? json.data : null);
  if (!providerTaskId) throw new Error(friendlyUpstreamError(502));
  return {
    status: "running",
    resultImageUrl: null,
    resultPayload: {
      providerTaskId,
      providerStatus: "submitted",
      requestFormat: "async_id",
      requestId: task.request_id,
      upstreamCode: json?.code ?? null,
    },
  };
}

function buildAdminPreviewUpstreamBody(params: {
  model: any;
  prompt: string;
  aspectRatio: string;
  size: string;
  referenceImages: unknown[];
}): Record<string, any> {
  const promptKey = params.model?.prompt_key || "prompt";
  const modelKey = params.model?.model_key;
  const size = VALID_SIZES.has(params.aspectRatio) ? params.aspectRatio : "auto";
  const textOnlyModels = new Set(["wan26"]);
  const httpRefs = textOnlyModels.has(modelKey)
    ? []
    : params.referenceImages.filter((u): u is string => typeof u === "string" && /^https?:\/\//i.test(u));
  const urlToken = "__LOVABLE_URLS_ARRAY__";
  const wanSizeMap: Record<string, string> = {
    "1:1": "1280*1280",
    "3:4": "1104*1472",
    "4:3": "1472*1104",
    "9:16": "960*1696",
    "16:9": "1696*960",
  };
  const wanSize = wanSizeMap[params.aspectRatio] ?? "1280*1280";
  const grokAllowed = new Set(["2:3", "3:2", "1:1", "16:9", "9:16"]);
  const grokFallback: Record<string, string> = {
    "3:4": "2:3", "4:3": "3:2", "4:5": "2:3", "5:4": "3:2",
    "9:21": "9:16", "21:9": "16:9", "1:2": "9:16", "2:1": "16:9",
    "1:3": "9:16", "3:1": "16:9", "auto": "1:1",
  };
  const grokAspect = grokAllowed.has(params.aspectRatio)
    ? params.aspectRatio
    : (grokFallback[params.aspectRatio] ?? "1:1");
  const substitute = (v: any): any => {
    if (typeof v === "string") {
      const trimmed = v.trim();
      if (/^\{\{\s*urls\s*\}\}$/.test(trimmed)) return urlToken;
      return v
        .replace(/\{\{\s*wan_size\s*\}\}/g, wanSize)
        .replace(/\{\{\s*grok_aspect\s*\}\}/g, grokAspect)
        .replace(/\{\{\s*size\s*\}\}/g, params.size)
        .replace(/\{\{\s*aspect\s*\}\}/g, size)
        .replace(/\{\{\s*prompt\s*\}\}/g, params.prompt);
    }
    if (Array.isArray(v)) return v.map(substitute);
    if (v && typeof v === "object") {
      const o: Record<string, any> = {};
      for (const k of Object.keys(v)) o[k] = substitute(v[k]);
      return o;
    }
    return v;
  };
  const extra = substitute(params.model?.extra_params ?? {}) as Record<string, any>;
  let urlsHandledByExtra = false;
  for (const [key, val] of Object.entries(extra)) {
    if (val === urlToken) {
      if (httpRefs.length > 0) extra[key] = httpRefs;
      else delete extra[key];
      urlsHandledByExtra = true;
    }
  }
  if (modelKey === "grok_imagine" && httpRefs.length > 0) {
    delete (extra as any).aspect_ratio;
  }
  const body: Record<string, any> = {
    [promptKey]: params.prompt,
    ...extra,
  };
  if (!urlsHandledByExtra && httpRefs.length > 0) {
    body.urls = httpRefs;
  }
  return body;
}

async function pollAdminPreviewProviderTask(providerTaskId: string, modelKey?: string | null): Promise<
  | { status: "running"; resultImageUrl: null; errorMessage: null; resultPayload: Record<string, any> }
  | { status: "succeeded"; resultImageUrl: string; errorMessage: null; resultPayload: Record<string, any> }
  | { status: "failed"; resultImageUrl: null; errorMessage: string; resultPayload: Record<string, any> }
> {
  if (modelKey === FOXAPI_BACKUP_MODEL_KEY) {
    const result = await pollFoxApiTask(providerTaskId);
    const resultPayload = {
      providerTaskId,
      provider: "foxapi",
      providerStatus: result.providerStatus ?? result.status,
      message: result.message,
    };
    if (result.status === "succeeded") {
      return { status: "succeeded", resultImageUrl: result.imageUrl, errorMessage: null, resultPayload };
    }
    if (result.status === "failed") {
      return { status: "failed", resultImageUrl: null, errorMessage: result.message, resultPayload };
    }
    return { status: "running", resultImageUrl: null, errorMessage: null, resultPayload };
  }

  const { global_api_key } = await loadGlobalConfig();
  const pureApiKey = normalizeUpstreamApiKey(global_api_key);
  if (!pureApiKey) throw new Error("尚未配置全局 API Key，请联系管理员");

  const detailUrl = `https://api.wuyinkeji.com/api/async/detail?id=${encodeURIComponent(providerTaskId)}`;
  const res = await fetchWithRetry(detailUrl, {
    method: "GET",
    headers: buildUpstreamHeaders(pureApiKey),
  });
  const text = await res.text();
  const json = parseUpstreamResponse(text);
  const code = Number(json?.code);
  const taskStatus = Number.isFinite(Number(json?.data?.status)) ? Number(json?.data?.status) : null;
  const rawMsg = (json?.data?.message ?? json?.msg ?? json?.message ?? null) as string | null;
  const resultPayload = {
    providerTaskId,
    code: Number.isFinite(code) ? code : null,
    taskStatus,
    message: rawMsg,
  };

  if (!res.ok) {
    return { status: "running", resultImageUrl: null, errorMessage: null, resultPayload: { ...resultPayload, httpStatus: res.status } };
  }
  if (code >= 400) {
    console.error("[generation-task] upstream detail code", {
      stage: "detail",
      modelKey,
      providerTaskId,
      upstreamCode: code,
      code: json?.code ?? null,
      message: rawMsg,
    });
    return { status: "failed", resultImageUrl: null, errorMessage: friendlyUpstreamError(code), resultPayload };
  }
  if (taskStatus === 3) {
    console.error("[generation-task] upstream detail failed", {
      stage: "detail",
      modelKey,
      providerTaskId,
      upstreamCode: Number.isFinite(code) ? code : null,
      code: json?.code ?? null,
      message: rawMsg,
    });
    return { status: "failed", resultImageUrl: null, errorMessage: rawMsg || "任务被拒绝", resultPayload };
  }
  if (taskStatus === 2) {
    const url = extractImageUrl(json?.data) ?? extractImageUrl(json);
    if (url) return { status: "succeeded", resultImageUrl: url, errorMessage: null, resultPayload };
    return { status: "running", resultImageUrl: null, errorMessage: null, resultPayload: { ...resultPayload, message: rawMsg ?? "成功但URL未就绪" } };
  }
  return { status: "running", resultImageUrl: null, errorMessage: null, resultPayload };
}

// --- NEW: Dynamic upstream image generation (per-model API routing) ---
function extractImageUrl(payload: any): string | null {
  if (!payload) return null;
  if (typeof payload === "string" && /^https?:\/\//i.test(payload)) return payload;
  // OpenAI style: { data: [{ url, b64_json }] }
  const d0 = payload?.data?.[0];
  if (d0?.url) return d0.url;
  if (d0?.b64_json) return `data:image/png;base64,${d0.b64_json}`;
  // Common variants, including wuyinkeji async detail payloads.
  const candidates = [
    payload?.url,
    payload?.image_url,
    payload?.image,
    payload?.output,
    payload?.result,
    payload?.message,
    payload?.data,
    payload?.output?.[0],
    payload?.images?.[0]?.url,
    payload?.images?.[0],
    payload?.result?.url,
    payload?.result?.image,
    payload?.result?.images?.[0]?.url,
    payload?.result?.images?.[0],
    payload?.data?.url,
    payload?.data?.image_url,
    payload?.data?.image,
    payload?.data?.output,
    payload?.data?.result,
    payload?.data?.message,
    payload?.data?.output?.[0],
    payload?.data?.images?.[0]?.url,
    payload?.data?.images?.[0],
    payload?.data?.result?.url,
    payload?.data?.result?.image,
    payload?.data?.result?.images?.[0]?.url,
    payload?.data?.result?.images?.[0],
    payload?.data?.urls?.[0],
    payload?.urls?.[0],
  ];
   for (const c of candidates) {
     if (typeof c === "string" && /^https?:\/\//i.test(c)) return c;
   }
   // Deep scan for any http(s) url string within payload
   try {
     const seen = new Set<any>();
     const stack: any[] = [payload];
     while (stack.length) {
       const v = stack.pop();
       if (!v || seen.has(v)) continue;
        if (typeof v === "string") {
          const embedded = v.match(/https?:\/\/[^\s"'<>\\]+(?:png|jpe?g|webp|gif|bmp)(?:\?[^\s"'<>\\]*)?/i);
          if (embedded) return embedded[0];
          if (/^https?:\/\/\S+$/i.test(v)) return v;
         continue;
       }
       if (typeof v === "object") {
         seen.add(v);
         for (const k of Object.keys(v)) stack.push((v as any)[k]);
       }
     }
   } catch { /* ignore */ }
   return null;
 }

 // Derive the async fetch_result endpoint from the configured submit URL.
 // e.g. https://api.wuyinkeji.com/api/async/image_gpt -> https://api.wuyinkeji.com/api/async/fetch_result
 function deriveFetchResultUrl(submitUrl: string): string {
   try {
     const u = new URL(submitUrl);
     const parts = u.pathname.split("/").filter(Boolean);
     if (parts.length > 0) parts[parts.length - 1] = "fetch_result";
     else parts.push("fetch_result");
     u.pathname = "/" + parts.join("/");
     u.search = "";
     return u.toString();
   } catch {
     return submitUrl.replace(/\/[^/]*$/, "/fetch_result");
   }
  }

  // 对上游 429 / 5xx / 网络错误做一次带退避的自动重试。
  async function fetchWithRetry(url: string, init: RequestInit, opts?: { retries?: number; backoffMs?: number }): Promise<Response> {
    const retries = opts?.retries ?? 1;
    const backoffMs = opts?.backoffMs ?? 800;
    let lastErr: any = null;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await fetch(url, init);
        if ((res.status === 429 || res.status >= 500) && attempt < retries) {
          await new Promise((r) => setTimeout(r, backoffMs * (attempt + 1)));
          continue;
        }
        return res;
      } catch (e) {
        lastErr = e;
        if (attempt < retries) {
          await new Promise((r) => setTimeout(r, backoffMs * (attempt + 1)));
          continue;
        }
        throw e;
      }
    }
    if (lastErr) throw lastErr;
    throw new Error("upstream request failed");
  }

  // 生成对用户友好的统一上游错误文案，不暴露上游细节。
  function friendlyUpstreamError(code: string | number): string {
    return `错误代码 ${code}，模型繁忙，请稍后再试`;
  }

  const VALID_SIZES = new Set(["auto","1:1","2:3","16:9","9:16","4:3","3:4","21:9","9:21","1:3","3:1","1:2"]);

 // --- Global upstream config (Base URL + global API key) ---
 async function loadGlobalConfig(): Promise<{ base_url: string; global_api_key: string | null }> {
   const { data } = await supabaseAdmin
     .from("global_config")
     .select("base_url, global_api_key")
     .eq("id", 1)
     .maybeSingle();
    return {
      base_url: (data?.base_url || "https://api.wuyinkeji.com").replace(/\/+$/, ""),
      global_api_key: data?.global_api_key ?? process.env.WUYIN_API_KEY ?? null,
    };
 }

 export const adminGetGlobalConfig = createServerFn({ method: "POST" })
   .middleware([requireSupabaseAuth])
   .handler(async ({ context }) => {
     await assertAdmin(context.userId);
     return await loadGlobalConfig();
   });

 export const adminUpdateGlobalConfig = createServerFn({ method: "POST" })
   .middleware([requireSupabaseAuth])
   .inputValidator((d) =>
     z.object({
       base_url: z.string().url().max(500),
       global_api_key: z.string().max(500).nullable().optional(),
     }).parse(d),
   )
   .handler(async ({ data, context }) => {
     await assertAdmin(context.userId);
     const { error } = await supabaseAdmin
       .from("global_config")
       .upsert({
         id: 1,
         base_url: data.base_url.replace(/\/+$/, ""),
         global_api_key: data.global_api_key ?? null,
         updated_at: new Date().toISOString(),
       });
     if (error) throw new Error(error.message);
     return { ok: true };
   });

 function resolveUrl(base: string, endpoint: string): string {
   if (/^https?:\/\//i.test(endpoint)) return endpoint;
   const path = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
   return `${base}${path}`;
 }

  function normalizeUpstreamApiKey(targetKey: unknown): string {
    const pureApiKey = String(targetKey ?? "").replace(/Bearer\s+/i, "").trim();
    return pureApiKey;
  }

  function buildUpstreamHeaders(pureApiKey: string): Record<string, string> {
    return {
      "Content-Type": "application/json",
      Authorization: pureApiKey,
    };
  }

  function appendApiKeyToUrl(apiUrl: string, pureApiKey: string): string {
    const cleanUrl = apiUrl.replace(/([?&])key=[^&]*&?/i, "$1").replace(/[?&]$/, "");
    const joinChar = cleanUrl.includes("?") ? "&" : "?";
    return `${cleanUrl}${joinChar}key=${pureApiKey}`;
  }

  function parseUpstreamJson(text: string): any {
    try {
      return JSON.parse(text);
    } catch {
      const cleaned = text.replace(/```json\s*/gi, "").replace(/```/g, "").trim();
      const start = cleaned.search(/[\[{]/);
      const end = Math.max(cleaned.lastIndexOf("}"), cleaned.lastIndexOf("]"));
      if (start < 0 || end < start) return null;
      try { return JSON.parse(cleaned.slice(start, end + 1)); }
      catch {
        try {
          return JSON.parse(
            cleaned.slice(start, end + 1)
              .replace(/,\s*}/g, "}")
              .replace(/,\s*]/g, "]")
              .replace(/[\x00-\x1F\x7F]/g, ""),
          );
        } catch {
          return null;
        }
      }
    }
  }

  function parseUpstreamResponse(text: string): any {
    const parsed = parseUpstreamJson(text);
    const normalizeNested = (value: any): any => {
      if (typeof value === "string" && /^[\[{]/.test(value.trim())) {
        const nested = parseUpstreamJson(value);
        return nested == null ? value : normalizeNested(nested);
      }
      if (Array.isArray(value)) return value.map(normalizeNested);
      if (value && typeof value === "object") {
        for (const key of Object.keys(value)) value[key] = normalizeNested(value[key]);
      }
      return value;
    };
    return normalizeNested(parsed);
  }

// 提交生图任务：上游提交 + 立即扣费记账，**不在服务端循环轮询**。
// 同步模型（sync_url）直接返回 imageUrl；异步模型返回 taskId 由前端轮询 checkImageStatus。

export const generateImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      modelKey: z.string().min(1).max(64),
      prompt: z.string().min(1).max(4000),
      aspectRatio: z.string().min(1).max(16).default("1:1"),
      size: z.enum(["1K", "2K", "4K"]).default("1K"),
      referenceImages: z.array(z.string().url().or(z.string().startsWith("data:"))).max(5).optional(),
      styleId: z.string().max(64).optional().or(z.literal("")),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // 服务端违规词二次校验，防止绕过前端
    const safety = checkPromptSafety(data.prompt);
    if (!safety.allowed) {
      console.warn("[generateImage] blocked by safety filter", {
        userId,
        category: safety.category,
        at: new Date().toISOString(),
      });
      throw new Error(SAFETY_SERVER_BLOCK_MESSAGE);
    }

    const { base_url, global_api_key } = await loadGlobalConfig();

    const { data: model, error: mErr } = await supabaseAdmin
      .from("models_config")
      .select("id, model_key, name, cost, api_url, api_key, request_format, prompt_key, fetch_url, extra_params, is_enabled")
      .eq("model_key", data.modelKey)
      .maybeSingle();
    if (mErr) throw new Error(mErr.message);
    if (!model) throw new Error("模型不存在");
    if (model.is_enabled === false) throw new Error("该模型已被管理员停用");
    if (!model.api_url && model.model_key !== FOXAPI_BACKUP_MODEL_KEY) throw new Error("该模型尚未配置 API 接口地址，请联系管理员");

    const { data: prof, error: pErr } = await supabase
      .from("profiles").select("credits").eq("id", userId).maybeSingle();
    if (pErr) throw new Error(pErr.message);
    if (!prof || Number(prof.credits) < Number(model.cost)) {
      throw new Error("您的算力余额不足，请联系老板兑换充值卡密");
    }
    const currentCredits = Number(prof.credits ?? 0) || 0;
    const failGeneration = (message: string) => ({
      success: false,
      imageUrl: null,
      taskId: null,
      cost: 0,
      credits: currentCredits,
      message,
    });

    // 风格模板已迁移为前端本地预设：客户端会自行把 promptSuffix 追加到 prompt 后再提交。
    // 这里直接使用客户端传入的 prompt，不再查询 style_templates 表。
    // styleId 字段仅作为可选元数据保留（兼容旧客户端），不参与提示词拼接。
    const finalPrompt = data.prompt.trim();


    const targetKey = model.model_key === FOXAPI_BACKUP_MODEL_KEY
      ? ""
      : normalizeUpstreamApiKey((model as any).api_key) || normalizeUpstreamApiKey(global_api_key);
    const pureApiKey = String(targetKey).replace(/Bearer\s+/i, "").trim();
    if (!pureApiKey && model.model_key !== FOXAPI_BACKUP_MODEL_KEY) {
      throw new Error("该模型或全局接口设置尚未配置 API Key，请联系管理员");
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Authorization": pureApiKey,
    };
    const submitUrl = model.model_key === FOXAPI_BACKUP_MODEL_KEY ? "" : resolveUrl(base_url, model.api_url || "");

    const size = VALID_SIZES.has(data.aspectRatio) ? data.aspectRatio : "auto";
    // 后端硬性限制：仅文生图模型不允许带参考图
    const TEXT_ONLY_MODELS = new Set(["wan26"]);
    const isTextOnly = TEXT_ONLY_MODELS.has(model.model_key);
    const httpRefs = isTextOnly
      ? []
      : (data.referenceImages ?? []).filter((u) => /^https?:\/\//i.test(u));
    const promptKey = (model as any).prompt_key || "prompt";
    const requestFormat = (model as any).request_format || "async_id";

    if (model.model_key === FOXAPI_BACKUP_MODEL_KEY) {
      const result = httpRefs.length === 0
        ? await submitFoxApiImageGenerationTask({ prompt: finalPrompt })
        : await submitFoxApiImageEdit({ prompt: finalPrompt, imageUrl: httpRefs[0] });
      if (!result.ok) return failGeneration(result.message);
      return {
        success: true,
        imageUrl: null,
        taskId: result.taskId,
        cost: 0,
        credits: currentCredits,
        modelName: model.name,
      };
    }

    // 占位符：{{aspect}} / {{prompt}} 替换为字符串；{{urls}} 替换为整个参考图数组（用 __URLS__ 标记）
    const URLS_TOKEN = "__LOVABLE_URLS_ARRAY__";
    // Wan2.6 推荐分辨率（按宽高比映射）
    const WAN_SIZE_MAP: Record<string, string> = {
      "1:1": "1280*1280",
      "3:4": "1104*1472",
      "4:3": "1472*1104",
      "9:16": "960*1696",
      "16:9": "1696*960",
    };
    const wanSize = WAN_SIZE_MAP[data.aspectRatio] ?? "1280*1280";
    // grok_imagine 仅支持 2:3 / 3:2 / 1:1 / 16:9 / 9:16，其他比例需就近映射
    const GROK_ALLOWED = new Set(["2:3", "3:2", "1:1", "16:9", "9:16"]);
    const GROK_FALLBACK: Record<string, string> = {
      "3:4": "2:3", "4:3": "3:2", "4:5": "2:3", "5:4": "3:2",
      "9:21": "9:16", "21:9": "16:9", "1:2": "9:16", "2:1": "16:9",
      "1:3": "9:16", "3:1": "16:9", "auto": "1:1",
    };
    const grokAspect = GROK_ALLOWED.has(data.aspectRatio)
      ? data.aspectRatio
      : (GROK_FALLBACK[data.aspectRatio] ?? "1:1");
    const rawExtra = (model as any).extra_params ?? {};
    const substitute = (v: any): any => {
      if (typeof v === "string") {
        const trimmed = v.trim();
        // 整个字符串就是 {{urls}} → 直接替换为数组
        if (/^\{\{\s*urls\s*\}\}$/.test(trimmed)) return URLS_TOKEN;
        return v
          .replace(/\{\{\s*wan_size\s*\}\}/g, wanSize)
          .replace(/\{\{\s*grok_aspect\s*\}\}/g, grokAspect)
          .replace(/\{\{\s*size\s*\}\}/g, data.size)
          .replace(/\{\{\s*aspect\s*\}\}/g, size)
          .replace(/\{\{\s*prompt\s*\}\}/g, finalPrompt);
      }

      if (Array.isArray(v)) return v.map(substitute);
      if (v && typeof v === "object") {
        const o: Record<string, any> = {};
        for (const k of Object.keys(v)) o[k] = substitute(v[k]);
        return o;
      }
      return v;
    };
    const extra = substitute(rawExtra) as Record<string, unknown>;

    // 找到所有用了 {{urls}} 占位符的字段，把它们替换为真实数组
    let urlsHandledByExtra = false;
    for (const [k, val] of Object.entries(extra)) {
      if (val === URLS_TOKEN) {
        if (httpRefs.length > 0) extra[k] = httpRefs;
        else delete extra[k];
        urlsHandledByExtra = true;
      }
    }

    // grok_imagine：带参考图时 aspect_ratio 会被上游忽略，主动清掉以降低 400 风险
    if (model.model_key === "grok_imagine" && httpRefs.length > 0) {
      delete (extra as any).aspect_ratio;
    }

    const body: Record<string, unknown> = {
      [promptKey]: finalPrompt,
      ...extra, // 每个模型自定义参数（如 size、image_weight、aspect_ratio 等）
    };
    // 没有显式用 {{urls}} 占位符的模型，默认把参考图放到 body.urls
    if (!urlsHandledByExtra && Array.isArray(httpRefs) && httpRefs.length > 0) {
      body.urls = httpRefs;
    }
    console.log("[generateImage] submit body →", JSON.stringify({ url: submitUrl, body }, null, 2));


    let imageUrl: string | null = null;
    let taskId: string | null = null;

    if (requestFormat === "sync_url") {
      let res: Response;
      try {
        res = await fetchWithRetry(submitUrl, { method: "POST", headers, body: JSON.stringify(body) });
      } catch (e: any) {
        console.error("[generateImage] sync upstream network error", e);
        return failGeneration(friendlyUpstreamError(0));
      }
      const text = await res.text();
      const json: any = parseUpstreamResponse(text);
      if (!res.ok) {
        console.error("[generateImage] sync upstream HTTP", res.status, text?.slice(0, 500));
        return failGeneration(friendlyUpstreamError(res.status));
      }
      if (Number(json?.code) >= 400) {
        console.error("[generateImage] sync upstream code", json?.code, json?.msg);
        return failGeneration(friendlyUpstreamError(Number(json?.code) || 500));
      }
      imageUrl = extractImageUrl(json ?? text);
      if (!imageUrl) return failGeneration(friendlyUpstreamError(502));
    } else {
      try {
        const res = await fetchWithRetry(submitUrl, { method: "POST", headers, body: JSON.stringify(body) });
        const text = await res.text();
        const json = parseUpstreamResponse(text);
        console.log("[generateImage] upstream response →", { status: res.status, ok: res.ok, body: text?.slice(0, 1000) });
        if (!res.ok) {
          console.error("[generateImage] async upstream HTTP", res.status, text?.slice(0, 500));
          return failGeneration(friendlyUpstreamError(res.status));
        }
        if (Number(json?.code) >= 400) {
          console.error("[generateImage] async upstream code", json?.code, json?.msg);
          return failGeneration(friendlyUpstreamError(Number(json?.code) || 500));
        }
        taskId = json?.data?.id ?? json?.id ?? json?.task_id ?? (typeof json?.data === "string" ? json.data : null);
        if (!taskId) {
          console.error("[generateImage] async no taskId", text?.slice(0, 500));
          return failGeneration(friendlyUpstreamError(502));
        }
      } catch (e: any) {
        console.error("[generateImage] async upstream network error", e);
        return failGeneration(friendlyUpstreamError(0));
      }
    }

    // 仅在已经成功拿到图片（sync 模型）时立即扣费并记账。
    // 异步模型在 checkImageStatus 拿到最终图片后再扣费，避免上游失败仍扣点。
    let safeCost = 0;
    let safeCredits = currentCredits;
    if (imageUrl) {
      const { data: rpcRes, error: rpcErr } = await supabase.rpc("consume_credits_for_generation", {
        _model_key: data.modelKey,
        _prompt: data.prompt,
      });
      if (rpcErr) throw new Error(rpcErr.message);
      const row: any = Array.isArray(rpcRes) ? rpcRes?.[0] : rpcRes;
      if (!row?.success) throw new Error(row?.message ?? "扣费失败");
      safeCost = Number(row?.cost ?? 0) || 0;
      safeCredits = Number(row?.credits ?? 0) || 0;

      await supabase.rpc("set_latest_history_image", {
        _model: model.name,
        _image_url: imageUrl,
      });
    }

    return {
      success: true,
      imageUrl,            // sync 模型直接返回，async 模型为 null
      taskId,              // async 模型返回 taskId 供前端轮询
      cost: safeCost,
      credits: safeCredits,
      modelName: model.name,
    };

  });

// 前端主动轮询的任务状态查询。运行在浏览器侧，不受 Worker 单次请求超时限制。
export const checkImageStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      taskId: z.string().min(1).max(128),
      modelName: z.string().max(128).optional(),
      modelKey: z.string().max(64).optional(),
      prompt: z.string().max(4000).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    if (data.modelKey === FOXAPI_BACKUP_MODEL_KEY) {
      const result = await pollFoxApiTask(data.taskId);
      if (result.status === "running") {
        return { status: "pending" as const, reason: null as null, imageUrl: null as string | null, message: result.message, code: null as number | null, taskStatus: result.providerStatus, rawMsg: result.message, debug: null as null };
      }
      if (result.status === "failed") {
        const message = result.message === "FoxAPI returned base64 result, not supported yet"
          ? "Backup model returned an unsupported result format. Please switch to another model."
          : result.message;
        return { status: "failed" as const, reason: "upstream" as const, imageUrl: null as string | null, message, code: null as number | null, taskStatus: result.providerStatus, rawMsg: result.message, debug: null as null };
      }
      const url = result.imageUrl;
      // 上游成功返回图片后再扣费记账，避免失败也扣点
      if (data.modelKey && data.prompt) {
        try {
          const { data: rpcRes, error: rpcErr } = await supabase.rpc("consume_credits_for_generation", {
            _model_key: data.modelKey,
            _prompt: data.prompt,
          });
          if (rpcErr) {
            console.error("[foxapi-backup]", { modelKey: data.modelKey, stage: "deduction_rpc_error", taskId: data.taskId, providerStatus: result.providerStatus, elapsedMs: result.elapsedMs });
          } else {
            const row: any = Array.isArray(rpcRes) ? rpcRes?.[0] : rpcRes;
            if (!row?.success) {
              console.error("[foxapi-backup]", { modelKey: data.modelKey, stage: "deduction_not_charged", taskId: data.taskId, providerStatus: result.providerStatus, elapsedMs: result.elapsedMs });
            }
          }
        } catch {
          console.error("[foxapi-backup]", { modelKey: data.modelKey, stage: "deduction_exception", taskId: data.taskId, providerStatus: result.providerStatus, elapsedMs: result.elapsedMs });
        }
      }
      if (data.modelName) {
        await supabase.rpc("set_latest_history_image", {
          _model: data.modelName,
          _image_url: url,
        });
      }
      return { status: "success" as const, reason: null as null, imageUrl: url, message: null as string | null, code: null as number | null, taskStatus: result.providerStatus, rawMsg: null as string | null, debug: null as null };
    }

    const { global_api_key } = await loadGlobalConfig();
    const pureApiKey = normalizeUpstreamApiKey(global_api_key);
    if (!pureApiKey) throw new Error("尚未配置全局 API Key，请联系管理员");

    const detailUrl = `https://api.wuyinkeji.com/api/async/detail?id=${encodeURIComponent(data.taskId)}`;
    const r = await fetchWithRetry(detailUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "Authorization": pureApiKey,
      },
    });
    const t = await r.text();
    const j = parseUpstreamResponse(t);

    const rawMsg: string | null = j?.msg ?? j?.message ?? null;
    const rawDebug = j?.debug ?? j?.data?.debug ?? null;
    const taskStatus = Number.isFinite(Number(j?.data?.status)) ? Number(j?.data?.status) : null;

    if (!r.ok) {
      return { status: "pending" as const, reason: null as null, imageUrl: null as string | null, message: `HTTP ${r.status}`, code: r.status, taskStatus, rawMsg, debug: rawDebug };
    }
    const code = Number(j?.code);
    if (code >= 400) {
      console.error("[checkImageStatus] upstream code", code, rawMsg);
      return { status: "failed" as const, reason: "upstream" as const, imageUrl: null as string | null, message: friendlyUpstreamError(code), code, taskStatus, rawMsg, debug: rawDebug };
    }
    if (taskStatus === 3) {
      const detailMsg: string = String(j?.data?.message ?? rawMsg ?? "");
      const isRefUrlIssue = /参考图|垫图|图片.*(下载|读取|获取|无法|失败|超时)|url.*(download|fetch|timeout|not.*found|404)|download.*image|fetch.*image/i.test(detailMsg);
      if (isRefUrlIssue) {
        return { status: "failed" as const, reason: "ref_url" as const, imageUrl: null as string | null, message: detailMsg || "参考图读取失败，请检查链接是否为公开的 HTTPS 链接", code, taskStatus, rawMsg, debug: rawDebug };
      }
      return { status: "failed" as const, reason: "rejected" as const, imageUrl: null as string | null, message: detailMsg || "任务被拒绝", code, taskStatus, rawMsg, debug: rawDebug };
    }

    if (taskStatus === 2) {
      const url = extractImageUrl(j?.data) ?? extractImageUrl(j);
      if (url) {
        // 上游成功返回图片后再扣费记账，避免失败也扣点
        if (data.modelKey && data.prompt) {
          try {
            const { data: rpcRes, error: rpcErr } = await supabase.rpc("consume_credits_for_generation", {
              _model_key: data.modelKey,
              _prompt: data.prompt,
            });
            if (rpcErr) {
              console.error("[checkImageStatus] 扣费失败", rpcErr);
            } else {
              const row: any = Array.isArray(rpcRes) ? rpcRes?.[0] : rpcRes;
              if (!row?.success) {
                console.error("[checkImageStatus] 扣费返回失败", row);
              }
            }
          } catch (e) {
            console.error("[checkImageStatus] 扣费异常", e);
          }
        }
        if (data.modelName) {
          await supabase.rpc("set_latest_history_image", {
            _model: data.modelName,
            _image_url: url,
          });
        }
        return { status: "success" as const, reason: null as null, imageUrl: url, message: null as string | null, code, taskStatus, rawMsg, debug: rawDebug };
      }
      return { status: "pending" as const, reason: null as null, imageUrl: null as string | null, message: "成功但URL未就绪", code, taskStatus, rawMsg, debug: rawDebug };
    }
    return { status: "pending" as const, reason: null as null, imageUrl: null as string | null, message: `处理中 status=${j?.data?.status ?? "?"}`, code, taskStatus, rawMsg, debug: rawDebug };
  });


// --- Role check ---
export const checkIsAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .in("role", ["admin", "founder"]);
    const roles = (data ?? []).map((r: any) => r.role);
    return {
      isAdmin: roles.length > 0,
      isFounder: roles.includes("founder"),
    };
  });


// --- Analytics ---
export const adminGetAnalytics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { startUtc, endUtc } = getBeijingDayRange();

    const [
      todayUsersQ,
      totalUsersQ,
      unusedCouponsQ,
      todayUsageQ,
      allUsageQ,
      todayRegsQ,
    ] = await Promise.all([
      supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", startUtc).lt("created_at", endUtc),
      supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("coupons").select("id", { count: "exact", head: true }).eq("is_used", false),
      (supabaseAdmin as any).from("credit_usage_logs").select("model_key, model_name, amount, created_at").gte("created_at", startUtc).lt("created_at", endUtc),
      (supabaseAdmin as any).from("credit_usage_logs").select("model_key, model_name, amount, created_at"),
      supabaseAdmin.from("profiles").select("id, email, credits, created_at").gte("created_at", startUtc).lt("created_at", endUtc).order("created_at", { ascending: false }).limit(50),
    ]);

    const todayUsage = (todayUsageQ.data ?? []) as Array<{ model_key: string | null; model_name: string | null; amount: number | string }>;
    const allUsage = (allUsageQ.data ?? []) as Array<{ model_key: string | null; model_name: string | null; amount: number | string }>;
    const todayCostSum = todayUsage.reduce((s, r) => s + Number(r.amount ?? 0), 0);

    const groupBy = (rows: Array<{ model_key: string | null; model_name: string | null; amount: number | string }>) => {
      const map = new Map<string, { count: number; cost: number }>();
      for (const r of rows) {
        const k = r.model_name || r.model_key || "未知";
        const cur = map.get(k) ?? { count: 0, cost: 0 };
        cur.count += 1;
        cur.cost += Number(r.amount ?? 0);
        map.set(k, cur);
      }
      return map;
    };
    const todayMap = groupBy(todayUsage);
    const allMap = groupBy(allUsage);

    const modelKeys = new Set<string>([...todayMap.keys(), ...allMap.keys()]);
    const models = Array.from(modelKeys).map((m) => ({
      model: m,
      todayCount: todayMap.get(m)?.count ?? 0,
      totalCount: allMap.get(m)?.count ?? 0,
      totalCost: allMap.get(m)?.cost ?? 0,
    }));

    return {
      metrics: {
        todayUsers: todayUsersQ.count ?? 0,
        todayCost: todayCostSum,
        totalUsers: totalUsersQ.count ?? 0,
        unusedCoupons: unusedCouponsQ.count ?? 0,
      },
      models,
      dayRange: {
        timezone: "Asia/Shanghai",
        startUtc,
        endUtc,
      },
      todayRegistrations: (todayRegsQ.data ?? []).map((r: any) => ({
        id: r.id,
        email: r.email,
        credits: Number(r.credits ?? 0),
        created_at: r.created_at,
      })),
    };
  });

// --- Recharge packages ---
function normalizeRechargeFeatures(features: unknown): string[] {
  if (!Array.isArray(features)) return [];
  return features
    .map((item) => String(item ?? "").trim())
    .filter(Boolean)
    .slice(0, 20);
}

function assertHttpPurchaseUrl(purchaseUrl: string | null | undefined) {
  const trimmed = String(purchaseUrl ?? "").trim();
  if (trimmed && !/^https?:\/\//i.test(trimmed)) {
    throw new Error("购买链接必须以 http:// 或 https:// 开头");
  }
  return trimmed;
}

function mapRechargePackage(row: any) {
  return {
    id: row.id as string,
    title: row.title as string,
    subtitle: (row.subtitle ?? "") as string,
    price: row.price as string,
    credits: Number(row.credits ?? 0),
    features: normalizeRechargeFeatures(row.features),
    badgeText: (row.badge_text ?? "") as string,
    isPopular: Boolean(row.is_popular),
    highlighted: Boolean(row.highlighted),
    isVisible: Boolean(row.is_visible),
    sortOrder: Number(row.sort_order ?? 0),
    buttonText: (row.button_text ?? "立即购买") as string,
    purchaseUrl: (row.purchase_url ?? "") as string,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

const rechargePackageInput = z.object({
  id: z.string().uuid().optional(),
  title: z.string().min(1).max(120),
  subtitle: z.string().max(300).nullable().optional(),
  price: z.string().min(1).max(40),
  credits: z.number().int().min(0).max(100000000),
  features: z.array(z.string().max(300)).max(20).optional().default([]),
  badgeText: z.string().max(80).nullable().optional(),
  isPopular: z.boolean().optional().default(false),
  highlighted: z.boolean().optional().default(false),
  isVisible: z.boolean().optional().default(true),
  sortOrder: z.number().int().min(-999999).max(999999).optional().default(0),
  buttonText: z.string().min(1).max(40).optional().default("立即购买"),
  purchaseUrl: z.string().max(1000).nullable().optional(),
});

export const listVisibleRechargePackages = createServerFn({ method: "GET" })
  .handler(async () => {
    const { data, error } = await (supabaseAdmin as any)
      .from("recharge_packages")
      .select("id, title, subtitle, price, credits, features, badge_text, is_popular, highlighted, is_visible, sort_order, button_text, purchase_url, created_at, updated_at")
      .eq("is_visible", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []).map(mapRechargePackage);
  });

export const listAdminRechargePackages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data, error } = await (supabaseAdmin as any)
      .from("recharge_packages")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []).map(mapRechargePackage);
  });

export const upsertAdminRechargePackage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => rechargePackageInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const title = data.title.trim();
    const price = data.price.trim();
    if (!title) throw new Error("套餐名称不能为空");
    if (!price) throw new Error("价格不能为空");

    const features = normalizeRechargeFeatures(data.features);
    const purchaseUrl = assertHttpPurchaseUrl(data.purchaseUrl);
    const payload = {
      title,
      subtitle: data.subtitle?.trim() || null,
      price,
      credits: data.credits,
      features,
      badge_text: data.badgeText?.trim() || null,
      is_popular: data.isPopular,
      highlighted: data.highlighted,
      is_visible: data.isVisible,
      sort_order: data.sortOrder,
      button_text: data.buttonText.trim() || "立即购买",
      purchase_url: purchaseUrl,
    };

    if (data.id) {
      const { error } = await (supabaseAdmin as any)
        .from("recharge_packages")
        .update(payload)
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { ok: true, id: data.id };
    }

    const { data: inserted, error } = await (supabaseAdmin as any)
      .from("recharge_packages")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, id: inserted?.id };
  });

export const hideAdminRechargePackage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await (supabaseAdmin as any)
      .from("recharge_packages")
      .update({ is_visible: false })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// --- Ads ---
export const listActiveAds = createServerFn({ method: "GET" })
  .handler(async () => {
    const { data, error } = await supabaseAdmin
      .from("ads")
      .select("id, title, link_url, sort_order")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const adminListAds = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data, error } = await supabaseAdmin
      .from("ads")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const adminUpsertAd = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      id: z.string().uuid().optional(),
      title: z.string().min(1).max(200),
      link_url: z.string().max(500).nullable().optional(),
      is_active: z.boolean(),
      sort_order: z.number().int().min(0).max(9999),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    if (data.id) {
      const { error } = await supabaseAdmin.from("ads").update({
        title: data.title, link_url: data.link_url ?? null,
        is_active: data.is_active, sort_order: data.sort_order,
      }).eq("id", data.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin.from("ads").insert({
        title: data.title, link_url: data.link_url ?? null,
        is_active: data.is_active, sort_order: data.sort_order,
      });
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const adminDeleteAd = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin.from("ads").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// --- Announcements / 公告通知 ---
export const listAnnouncements = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { data, error } = await supabaseAdmin
      .from("announcements")
      .select("id, title, content, type, image_url, link_url, link_label, is_pinned, created_at")
      .eq("is_published", true)
      .order("is_pinned", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const adminListAnnouncements = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data, error } = await supabaseAdmin
      .from("announcements")
      .select("*")
      .order("is_pinned", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const adminUpsertAnnouncement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      id: z.string().uuid().optional(),
      title: z.string().min(1).max(200),
      content: z.string().max(5000).default(""),
      type: z.enum(["info", "success", "warning", "promo"]).default("info"),
      image_url: z.string().max(1000).nullable().optional(),
      link_url: z.string().max(1000).nullable().optional(),
      link_label: z.string().max(100).nullable().optional(),
      is_pinned: z.boolean().default(false),
      is_published: z.boolean().default(true),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const payload = {
      title: data.title,
      content: data.content ?? "",
      type: data.type,
      image_url: data.image_url ?? null,
      link_url: data.link_url ?? null,
      link_label: data.link_label ?? null,
      is_pinned: data.is_pinned,
      is_published: data.is_published,
    };
    if (data.id) {
      const { error } = await supabaseAdmin.from("announcements").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin.from("announcements").insert(payload);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const adminDeleteAnnouncement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin.from("announcements").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// --- Founder: Admin role management ---
export const founderListAdmins = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertFounder(context.userId);
    const { data: roles, error } = await supabaseAdmin
      .from("user_roles")
      .select("user_id, role, created_at")
      .in("role", ["admin", "founder"]);
    if (error) throw new Error(error.message);
    const ids = (roles ?? []).map((r: any) => r.user_id);
    if (ids.length === 0) return [];
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id, email, display_name")
      .in("id", ids);
    const pmap = new Map((profiles ?? []).map((p: any) => [p.id, p]));
    return (roles ?? []).map((r: any) => ({
      user_id: r.user_id,
      role: r.role,
      created_at: r.created_at,
      email: pmap.get(r.user_id)?.email ?? null,
      display_name: pmap.get(r.user_id)?.display_name ?? null,
    }));
  });

export const founderAddAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ email: z.string().trim().email() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertFounder(context.userId);
    const { data: prof, error: e1 } = await supabaseAdmin
      .from("profiles")
      .select("id, email")
      .ilike("email", data.email)
      .maybeSingle();
    if (e1) throw new Error(e1.message);
    if (!prof) throw new Error("找不到该邮箱用户，请确认对方已注册");
    const { error } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: prof.id, role: "admin" as any });
    if (error && !error.message.includes("duplicate")) throw new Error(error.message);
    return { ok: true, email: prof.email };
  });

export const founderRemoveAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertFounder(context.userId);
    const { error } = await supabaseAdmin
      .from("user_roles")
      .delete()
      .eq("user_id", data.userId)
      .eq("role", "admin");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// --- Backend access password ---
export const verifyAdminAccessPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ password: z.string().min(1).max(200) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { data: row, error } = await supabaseAdmin
      .from("admin_settings")
      .select("access_password")
      .eq("id", 1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const current = (row?.access_password ?? "888888").trim();
    if (data.password.trim() !== current) throw new Error("访问密码错误");
    return { ok: true };
  });

export const founderGetAccessPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertFounder(context.userId);
    const { data, error } = await supabaseAdmin
      .from("admin_settings")
      .select("access_password, updated_at")
      .eq("id", 1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { password: data?.access_password ?? "888888", updated_at: data?.updated_at ?? null };
  });

export const founderSetAccessPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ password: z.string().min(1).max(200) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertFounder(context.userId);
    const { error } = await supabaseAdmin
      .from("admin_settings")
      .upsert({ id: 1, access_password: data.password.trim(), updated_at: new Date().toISOString() });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// --- Style templates & system prompt ---
export const listStyleTemplates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("style_templates")
      .select("id, name, image_url, sort_order")
      .order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const adminListStyleTemplates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data, error } = await supabaseAdmin
      .from("style_templates")
      .select("id, name, prompt, image_url, sort_order, updated_at")
      .order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const adminUpdateStyleTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      id: z.string().min(1).max(64),
      name: z.string().min(1).max(64).optional(),
      prompt: z.string().max(4000).optional(),
      image_url: z.string().max(1000).nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { id, ...rest } = data;
    const patch: Record<string, unknown> = { ...rest, updated_at: new Date().toISOString() };
    const { error } = await supabaseAdmin.from("style_templates").update(patch as never).eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminCreateStyleTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      name: z.string().min(1).max(64),
      prompt: z.string().max(4000).optional().default(""),
      image_url: z.string().max(1000).nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const id = `tpl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
    const { data: maxRow } = await supabaseAdmin
      .from("style_templates")
      .select("sort_order")
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    const sort_order = ((maxRow?.sort_order as number | undefined) ?? 0) + 10;
    const { error } = await supabaseAdmin.from("style_templates").insert({
      id,
      name: data.name,
      prompt: data.prompt ?? "",
      image_url: data.image_url ?? null,
      sort_order,
    } as never);
    if (error) throw new Error(error.message);
    return { ok: true, id };
  });

export const adminDeleteStyleTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().min(1).max(64) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin.from("style_templates").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminGetSystemPrompt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data, error } = await supabaseAdmin
      .from("admin_settings")
      .select("system_prompt, updated_at")
      .eq("id", 1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { system_prompt: data?.system_prompt ?? "", updated_at: data?.updated_at ?? null };
  });

export const adminSetSystemPrompt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ system_prompt: z.string().max(4000) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin
      .from("admin_settings")
      .upsert({ id: 1, system_prompt: data.system_prompt, updated_at: new Date().toISOString() });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Public: anyone (including unauthenticated) can fetch contact info to display
export const getContactInfo = createServerFn({ method: "GET" })
  .handler(async () => {
    const { data } = await supabaseAdmin
      .from("admin_settings")
      .select("contact_wechat, contact_qq")
      .eq("id", 1)
      .maybeSingle();
    return {
      wechat: ((data as any)?.contact_wechat ?? "") as string,
      qq: ((data as any)?.contact_qq ?? "") as string,
    };
  });

export const adminGetContactInfo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data, error } = await supabaseAdmin
      .from("admin_settings")
      .select("contact_wechat, contact_qq, updated_at")
      .eq("id", 1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return {
      wechat: ((data as any)?.contact_wechat ?? "") as string,
      qq: ((data as any)?.contact_qq ?? "") as string,
      updated_at: (data as any)?.updated_at ?? null,
    };
  });

export const adminSetContactInfo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      wechat: z.string().max(120).default(""),
      qq: z.string().max(120).default(""),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin
      .from("admin_settings")
      .upsert({
        id: 1,
        contact_wechat: data.wechat.trim(),
        contact_qq: data.qq.trim(),
        updated_at: new Date().toISOString(),
      } as never);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Generate a random creative prompt via Lovable AI Gateway
export const generateRandomPrompt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("AI 服务未配置");
    const themes = [
      "电商产品", "时尚人像", "未来科幻", "自然风光", "复古胶片",
      "美食摄影", "极简静物", "建筑空间", "梦幻插画", "国风山水",
      "赛博朋克", "ins 极简", "小红书风", "工业摄影", "宠物萌宠",
    ];
    const seed = themes[Math.floor(Math.random() * themes.length)];
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          {
            role: "system",
            content:
              "你是顶级 AI 绘画提示词专家。每次只输出一条中文提示词，描述具体场景、主体、光影、镜头、色调、氛围，60-120字，不要使用引号、序号、Markdown、解释，也不要写比例或分辨率。",
          },
          { role: "user", content: `请围绕「${seed}」随机生成一条全新的高质量绘画提示词。` },
        ],
        temperature: 1.1,
      }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(`生成失败：${res.status} ${t.slice(0, 200)}`);
    }
    const data = await res.json();
    const text = (data?.choices?.[0]?.message?.content ?? "").toString().trim().replace(/^["「『]+|["」』]+$/g, "");
    if (!text) throw new Error("AI 未返回内容");
    return { prompt: text };
  });

// --- Admin: Test a model end-to-end (submit + poll for async) ---
export const adminTestModel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      modelKey: z.string().min(1).max(64),
      prompt: z.string().min(1).max(500).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const startedAt = Date.now();
    await assertAdmin(context.userId);

    const { base_url, global_api_key } = await loadGlobalConfig();
    const { data: model, error: mErr } = await supabaseAdmin
      .from("models_config")
      .select("model_key, name, api_url, api_key, request_format, prompt_key, extra_params, is_enabled")
      .eq("model_key", data.modelKey)
      .maybeSingle();
    if (mErr) throw new Error(mErr.message);
    if (!model) throw new Error("模型不存在");
    if ((model as any).model_key === FOXAPI_BACKUP_MODEL_KEY) {
      const extraParams = ((model as any).extra_params ?? {}) as Record<string, unknown>;
      const testImageUrl = [extraParams.testImageUrl, extraParams.test_image_url, extraParams.referenceImageUrl, extraParams.reference_image_url]
        .find((value): value is string => typeof value === "string" && /^https?:\/\//i.test(value));
      if (!testImageUrl) {
        return { ok: false, stage: "config", message: "Backup model test requires extra_params.testImageUrl.", elapsedMs: Date.now() - startedAt, imageUrl: null as string | null };
      }
      const submit = await submitFoxApiImageEdit({ prompt: (data.prompt && data.prompt.trim()) || "a high quality product photo edit", imageUrl: testImageUrl });
      if (!submit.ok) {
        return { ok: false, stage: "submit", message: submit.message, elapsedMs: Date.now() - startedAt, imageUrl: null as string | null };
      }
      const deadline = Date.now() + 300_000;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 2500));
        const poll = await pollFoxApiTask(submit.taskId);
        if (poll.status === "succeeded") {
          return { ok: true, stage: "result", message: "Test succeeded", elapsedMs: Date.now() - startedAt, imageUrl: poll.imageUrl };
        }
        if (poll.status === "failed") {
          return { ok: false, stage: "result", message: poll.message, elapsedMs: Date.now() - startedAt, imageUrl: null as string | null };
        }
      }
      return { ok: false, stage: "timeout", message: `Task submitted (taskId=${submit.taskId}), but did not complete within 300 seconds`, elapsedMs: Date.now() - startedAt, imageUrl: null as string | null };
    }
    if (!model.api_url) {
      return { ok: false, stage: "config", message: "未配置 API 接口地址", elapsedMs: Date.now() - startedAt, imageUrl: null as string | null };
    }

    const targetKey = normalizeUpstreamApiKey((model as any).api_key) || normalizeUpstreamApiKey(global_api_key);
    const pureApiKey = String(targetKey).replace(/Bearer\s+/i, "").trim();
    if (!pureApiKey) {
      return { ok: false, stage: "config", message: "未配置该模型或全局 API Key", elapsedMs: Date.now() - startedAt, imageUrl: null };
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Authorization": pureApiKey,
    };
    const submitUrl = resolveUrl(base_url, model.api_url);
    const promptKey = (model as any).prompt_key || "prompt";
    const requestFormat = (model as any).request_format || "async_id";
    const testPrompt = (data.prompt && data.prompt.trim()) || "a cute orange tabby kitten sitting in a sunny garden, soft natural light, high detail";

    // 占位符替换（同 generateImage 的精简版，不带参考图）
    const WAN_SIZE_MAP: Record<string, string> = { "1:1": "1280*1280" };
    const wanSize = WAN_SIZE_MAP["1:1"];
    const substitute = (v: any): any => {
      if (typeof v === "string") {
        return v
          .replace(/\{\{\s*wan_size\s*\}\}/g, wanSize)
          .replace(/\{\{\s*grok_aspect\s*\}\}/g, "1:1")
          .replace(/\{\{\s*size\s*\}\}/g, "1K")
          .replace(/\{\{\s*aspect\s*\}\}/g, "1:1")
          .replace(/\{\{\s*prompt\s*\}\}/g, testPrompt)
          .replace(/\{\{\s*urls\s*\}\}/g, "");
      }
      if (Array.isArray(v)) return v.map(substitute);
      if (v && typeof v === "object") {
        const o: Record<string, any> = {};
        for (const k of Object.keys(v)) o[k] = substitute(v[k]);
        return o;
      }
      return v;
    };
    const extra = substitute((model as any).extra_params ?? {}) as Record<string, unknown>;
    // 清掉空字符串占位（urls）
    for (const k of Object.keys(extra)) {
      if (extra[k] === "" || (Array.isArray(extra[k]) && (extra[k] as any[]).length === 0)) {
        delete extra[k];
      }
    }
    const body: Record<string, unknown> = { [promptKey]: testPrompt, ...extra };

    // 提交
    let res: Response;
    try {
      res = await fetch(submitUrl, { method: "POST", headers, body: JSON.stringify(body) });
    } catch (e: any) {
      return { ok: false, stage: "submit", message: `网络错误：${e?.message ?? "fetch 失败"}`, elapsedMs: Date.now() - startedAt, imageUrl: null };
    }
    const text = await res.text();
    const json: any = parseUpstreamResponse(text);
    if (!res.ok) {
      const msg = (json?.msg ?? json?.error?.message ?? text ?? "").toString().slice(0, 300);
      return { ok: false, stage: "submit", message: `HTTP ${res.status}: ${msg || "(空响应)"}`, elapsedMs: Date.now() - startedAt, imageUrl: null };
    }
    if (Number(json?.code) >= 400) {
      return { ok: false, stage: "submit", message: `上游 code=${json?.code}: ${(json?.msg ?? "").toString().slice(0, 200)}`, elapsedMs: Date.now() - startedAt, imageUrl: null };
    }

    if (requestFormat === "sync_url") {
      const url = extractImageUrl(json ?? text);
      if (!url) return { ok: false, stage: "result", message: "上游未返回图片 URL", elapsedMs: Date.now() - startedAt, imageUrl: null };
      return { ok: true, stage: "result", message: "测试成功", elapsedMs: Date.now() - startedAt, imageUrl: url };
    }

    // 异步：轮询任务
    const taskId: string | null =
      json?.data?.id ?? json?.id ?? json?.task_id ?? (typeof json?.data === "string" ? json.data : null);
    if (!taskId) {
      return { ok: false, stage: "submit", message: `提交成功但未返回任务 ID：${text.slice(0, 200)}`, elapsedMs: Date.now() - startedAt, imageUrl: null };
    }

    const deadline = Date.now() + 300_000; // 最多轮询 300s
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 2500));
      const detailUrl = `https://api.wuyinkeji.com/api/async/detail?id=${encodeURIComponent(taskId)}`;
      try {
        const r = await fetch(detailUrl, { method: "GET", headers });
        const t = await r.text();
        const j: any = parseUpstreamResponse(t);
        if (!r.ok) continue;
        const status = Number(j?.data?.status);
        if (status === 2) {
          const url = extractImageUrl(j?.data) ?? extractImageUrl(j);
          if (url) return { ok: true, stage: "result", message: "测试成功", elapsedMs: Date.now() - startedAt, imageUrl: url };
        }
        if (status === 3) {
          return { ok: false, stage: "result", message: `任务失败：${(j?.data?.message ?? j?.msg ?? "").toString().slice(0, 200) || "上游拒绝"}`, elapsedMs: Date.now() - startedAt, imageUrl: null };
        }
      } catch { /* keep polling */ }
    }
    return { ok: false, stage: "timeout", message: `任务已提交（taskId=${taskId}），但 300 秒内未生成完成`, elapsedMs: Date.now() - startedAt, imageUrl: null };
  });
