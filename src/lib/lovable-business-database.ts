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
  ModelConfig,
  Profile,
  RechargePackage,
  RedeemCouponInput,
  RedeemCouponResult,
  UpdateProfileInput,
  UpdateGenerationTaskLifecycleInput,
  UserOrder,
} from "@/lib/business-database";
import { randomId } from "@/lib/business-database";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type SupabaseLike = typeof supabaseAdmin;
type LovableBusinessDatabaseOptions = {
  admin?: SupabaseLike;
  user?: unknown;
};

export class LovableBusinessDatabase implements BusinessDatabase {
  readonly primary = "lovable" as const;
  private readonly admin: SupabaseLike;
  private readonly user: any;

  constructor(options: LovableBusinessDatabaseOptions | SupabaseLike = {}) {
    if (isSupabaseLike(options)) {
      this.admin = options;
      this.user = options;
      return;
    }
    this.admin = options.admin ?? supabaseAdmin;
    this.user = options.user ?? this.admin;
  }

  async getProfile(userId: string): Promise<Profile | null> {
    const { data, error } = await this.admin.from("profiles").select("*").eq("id", userId).maybeSingle();
    if (error) throw new Error(error.message);
    return (data as Profile | null) ?? null;
  }

  async ensureProfile(input: { id: string; email?: string | null; displayName?: string | null; avatarUrl?: string | null; now?: string }): Promise<Profile> {
    const existing = await this.getProfile(input.id);
    if (existing) return existing;
    const now = input.now ?? new Date().toISOString();
    const insert = {
      id: input.id,
      email: input.email ?? null,
      display_name: input.displayName ?? null,
      avatar_url: input.avatarUrl ?? null,
      created_at: now,
      updated_at: now,
    };
    const { data, error } = await this.admin.from("profiles").insert(insert as never).select("*").single();
    if (error) throw new Error(error.message);
    return data as Profile;
  }

  async updateProfile(input: UpdateProfileInput): Promise<Profile> {
    const now = input.now ?? new Date().toISOString();
    await this.ensureProfile({
      id: input.userId,
      email: input.email,
      displayName: input.displayName,
      avatarUrl: input.avatarUrl,
      now,
    });
    const patch: Record<string, unknown> = { updated_at: now };
    assignDefined(patch, "email", input.email);
    assignDefined(patch, "display_name", input.displayName);
    assignDefined(patch, "avatar_url", input.avatarUrl);
    const { data, error } = await this.admin
      .from("profiles")
      .update(patch as never)
      .eq("id", input.userId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data as Profile;
  }

  async getCredits(userId: string): Promise<number> {
    const profile = await this.getProfile(userId);
    return Number(profile?.credits ?? 0);
  }

  async createGenerationTask(input: CreateGenerationTaskInput): Promise<GenerationTask> {
    const existing = await this.getGenerationTaskByRequestId(input.requestId);
    if (existing) return existing;
    const now = input.now ?? new Date().toISOString();
    const row = {
      id: input.id ?? randomId(),
      request_id: input.requestId,
      user_id: input.userId,
      status: "queued",
      model_id: input.modelId,
      prompt: input.prompt ?? null,
      input_params: input.inputParams ?? {},
      credits_required: input.creditsRequired,
      deduction_status: "not_charged",
      created_at: now,
      updated_at: now,
    };
    const { data, error } = await (this.admin as any).from("generation_tasks").insert(row).select("*").single();
    if (error) throw new Error(error.message);
    return data as GenerationTask;
  }

  async getGenerationTask(taskId: string): Promise<GenerationTask | null> {
    const { data, error } = await (this.admin as any).from("generation_tasks").select("*").eq("id", taskId).maybeSingle();
    if (error) throw new Error(error.message);
    return (data as GenerationTask | null) ?? null;
  }

  async getUserGenerationTask(input: { taskId: string; userId: string }): Promise<GenerationTask | null> {
    const { data, error } = await (this.admin as any)
      .from("generation_tasks")
      .select("*")
      .eq("id", input.taskId)
      .eq("user_id", input.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as GenerationTask | null) ?? null;
  }

  async getGenerationTaskByRequestId(requestId: string): Promise<GenerationTask | null> {
    const { data, error } = await (this.admin as any).from("generation_tasks").select("*").eq("request_id", requestId).maybeSingle();
    if (error) throw new Error(error.message);
    return (data as GenerationTask | null) ?? null;
  }

  async listUserGenerationTasks(input: {
    userId: string;
    statuses?: GenerationTask["status"][];
    deductionStatus?: GenerationTask["deduction_status"];
    limit?: number;
    order?: "asc" | "desc";
  }): Promise<GenerationTask[]> {
    let query = (this.admin as any).from("generation_tasks").select("*").eq("user_id", input.userId);
    if (input.statuses?.length) query = query.in("status", input.statuses);
    if (input.deductionStatus) query = query.eq("deduction_status", input.deductionStatus);
    query = query.order("created_at", { ascending: input.order !== "desc" });
    if (input.limit) query = query.limit(input.limit);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data ?? []) as GenerationTask[];
  }

