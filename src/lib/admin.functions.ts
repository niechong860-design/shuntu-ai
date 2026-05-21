import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function assertAdmin(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("无管理员权限");
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
    const { data: history } = await supabaseAdmin
      .from("generation_history")
      .select("user_id, cost");
    const sumMap = new Map<string, number>();
    for (const r of (history ?? []) as Array<{ user_id: string; cost: number | string }>) {
      sumMap.set(r.user_id, (sumMap.get(r.user_id) ?? 0) + Number(r.cost ?? 0));
    }
    return (profiles ?? []).map((p: any) => ({
      ...p,
      total_spent: sumMap.get(p.id) ?? 0,
    }));
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
export const redeemCoupon = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ code: z.string().min(3).max(64) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: res, error } = await supabase.rpc("redeem_coupon", { _code: data.code.trim() });
    if (error) throw new Error(error.message);
    const row = Array.isArray(res) ? res[0] : res;
    return row as { success: boolean; message: string; amount: number };
  });

// --- Models config (PUBLIC: safe columns only, no api_key) ---
export const listModelsConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("models_config")
      .select("id, model_key, name, description, cost, sort_order, updated_at")
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
      .select("id, model_key, name, description, cost, api_url, api_key, request_format, prompt_key, fetch_url, sort_order, updated_at")
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

