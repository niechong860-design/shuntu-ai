export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type BusinessDatabasePrimary = "lovable" | "d1";
export type GenerationTaskStatus = "queued" | "running" | "succeeded" | "failed" | "canceled";
export type DeductionStatus = "not_charged" | "charged" | "refund_pending" | "refunded" | "charge_failed";

export type Profile = {
  id: string;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
  credits: number;
  created_at: string;
  updated_at: string;
};

export type UpdateProfileInput = {
  userId: string;
  email?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
  now?: string;
};

export type GenerationTask = {
  id: string;
  request_id: string;
  user_id: string;
  status: GenerationTaskStatus;
  model_id: string;
  prompt: string | null;
  input_params: JsonValue;
  credits_required: number;
  deduction_status: DeductionStatus;
  deduction_id: string | null;
  charged_at: string | null;
  refunded_at: string | null;
  result_image_url: string | null;
  result_payload: JsonValue | null;
  error_code: string | null;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type GenerationHistory = {
  id: string;
  user_id: string;
  model: string;
  cost: number;
  prompt: string | null;
  image_url: string | null;
  created_at: string;
  generation_task_id: string | null;
};

export type CreditUsageLog = {
  id: string;
  user_id: string;
  amount: number;
  source: string;
  model_key: string | null;
  model_name: string | null;
  generation_history_id: string | null;
  generation_task_id: string | null;
  idempotency_key: string;
  created_at: string;
  metadata: JsonValue | null;
};

export type UserOrder = {
  id: string;
  user_id: string;
  out_trade_no: string;
  amount: number;
  credits: number;
  status: string;
  pay_type: string | null;
  trade_no: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Coupon = {
  id: string;
  code: string;
  amount: number;
  is_used: boolean;
  used_by: string | null;
  used_by_email: string | null;
  used_at: string | null;
  created_at: string;
  created_by: string | null;
};

export type RedeemLog = {
  id: string;
  user_id: string;
  code: string;
  amount: number;
  success: boolean;
  error_message: string | null;
  redeemed_at: string;
};

export type ModelConfig = {
  id: string;
  model_key: string;
  name: string;
  description: string | null;
  cost: number;
  sort_order: number;
  api_url?: string | null;
  api_key?: string | null;
  request_format?: string | null;
  prompt_key?: string | null;
  fetch_url?: string | null;
  extra_params: JsonValue | null;
  is_enabled?: boolean;
  created_at?: string;
  updated_at: string;
};

export type RechargePackage = {
  id: string;
  title: string;
  subtitle: string | null;
  price: string;
  credits: number;
  features: JsonValue;
  badge_text: string | null;
  is_popular: boolean;
  highlighted: boolean;
  is_visible: boolean;
  sort_order: number;
  button_text: string;
  purchase_url: string | null;
  created_at: string;
  updated_at: string;
};

export type CreateGenerationTaskInput = {
  id?: string;
  requestId: string;
  userId: string;
  modelId: string;
  prompt?: string | null;
  inputParams?: JsonValue;
  creditsRequired: number;
  now?: string;
};

export type UpdateGenerationTaskLifecycleInput = {
  taskId: string;
  userId?: string;
  status?: GenerationTaskStatus;
  deductionStatus?: DeductionStatus;
  deductionId?: string | null;
  chargedAt?: string | null;
  refundedAt?: string | null;
  resultImageUrl?: string | null;
  resultPayload?: JsonValue | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  now?: string;
};

export type ConsumeCreditsForGenerationInput = {
  userId: string;
  modelKey: string;
  modelName?: string | null;
  prompt?: string | null;
  cost?: number;
  generationTaskId?: string | null;
  historyId?: string;
  ledgerId?: string;
  idempotencyKey?: string;
  now?: string;
};

export type ConsumeCreditsResult = {
  success: boolean;
  message: string;
  credits: number;
  cost: number;
  history_id: string | null;
};

export type AdminAdjustCreditsInput = {
  adminUserId: string;
  userId: string;
  delta: number;
  now?: string;
};

export type AdminAdjustCreditsResult = {
  credits: number;
  before: number;
  after: number;
  delta: number;
  ledgerId: string;
};

export type AdminUserBusinessRow = Profile & {
  total_spent: number;
};

export type AdminCreditUsageLogRow = CreditUsageLog & {
  image_url: string | null;
};

export type AdminAnalyticsData = {
  profiles: Profile[];
  usage: Array<Pick<CreditUsageLog, "model_key" | "model_name" | "amount" | "created_at">>;
  unusedCoupons: number;
};

export type FinalizeGenerationTaskInput = {
  taskId: string;
  userId: string;
  imageUrl: string;
  resultPayload?: JsonValue | null;
  now?: string;
  historyId?: string;
  ledgerId?: string;
};

export type FinalizeGenerationTaskResult = ConsumeCreditsResult & {
  deduction_status: DeductionStatus | null;
};

export type CompletePaidOrderInput = {
  outTradeNo: string;
  tradeNo: string;
  now?: string;
};

export type CompletePaidOrderResult = {
  success: boolean;
  message: string;
  order: UserOrder | null;
  credits: number | null;
  alreadyPaid: boolean;
};

export type RedeemCouponInput = {
  userId: string;
  code: string;
  userEmail?: string | null;
  now?: string;
  redeemLogId?: string;
};

export type RedeemCouponResult = {
  success: boolean;
  message: string;
  amount: number;
  credits: number | null;
  redeem_log_id: string | null;
};

export type ReplicationHealth = {
  d1Primary: boolean;
  pendingReplication: number;
  oldestPendingSeconds: number | null;
  lastReplicationAt: string | null;
};

export interface BusinessDatabase {
  readonly primary: BusinessDatabasePrimary;

  getProfile(userId: string): Promise<Profile | null>;
  ensureProfile(input: { id: string; email?: string | null; displayName?: string | null; avatarUrl?: string | null; now?: string }): Promise<Profile>;
  updateProfile(input: UpdateProfileInput): Promise<Profile>;
  getCredits(userId: string): Promise<number>;

  createGenerationTask(input: CreateGenerationTaskInput): Promise<GenerationTask>;
  getGenerationTask(taskId: string): Promise<GenerationTask | null>;
  getGenerationTaskByRequestId(requestId: string): Promise<GenerationTask | null>;
  getUserGenerationTask(input: { taskId: string; userId: string }): Promise<GenerationTask | null>;
  listUserGenerationTasks(input: {
    userId: string;
    statuses?: GenerationTaskStatus[];
    deductionStatus?: DeductionStatus;
    limit?: number;
    order?: "asc" | "desc";
  }): Promise<GenerationTask[]>;
  countUserGenerationTasks(input: {
    userId: string;
    statuses?: GenerationTaskStatus[];
    deductionStatus?: DeductionStatus;
  }): Promise<number>;
  claimQueuedGenerationTask(input: { taskId: string; userId: string; now?: string }): Promise<GenerationTask | null>;
  cancelUserQueuedGenerationTasks(input: { userId: string; now?: string }): Promise<number>;
  cancelQueuedGenerationTask(input: { taskId: string; userId: string; now?: string }): Promise<GenerationTask | null>;
  updateGenerationTaskLifecycle(input: UpdateGenerationTaskLifecycleInput): Promise<GenerationTask>;
  consumeCreditsForGeneration(input: ConsumeCreditsForGenerationInput): Promise<ConsumeCreditsResult>;
  adjustCreditsByAdmin(input: AdminAdjustCreditsInput): Promise<AdminAdjustCreditsResult>;
  listAdminUserBusinessRows?(): Promise<AdminUserBusinessRow[]>;
  listAdminCreditUsageLogs?(input: { userId: string; limit: number; offset: number }): Promise<{ rows: AdminCreditUsageLogRow[]; total: number }>;
  getAdminAnalyticsData?(): Promise<AdminAnalyticsData>;
  finalizeUserGenerationTaskOnce(input: FinalizeGenerationTaskInput): Promise<FinalizeGenerationTaskResult>;
  getGenerationHistory(input: { historyId: string; userId?: string }): Promise<GenerationHistory | null>;
  listGenerationHistory(input: {
    userId?: string;
    since?: string;
    imageOnly?: boolean;
    limit: number;
    offset: number;
  }): Promise<{ rows: GenerationHistory[]; total: number }>;
  getGenerationTasksByIds(taskIds: string[]): Promise<GenerationTask[]>;
  getProfilesByIds(userIds: string[]): Promise<Profile[]>;
  setGenerationHistoryImageUrl(input: { historyId: string; userId: string; imageUrl: string; now?: string }): Promise<GenerationHistory>;
  setLatestGenerationHistoryImageUrl(input: { userId: string; modelName: string; imageUrl: string }): Promise<void>;

  createUserOrder(input: { id?: string; userId: string; outTradeNo: string; amount: number; credits: number; payType?: string | null; now?: string }): Promise<UserOrder>;
  getUserOrder(input: { outTradeNo: string; userId: string }): Promise<UserOrder | null>;
  getOrderByOutTradeNo(outTradeNo: string): Promise<UserOrder | null>;
  completePaidOrder(input: CompletePaidOrderInput): Promise<CompletePaidOrderResult>;
  redeemCoupon(input: RedeemCouponInput): Promise<RedeemCouponResult>;
  listAdminCoupons?(): Promise<Coupon[]>;
  generateAdminCoupons?(input: { count: number; amount: number; createdBy: string }): Promise<Array<{ code: string; amount: number }>>;
  deleteAdminCoupon?(couponId: string): Promise<void>;

  listModelsConfig(input?: { includeSecrets?: boolean; enabledOnly?: boolean }): Promise<ModelConfig[]>;
  updateModel?(input: { id: string; patch: Record<string, unknown> }): Promise<void>;
  createModel?(input: Record<string, unknown> & { id?: string }): Promise<{ id: string }>;
  deleteModel?(id: string): Promise<void>;
  getGlobalConfig(): Promise<Record<string, unknown> | null>;
  getAdminSettings(): Promise<Record<string, unknown> | null>;
  updateAdminSettings?(patch: { access_password?: string; system_prompt?: string; contact_wechat?: string; contact_qq?: string }): Promise<void>;
  listAnnouncements(): Promise<Record<string, unknown>[]>;
  upsertAnnouncement?(input: { id?: string; title: string; content: string; type: string; image_url: string | null; link_url: string | null; link_label: string | null; is_pinned: boolean; is_published: boolean }): Promise<{ id: string }>;
  deleteAnnouncement?(id: string): Promise<void>;
  listAds(): Promise<Record<string, unknown>[]>;
  upsertAd?(input: { id?: string; title: string; link_url: string | null; is_active: boolean; sort_order: number }): Promise<{ id: string }>;
  deleteAd?(id: string): Promise<void>;
  listStyleTemplates(): Promise<Record<string, unknown>[]>;
  updateStyleTemplate?(input: { id: string; patch: { name?: string; prompt?: string; image_url?: string | null; sort_order?: number } }): Promise<void>;
  createStyleTemplate?(input: { id: string; name: string; prompt: string; image_url: string | null; sort_order: number }): Promise<{ id: string }>;
  deleteStyleTemplate?(id: string): Promise<void>;
  listRechargePackages(): Promise<RechargePackage[]>;
  upsertRechargePackage?(input: { id?: string; title: string; subtitle: string | null; price: string; credits: number; features: JsonValue; badge_text: string | null; is_popular: boolean; highlighted: boolean; is_visible: boolean; sort_order: number; button_text: string; purchase_url: string | null }): Promise<{ id: string }>;
  hideRechargePackage?(id: string): Promise<void>;
  deleteRechargePackage?(id: string): Promise<void>;
  getReplicationHealth?(now?: Date): Promise<ReplicationHealth>;
}

export type AdminConfigDatabase = Required<Pick<BusinessDatabase,
  | "updateModel" | "createModel" | "deleteModel" | "updateAdminSettings"
  | "upsertAnnouncement" | "deleteAnnouncement" | "upsertAd" | "deleteAd"
  | "updateStyleTemplate" | "createStyleTemplate" | "deleteStyleTemplate"
  | "upsertRechargePackage" | "hideRechargePackage" | "deleteRechargePackage"
>>;

export function creditsToCentiCredit(value: number | string, label = "credits"): number {
  return decimalToScaledInteger(value, 2, label);
}

export function centiCreditToCredits(value: number | string | null | undefined): number {
  if (value == null) return 0;
  const integer = integerFromDb(value, "centi-credit");
  return integer / 100;
}

export function yuanToFen(value: number | string, label = "amount"): number {
  return decimalToScaledInteger(value, 2, label);
}

export function fenToYuan(value: number | string | null | undefined): number {
  if (value == null) return 0;
  const integer = integerFromDb(value, "fen");
  return integer / 100;
}

export function boolFromD1(value: unknown): boolean {
  return value === true || value === 1;
}

export function boolToD1(value: boolean): number {
  return value ? 1 : 0;
}

export function jsonFromD1(value: unknown): JsonValue | null {
  if (value == null) return null;
  if (typeof value !== "string") return value as JsonValue;
  return JSON.parse(value) as JsonValue;
}

export function jsonToD1(value: JsonValue | undefined | null, fallback: JsonValue = {}): string {
  return JSON.stringify(value ?? fallback);
}

export function nowIso(now = new Date()): string {
  return now.toISOString();
}

export function randomId(): string {
  return crypto.randomUUID();
}

function integerFromDb(value: number | string, label: string): number {
  const parsed = typeof value === "number" ? value : Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed)) throw new Error(`Invalid ${label} integer: ${String(value)}`);
  return parsed;
}

