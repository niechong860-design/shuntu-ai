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

// --- Models config ---
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

// --- Generation: deduct credits + log history ---
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

    // Merge models from both maps
    const modelKeys = new Set<string>([...todayMap.keys(), ...allMap.keys()]);
    let models = Array.from(modelKeys).map((m) => ({
      model: m,
      todayCount: todayMap.get(m)?.count ?? 0,
      totalCount: allMap.get(m)?.count ?? 0,
      totalCost: allMap.get(m)?.cost ?? 0,
    }));

    // Seed with mock if no data yet
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