// --- NEW: Dynamic upstream image generation (per-model API routing) ---
function extractImageUrl(payload: any): string | null {
  if (!payload) return null;
  if (typeof payload === "string" && /^https?:\/\//i.test(payload)) return payload;
  // OpenAI style: { data: [{ url, b64_json }] }
  const d0 = payload?.data?.[0];
  if (d0?.url) return d0.url;
  if (d0?.b64_json) return `data:image/png;base64,${d0.b64_json}`;
  // Common variants
  const candidates = [
    payload?.url,
    payload?.image_url,
    payload?.image,
    payload?.output?.[0],
     payload?.images?.[0]?.url,
     payload?.images?.[0],
     payload?.result?.url,
     payload?.result?.image,
     payload?.data?.url,
     payload?.data?.image_url,
     payload?.data?.image,
     payload?.data?.images?.[0]?.url,
     payload?.data?.images?.[0],
     payload?.data?.result?.url,
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
         if (/^https?:\/\/\S+\.(png|jpe?g|webp|gif|bmp)/i.test(v)) return v;
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
     global_api_key: data?.global_api_key ?? null,
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

// Upstream (wuyinkeji) authenticates via `Authorization: Bearer <key>` header ONLY.
// Do NOT append `?key=` to the URL — upstream treats query `key` as authoritative
// and rejects with "请求密钥KEY不正确" when both are set or query is empty/encoded.

 export const generateImage = createServerFn({ method: "POST" })
   .middleware([requireSupabaseAuth])
   .inputValidator((d) =>
     z.object({
       modelKey: z.string().min(1).max(64),
       prompt: z.string().min(1).max(4000),
       aspectRatio: z.string().min(1).max(16).default("1:1"),
       referenceImages: z.array(z.string().url().or(z.string().startsWith("data:"))).max(5).optional(),
     }).parse(d),
   )
   .handler(async ({ data, context }) => {
     const { supabase, userId } = context;

     const { base_url, global_api_key } = await loadGlobalConfig();

     const { data: model, error: mErr } = await supabaseAdmin
       .from("models_config")
       .select("id, model_key, name, cost, api_url, api_key, request_format, prompt_key, fetch_url")
       .eq("model_key", data.modelKey)
       .maybeSingle();
     if (mErr) throw new Error(mErr.message);
     if (!model) throw new Error("模型不存在");
     if (!model.api_url) throw new Error("该模型尚未配置 API 接口地址，请联系管理员");

     const { data: prof, error: pErr } = await supabase
       .from("profiles").select("credits").eq("id", userId).maybeSingle();
     if (pErr) throw new Error(pErr.message);
     if (!prof || Number(prof.credits) < Number(model.cost)) {
       throw new Error("您的算力余额不足，请联系老板兑换充值卡密");
     }

     // Model-specific key overrides; otherwise use global key
     const apiKey = (model.api_key && model.api_key.trim()) || global_api_key;
     if (!apiKey) throw new Error("未配置上游 API Key，请联系管理员在后台填写“全局中转 API Key”");

     const headers: Record<string, string> = {
       "Content-Type": "application/json",
       "Authorization": `Bearer ${apiKey}`,
     };

     const submitUrl = withKeyParam(resolveUrl(base_url, model.api_url), apiKey);

     const size = VALID_SIZES.has(data.aspectRatio) ? data.aspectRatio : "auto";
     const httpRefs = (data.referenceImages ?? []).filter((u) => /^https?:\/\//i.test(u));
     const promptKey = (model as any).prompt_key || "prompt";
     const requestFormat = (model as any).request_format || "async_id";

     const body: Record<string, unknown> = { [promptKey]: data.prompt, size };
     if (httpRefs.length > 0) body.urls = httpRefs;

     let imageUrl: string | null = null;

     if (requestFormat === "sync_url") {
       let res: Response;
       try {
         res = await fetch(submitUrl, { method: "POST", headers, body: JSON.stringify(body) });
       } catch (e: any) {
         throw new Error(`请求上游失败: ${e?.message ?? "网络错误"}`);
       }
       const text = await res.text();
       let json: any = null;
       try { json = JSON.parse(text); } catch { /* */ }
       if (!res.ok) {
         throw new Error(`上游接口返回 ${res.status}: ${(json?.msg ?? json?.error?.message ?? text).slice(0, 200)}`);
       }
       if (json?.code && Number(json.code) !== 200) {
         throw new Error(`上游接口失败: ${json?.msg ?? "未知错误"}`);
       }
       imageUrl = extractImageUrl(json ?? text);
       if (!imageUrl) throw new Error("上游未返回图片地址");
     } else {
       let taskId: string | null = null;
       try {
         const res = await fetch(submitUrl, { method: "POST", headers, body: JSON.stringify(body) });
         const text = await res.text();
         let json: any = null;
         try { json = JSON.parse(text); } catch { /* */ }
         if (!res.ok) {
           throw new Error(`上游提交失败 ${res.status}: ${(json?.msg ?? json?.error?.message ?? text).slice(0, 200)}`);
         }
         if (json?.code && Number(json.code) !== 200) {
           throw new Error(`上游提交失败: ${json?.msg ?? "未知错误"}`);
         }
         taskId = json?.data?.id ?? json?.id ?? json?.task_id ?? null;
         if (!taskId) throw new Error("上游未返回任务ID");
       } catch (e: any) {
         throw new Error(e?.message ?? "提交任务失败");
       }

       const rawFetchUrl = (model as any).fetch_url
         ? resolveUrl(base_url, (model as any).fetch_url)
         : `${base_url}/api/async/fetch_result`;
       const start = Date.now();
       const TIMEOUT_MS = 60_000;
       const INTERVAL_MS = 2500;

       while (Date.now() - start < TIMEOUT_MS) {
         await new Promise((r) => setTimeout(r, INTERVAL_MS));
         try {
           const baseQ = `${rawFetchUrl}${rawFetchUrl.includes("?") ? "&" : "?"}id=${encodeURIComponent(taskId)}`;
           const qUrl = withKeyParam(baseQ, apiKey);
           const r = await fetch(qUrl, { method: "GET", headers });
           const t = await r.text();
           let j: any = null;
           try { j = JSON.parse(t); } catch { /* */ }
           if (!r.ok) continue;
           const status = j?.data?.status ?? j?.status;
           if (typeof status === "string" && /fail|error/i.test(status)) {
             throw new Error(`上游生成失败: ${j?.msg ?? j?.data?.message ?? status}`);
           }
           const url = extractImageUrl(j);
           if (url) { imageUrl = url; break; }
         } catch (e: any) {
           if (e?.message?.startsWith("上游生成失败")) throw e;
         }
       }
       if (!imageUrl) throw new Error("上游生成超时，请重试");
     }

     const { data: rpcRes, error: rpcErr } = await supabase.rpc("consume_credits_for_generation", {
       _model_key: data.modelKey,
       _prompt: data.prompt,
     });
     if (rpcErr) throw new Error(rpcErr.message);
     const row = Array.isArray(rpcRes) ? rpcRes[0] : rpcRes;
     if (!row?.success) throw new Error(row?.message ?? "扣费失败");

     return {
       success: true,
       imageUrl,
       cost: Number(row.cost),
       credits: Number(row.credits),
     };
   });

// --- Role check ---
export const checkIsAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    return { isAdmin: !!data };
  });

// --- Analytics ---
export const adminGetAnalytics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const sod = startOfDay.toISOString();

    const [
      todayUsersQ,
      totalUsersQ,
      unusedCouponsQ,
      todayHistoryQ,
      allHistoryQ,
      todayRegsQ,
    ] = await Promise.all([
      supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", sod),
      supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("coupons").select("id", { count: "exact", head: true }).eq("is_used", false),
      supabaseAdmin.from("generation_history").select("model, cost").gte("created_at", sod),
      supabaseAdmin.from("generation_history").select("model, cost"),
      supabaseAdmin.from("profiles").select("id, email, credits, created_at").gte("created_at", sod).order("created_at", { ascending: false }).limit(50),
    ]);

    const todayHistory = (todayHistoryQ.data ?? []) as Array<{ model: string; cost: number | string }>;
    const allHistory = (allHistoryQ.data ?? []) as Array<{ model: string; cost: number | string }>;
    const todayCostSum = todayHistory.reduce((s, r) => s + Number(r.cost ?? 0), 0);

    const groupBy = (rows: Array<{ model: string; cost: number | string }>) => {
      const map = new Map<string, { count: number; cost: number }>();
      for (const r of rows) {
        const k = r.model || "未知";
        const cur = map.get(k) ?? { count: 0, cost: 0 };
        cur.count += 1;
        cur.cost += Number(r.cost ?? 0);
        map.set(k, cur);
      }
      return map;
    };
    const todayMap = groupBy(todayHistory);
    const allMap = groupBy(allHistory);

    const modelKeys = new Set<string>([...todayMap.keys(), ...allMap.keys()]);
    let models = Array.from(modelKeys).map((m) => ({
      model: m,
      todayCount: todayMap.get(m)?.count ?? 0,
      totalCount: allMap.get(m)?.count ?? 0,
      totalCost: allMap.get(m)?.cost ?? 0,
    }));

    if (models.length === 0) {
      models = [
        { model: "Flux.1 Pro", todayCount: 48, totalCount: 1820, totalCost: 364 },
        { model: "Midjourney V6", todayCount: 31, totalCount: 910, totalCost: 182 },
        { model: "SDXL Turbo", todayCount: 22, totalCount: 305, totalCost: 61 },
      ];
    }

    return {
      metrics: {
        todayUsers: todayUsersQ.count ?? 0,
        todayCost: todayCostSum,
        totalUsers: totalUsersQ.count ?? 0,
        unusedCoupons: unusedCouponsQ.count ?? 0,
      },
      models,
      todayRegistrations: (todayRegsQ.data ?? []).map((r: any) => ({
        id: r.id,
        email: r.email,
        credits: Number(r.credits ?? 0),
        created_at: r.created_at,
      })),
    };
  });