function decimalToScaledInteger(value: number | string, scale: number, label: string): number {
  const text = normalizeDecimalString(String(value).trim(), label);
  const sign = text.startsWith("-") ? -1n : 1n;
  const unsigned = text.replace(/^[+-]/, "");
  if (!/^\d+(\.\d+)?$/.test(unsigned)) throw new Error(`Invalid decimal ${label}: ${String(value)}`);
  const [whole, fraction = ""] = unsigned.split(".");
  if (fraction.length > scale) throw new Error(`Too many decimal places for ${label}: ${String(value)}`);
  const scaledText = `${whole}${fraction.padEnd(scale, "0")}`.replace(/^0+(?=\d)/, "") || "0";
  const scaled = BigInt(scaledText) * sign;
  if (scaled > BigInt(Number.MAX_SAFE_INTEGER) || scaled < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new Error(`Scaled integer out of range for ${label}: ${String(value)}`);
  }
  return Number(scaled);
}

function normalizeDecimalString(input: string, label: string): string {
  if (!/[eE]/.test(input)) return input;
  const match = input.match(/^([+-])?(\d+)(?:\.(\d+))?[eE]([+-]?\d+)$/);
  if (!match) throw new Error(`Invalid exponential decimal ${label}: ${input}`);
  const sign = match[1] ?? "";
  const whole = match[2];
  const fraction = match[3] ?? "";
  const exponent = Number.parseInt(match[4], 10);
  const digits = `${whole}${fraction}`;
  const decimalIndex = whole.length + exponent;
  if (decimalIndex <= 0) return `${sign}0.${"0".repeat(Math.abs(decimalIndex))}${digits}`;
  if (decimalIndex >= digits.length) return `${sign}${digits}${"0".repeat(decimalIndex - digits.length)}`;
  return `${sign}${digits.slice(0, decimalIndex)}.${digits.slice(decimalIndex)}`;
}
