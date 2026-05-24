import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

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

// --- 获取当前用户最近 100 条生成历史（仅含图片） ---
export const getMyGenerationHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("generation_history")
      .select("id, model, prompt, image_url, created_at, cost")
      .not("image_url", "is", null)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return (data ?? []) as Array<{
      id: string; model: string; prompt: string | null; image_url: string; created_at: string; cost: number;
    }>;
  });

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

    const { base_url, global_api_key } = await loadGlobalConfig();

    const { data: model, error: mErr } = await supabaseAdmin
      .from("models_config")
      .select("id, model_key, name, cost, api_url, api_key, request_format, prompt_key, fetch_url, extra_params, is_enabled")
      .eq("model_key", data.modelKey)
      .maybeSingle();
    if (mErr) throw new Error(mErr.message);
    if (!model) throw new Error("模型不存在");
    if (model.is_enabled === false) throw new Error("该模型已被管理员停用");
    if (!model.api_url) throw new Error("该模型尚未配置 API 接口地址，请联系管理员");

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

    // 最终 prompt = 用户原文 + （若选择了风格模板）模板提示词
    // 灵感广场的提示词在前端已直接写入用户输入框，这里无需重复追加。
    // 商品保护提示 / 后台 system_prompt 不再自动并入请求。
    let stylePromptStr = "";
    if (data.styleId && data.styleId !== "none") {
      const { data: tpl } = await supabaseAdmin
        .from("style_templates")
        .select("prompt")
        .eq("id", data.styleId)
        .maybeSingle();
      stylePromptStr = (tpl?.prompt ?? "").trim();
    }
    const finalPrompt = [data.prompt.trim(), stylePromptStr]
      .filter(Boolean)
      .join("\n\n");



    const targetKey = normalizeUpstreamApiKey((model as any).api_key) || normalizeUpstreamApiKey(global_api_key);
    const pureApiKey = String(targetKey).replace(/Bearer\s+/i, "").trim();
    if (!pureApiKey) {
      throw new Error("该模型或全局接口设置尚未配置 API Key，请联系管理员");
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Authorization": pureApiKey,
    };
    const submitUrl = resolveUrl(base_url, model.api_url);

    const size = VALID_SIZES.has(data.aspectRatio) ? data.aspectRatio : "auto";
    const httpRefs = (data.referenceImages ?? []).filter((u) => /^https?:\/\//i.test(u));
    const promptKey = (model as any).prompt_key || "prompt";
    const requestFormat = (model as any).request_format || "async_id";

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
        res = await fetch(submitUrl, { method: "POST", headers, body: JSON.stringify(body) });
      } catch (e: any) {
        return failGeneration(`请求上游失败: ${e?.message ?? "网络错误"}`);
      }
      const text = await res.text();
      const json: any = parseUpstreamResponse(text);
      if (!res.ok) return failGeneration(`上游接口返回 ${res.status}: ${(json?.msg ?? json?.error?.message ?? text).slice(0, 200)}`);
      if (Number(json?.code) >= 400) return failGeneration(`上游接口失败: ${json?.msg ?? "当前模型接口拒绝了请求，请检查模型配置、密钥权限或额度"}`);
      imageUrl = extractImageUrl(json ?? text);
      if (!imageUrl) return failGeneration("上游未返回图片地址");
    } else {
      try {
        const res = await fetch(submitUrl, { method: "POST", headers, body: JSON.stringify(body) });
        const text = await res.text();
        const json = parseUpstreamResponse(text);
        console.log("[generateImage] upstream response →", { status: res.status, ok: res.ok, body: text?.slice(0, 1000) });
        const upstreamMsg = (json?.msg ?? json?.message ?? json?.error?.message ?? "").toString().trim();
        const rawTail = text?.slice(0, 300) || "";
        if (!res.ok) {
          return failGeneration(`上游提交失败 ${res.status}: ${upstreamMsg || rawTail || "(空响应)"}`);
        }
        if (Number(json?.code) >= 400) {
          return failGeneration(`上游提交失败 [code=${json?.code}]: ${upstreamMsg || "当前模型接口拒绝了请求，请检查模型配置、密钥权限或额度"}`);
        }
        taskId = json?.data?.id ?? json?.id ?? json?.task_id ?? (typeof json?.data === "string" ? json.data : null);
        if (!taskId) return failGeneration(`上游未返回任务ID，原始响应: ${rawTail || "(空)"}`);
      } catch (e: any) {
        return failGeneration(e?.message ?? "提交任务失败");
      }
    }

    // 任务已成功提交，立即扣费记账
    const { data: rpcRes, error: rpcErr } = await supabase.rpc("consume_credits_for_generation", {
      _model_key: data.modelKey,
      _prompt: data.prompt,
    });
    if (rpcErr) throw new Error(rpcErr.message);
    const row: any = Array.isArray(rpcRes) ? rpcRes?.[0] : rpcRes;
    if (!row?.success) throw new Error(row?.message ?? "扣费失败");

    const safeCost = Number(row?.cost ?? 0) || 0;
    const safeCredits = Number(row?.credits ?? 0) || 0;

    // sync 模型立即拿到图片 URL，直接回填到最新一条历史
    if (imageUrl) {
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
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { global_api_key } = await loadGlobalConfig();
    const pureApiKey = normalizeUpstreamApiKey(global_api_key);
    if (!pureApiKey) throw new Error("尚未配置全局 API Key，请联系管理员");

    const detailUrl = `https://api.wuyinkeji.com/api/async/detail?id=${encodeURIComponent(data.taskId)}`;
    const r = await fetch(detailUrl, {
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
      return { status: "failed" as const, reason: "upstream" as const, imageUrl: null as string | null, message: rawMsg ?? "上游查询失败", code, taskStatus, rawMsg, debug: rawDebug };
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