  async countUserGenerationTasks(input: {
    userId: string;
    statuses?: GenerationTask["status"][];
    deductionStatus?: GenerationTask["deduction_status"];
  }): Promise<number> {
    let query = (this.admin as any)
      .from("generation_tasks")
      .select("id", { count: "exact", head: true })
      .eq("user_id", input.userId);
    if (input.statuses?.length) query = query.in("status", input.statuses);
    if (input.deductionStatus) query = query.eq("deduction_status", input.deductionStatus);
    const { count, error } = await query;
    if (error) throw new Error(error.message);
    return count ?? 0;
  }

  async claimQueuedGenerationTask(input: { taskId: string; userId: string; now?: string }): Promise<GenerationTask | null> {
    const now = input.now ?? new Date().toISOString();
    const { data, error } = await (this.admin as any)
      .from("generation_tasks")
      .update({ status: "running", started_at: now, updated_at: now })
      .eq("id", input.taskId)
      .eq("user_id", input.userId)
      .eq("status", "queued")
      .eq("deduction_status", "not_charged")
      .select("*")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as GenerationTask | null) ?? null;
  }

  async cancelUserQueuedGenerationTasks(input: { userId: string; now?: string }): Promise<number> {
    const now = input.now ?? new Date().toISOString();
    const { data, error } = await (this.admin as any)
      .from("generation_tasks")
      .update({ status: "canceled", completed_at: now, updated_at: now })
      .eq("user_id", input.userId)
      .eq("deduction_status", "not_charged")
      .in("status", ["queued", "running"])
      .select("id");
    if (error) throw new Error(error.message);
    return (data ?? []).length;
  }

  async cancelQueuedGenerationTask(input: { taskId: string; userId: string; now?: string }): Promise<GenerationTask | null> {
    const now = input.now ?? new Date().toISOString();
    const { data, error } = await (this.admin as any)
      .from("generation_tasks")
      .update({ status: "canceled", completed_at: now, updated_at: now })
      .eq("id", input.taskId)
      .eq("user_id", input.userId)
      .eq("status", "queued")
      .eq("deduction_status", "not_charged")
      .select("*")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as GenerationTask | null) ?? null;
  }

  async updateGenerationTaskLifecycle(input: UpdateGenerationTaskLifecycleInput): Promise<GenerationTask> {
    const patch: Record<string, unknown> = { updated_at: input.now ?? new Date().toISOString() };
    assignDefined(patch, "status", input.status);
    assignDefined(patch, "deduction_status", input.deductionStatus);
    assignDefined(patch, "deduction_id", input.deductionId);
    assignDefined(patch, "charged_at", input.chargedAt);
    assignDefined(patch, "refunded_at", input.refundedAt);
    assignDefined(patch, "result_image_url", input.resultImageUrl);
    assignDefined(patch, "result_payload", input.resultPayload);
    assignDefined(patch, "error_code", input.errorCode);
    assignDefined(patch, "error_message", input.errorMessage);
    assignDefined(patch, "started_at", input.startedAt);
    assignDefined(patch, "completed_at", input.completedAt);

    let query = (this.admin as any).from("generation_tasks").update(patch).eq("id", input.taskId);
    if (input.userId) query = query.eq("user_id", input.userId);
    const { data, error } = await query.select("*").single();
    if (error) throw new Error(error.message);
    return data as GenerationTask;
  }

  async consumeCreditsForGeneration(input: ConsumeCreditsForGenerationInput): Promise<ConsumeCreditsResult> {
    const { data, error } = await this.user.rpc("consume_credits_for_generation", {
      _model_key: input.modelKey,
      _prompt: input.prompt ?? "",
    });
    if (error) throw new Error(error.message);
    const row = Array.isArray(data) ? data[0] : data;
    return {
      success: Boolean(row?.success),
      message: String(row?.message ?? ""),
      credits: Number(row?.credits ?? 0),
      cost: Number(row?.cost ?? input.cost ?? 0),
      history_id: row?.history_id ?? null,
    };
  }

  async finalizeUserGenerationTaskOnce(input: FinalizeGenerationTaskInput): Promise<FinalizeGenerationTaskResult> {
    const { data, error } = await this.user.rpc("finalize_user_generation_task_once", {
      p_task_id: input.taskId,
      p_image_url: input.imageUrl,
    });
    if (error) throw new Error(error.message);
    const row = Array.isArray(data) ? data[0] : data;
    return {
      success: Boolean(row?.success),
      message: String(row?.message ?? ""),
      credits: row?.credits == null ? 0 : Number(row.credits),
      cost: row?.cost == null ? 0 : Number(row.cost),
      history_id: row?.history_id ?? null,
      deduction_status: row?.deduction_status ?? null,
    };
  }

  async getGenerationHistory(input: { historyId: string; userId?: string }): Promise<GenerationHistory | null> {
    let query = (this.admin as any).from("generation_history").select("*").eq("id", input.historyId);
    if (input.userId) query = query.eq("user_id", input.userId);
    const { data, error } = await query.maybeSingle();
    if (error) throw new Error(error.message);
    return (data as GenerationHistory | null) ?? null;
  }

  async listGenerationHistory(input: {
    userId?: string;
    since?: string;
    imageOnly?: boolean;
    limit: number;
    offset: number;
  }): Promise<{ rows: GenerationHistory[]; total: number }> {
    const endIdx = input.offset + input.limit - 1;
    let query = (this.admin as any)
      .from("generation_history")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(input.offset, endIdx);
    if (input.imageOnly) query = query.not("image_url", "is", null);
    if (input.userId) query = query.eq("user_id", input.userId);
    if (input.since) query = query.gte("created_at", input.since);
    const { data, error, count } = await query;
    if (error) throw new Error(error.message);
    return { rows: (data ?? []) as GenerationHistory[], total: count ?? (data ?? []).length };
  }

  async getGenerationTasksByIds(taskIds: string[]): Promise<GenerationTask[]> {
    if (taskIds.length === 0) return [];
    const { data, error } = await (this.admin as any).from("generation_tasks").select("*").in("id", taskIds);
    if (error) throw new Error(error.message);
    return (data ?? []) as GenerationTask[];
  }

  async getProfilesByIds(userIds: string[]): Promise<Profile[]> {
    if (userIds.length === 0) return [];
    const { data, error } = await (this.admin as any).from("profiles").select("*").in("id", userIds);
    if (error) throw new Error(error.message);
    return (data ?? []) as Profile[];
  }

  async setGenerationHistoryImageUrl(input: { historyId: string; userId: string; imageUrl: string; now?: string }): Promise<GenerationHistory> {
    const { data, error } = await (this.admin as any)
      .from("generation_history")
      .update({ image_url: input.imageUrl })
      .eq("id", input.historyId)
      .eq("user_id", input.userId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data as GenerationHistory;
  }

  async setLatestGenerationHistoryImageUrl(input: { userId: string; modelName: string; imageUrl: string }): Promise<void> {
    const { error } = await this.user.rpc("set_latest_history_image", {
      _model: input.modelName,
      _image_url: input.imageUrl,
    });
    if (error) throw new Error(error.message);
  }

  async createUserOrder(input: { id?: string; userId: string; outTradeNo: string; amount: number; credits: number; payType?: string | null; now?: string }): Promise<UserOrder> {
    const now = input.now ?? new Date().toISOString();
    const { data, error } = await (this.admin as any).from("user_orders").insert({
      id: input.id ?? randomId(),
      user_id: input.userId,
      out_trade_no: input.outTradeNo,
      amount: input.amount,
      credits: input.credits,
      status: "pending",
      pay_type: input.payType ?? null,
      created_at: now,
      updated_at: now,
    }).select("*").single();
    if (error) throw new Error(error.message);
    return data as UserOrder;
  }

  async getUserOrder(input: { outTradeNo: string; userId: string }): Promise<UserOrder | null> {
    const { data, error } = await (this.admin as any)
      .from("user_orders")
      .select("*")
      .eq("out_trade_no", input.outTradeNo)
      .eq("user_id", input.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as UserOrder | null) ?? null;
  }

  async getOrderByOutTradeNo(outTradeNo: string): Promise<UserOrder | null> {
    const { data, error } = await (this.admin as any).from("user_orders").select("*").eq("out_trade_no", outTradeNo).maybeSingle();
    if (error) throw new Error(error.message);
    return (data as UserOrder | null) ?? null;
  }

  async completePaidOrder(input: CompletePaidOrderInput): Promise<CompletePaidOrderResult> {
    const before = await this.getOrderByOutTradeNo(input.outTradeNo);
    if (!before) return { success: false, message: "order not found", order: null, credits: null, alreadyPaid: false };
    if (before.status === "paid") return { success: true, message: "already paid", order: before, credits: before.credits, alreadyPaid: true };
    const { error } = await (this.admin as any).rpc("complete_paid_order", {
      _out_trade_no: input.outTradeNo,
      _trade_no: input.tradeNo,
    });
    if (error) throw new Error(error.message);
    const order = await this.getOrderByOutTradeNo(input.outTradeNo);
    return { success: order?.status === "paid", message: "paid", order, credits: order?.credits ?? null, alreadyPaid: false };
  }

  async redeemCoupon(input: RedeemCouponInput): Promise<RedeemCouponResult> {
    const { data, error } = await this.user.rpc("redeem_gift_card", { input_code: input.code.trim() });
    if (error) return { success: false, message: error.message || "兑换失败", amount: 0, credits: await this.getCredits(input.userId), redeem_log_id: null };
    const row = Array.isArray(data) ? data[0] : data;
    return {
      success: Boolean(row?.success),
      message: String(row?.message ?? ""),
      amount: Number(row?.amount ?? 0),
      credits: await this.getCredits(input.userId),
      redeem_log_id: null,
    };
  }

  async listModelsConfig(input: { includeSecrets?: boolean; enabledOnly?: boolean } = {}): Promise<ModelConfig[]> {
    const columns = input.includeSecrets
      ? "id, model_key, name, description, cost, api_url, api_key, request_format, prompt_key, fetch_url, extra_params, is_enabled, sort_order, created_at, updated_at"
      : "id, model_key, name, description, cost, extra_params, is_enabled, sort_order, updated_at";
    let query = (this.admin as any).from("models_config").select(columns).order("sort_order", { ascending: true });
    if (input.enabledOnly !== false) query = query.eq("is_enabled", true);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data ?? []) as ModelConfig[];
  }

  async getGlobalConfig(): Promise<Record<string, unknown> | null> {
    const { data, error } = await (this.admin as any).from("global_config").select("*").limit(1).maybeSingle();
    if (error) throw new Error(error.message);
    return data ?? null;
  }

  async getAdminSettings(): Promise<Record<string, unknown> | null> {
    const { data, error } = await (this.admin as any).from("admin_settings").select("*").eq("id", 1).maybeSingle();
    if (error) throw new Error(error.message);
    return data ?? null;
  }

  async listAnnouncements(): Promise<Record<string, unknown>[]> {
    const { data, error } = await (this.admin as any).from("announcements").select("*").order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  }

  async listAds(): Promise<Record<string, unknown>[]> {
    const { data, error } = await (this.admin as any).from("ads").select("*").order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  }

  async listStyleTemplates(): Promise<Record<string, unknown>[]> {
    const { data, error } = await (this.admin as any).from("style_templates").select("*").order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  }

  async listRechargePackages(): Promise<RechargePackage[]> {
    const { data, error } = await (this.admin as any)
      .from("recharge_packages")
      .select("*")
      .eq("is_visible", true)
      .order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as RechargePackage[];
  }

}

function assignDefined(target: Record<string, unknown>, key: string, value: unknown): void {
  if (value !== undefined) target[key] = value;
}

function isSupabaseLike(value: unknown): value is SupabaseLike {
  return !!value && typeof value === "object" && typeof (value as SupabaseLike).from === "function";
}
