import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useServerFn } from "@tanstack/react-start";
import { listVisibleRechargePackages, redeemCoupon } from "@/lib/admin.functions";
import { createXunhuPayOrder } from "@/lib/payment.functions";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { Gift, Sparkles, Check, Zap, Crown } from "lucide-react";
import { cn } from "@/lib/utils";
import { PaymentViewOrder, XunhuPayStatus } from "@/components/payment/XunhuPayStatus";

type Plan = {
  id: string;
  title: string;
  price: string;
  subtitle: string;
  credits: number;
  features: string[];
  purchaseUrl: string;
  highlighted?: boolean;
  isPopular?: boolean;
  badgeText?: string;
  buttonText: string;
  icon?: React.ReactNode;
};

const PLANS: Plan[] = [
  {
    id: "trial",
    title: "试用套餐",
    price: "9.9",
    subtitle: "适合偶尔体验的尝鲜用户",
    credits: 1000,
    features: ["1,000 积分", "基础图像模型", "标准排队速度"],
    purchaseUrl: "https://www.kufaka.com/item/dhmljk",
    buttonText: "立即购买",
  },
  {
    id: "starter",
    title: "入门套餐",
    price: "29.9",
    subtitle: "轻量级创作者的首选",
    credits: 3180,
    features: ["3,180 积分", "含180赠送积分", "所有基础模型", "标准排队速度"],
    purchaseUrl: "https://www.kufaka.com/item/661nyd",
    buttonText: "立即购买",
  },
  {
    id: "core",
    title: "主力套餐",
    price: "69.9",
    subtitle: "性价比之王，适合日常创作",
    credits: 7560,
    features: ["7,560 积分", "含560赠送积分", "解锁高级模型 (Wan2.6/Pro)", "优先生成队列"],
    highlighted: true,
    isPopular: true,
    badgeText: "最受欢迎",
    icon: <Zap className="h-4 w-4" />,
    purchaseUrl: "https://www.kufaka.com/item/2tig9e",
    buttonText: "立即购买",
  },
  {
    id: "pro",
    title: "专业套餐",
    price: "129",
    subtitle: "为高频重度使用者打造",
    credits: 14170,
    features: ["14,170 积分", "含1170赠送积分", "全模型无限制访问", "极速极享队列", "专属客服支持"],
    purchaseUrl: "https://www.kufaka.com/item/fk4jmd",
    buttonText: "立即购买",
  },
  {
    id: "premium",
    title: "高端套餐",
    price: "199",
    subtitle: "工作室与商业变现必备",
    credits: 22000,
    features: ["22,000 积分", "含2000赠送积分", "最高优先级算力", "支持 API 批量调用", "客服24小时在线服务"],
    icon: <Crown className="h-4 w-4" />,
    purchaseUrl: "https://www.kufaka.com/item/9a7qf1",
    buttonText: "立即购买",
  },
];

type RechargePackageRow = {
  id: string;
  title: string;
  subtitle?: string;
  price: string;
  credits: number;
  features: string[];
  badgeText?: string;
  isPopular?: boolean;
  highlighted?: boolean;
  buttonText?: string;
  purchaseUrl?: string;
};

function toPlan(row: RechargePackageRow): Plan {
  return {
    id: row.id,
    title: row.title,
    subtitle: row.subtitle ?? "",
    price: row.price,
    credits: Number(row.credits ?? 0),
    features: Array.isArray(row.features) ? row.features : [],
    badgeText: row.badgeText ?? "",
    isPopular: Boolean(row.isPopular),
    highlighted: Boolean(row.highlighted),
    buttonText: row.buttonText || "立即购买",
    purchaseUrl: row.purchaseUrl ?? "",
  };
}

export function RedeemDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [plans, setPlans] = useState<Plan[]>(PLANS);
  const [creatingPlanId, setCreatingPlanId] = useState<string | null>(null);
  const [paymentOrder, setPaymentOrder] = useState<PaymentViewOrder | null>(null);
  const fn = useServerFn(redeemCoupon);
  const listPackages = useServerFn(listVisibleRechargePackages);
  const createPayment = useServerFn(createXunhuPayOrder);
  const { refreshProfile } = useAuth();

  useEffect(() => {
    if (!open) {
      setCode("");
      setPaymentOrder(null);
      setCreatingPlanId(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    listPackages({})
      .then((rows) => {
        const next = Array.isArray(rows)
          ? rows.map((row) => toPlan(row as RechargePackageRow)).filter((plan) => plan.title.trim())
          : [];
        if (!cancelled) setPlans(next.length > 0 ? next : PLANS);
      })
      .catch(() => {
        if (!cancelled) {
          setPlans(PLANS);
          toast.info("套餐配置读取失败，已使用默认套餐");
        }
      });
    return () => { cancelled = true; };
  }, [open, listPackages]);

  // 5s cooldown countdown to throttle repeated clicks
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const handlePurchase = async (planId: string) => {
    if (creatingPlanId) return;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(planId)) {
      toast.error("套餐配置暂不可用，请刷新后重试");
      return;
    }
    setCreatingPlanId(planId);
    try {
      const result = await createPayment({ data: { packageId: planId } });
      if (!result.urlQrcode && !result.mobileUrl) {
        toast.error("支付二维码获取失败");
        return;
      }
      setPaymentOrder(result);
    } catch {
      toast.error("创建支付失败，请稍后重试");
    } finally {
      setCreatingPlanId(null);
    }
  };


  const submit = async () => {
    if (!code.trim() || loading || cooldown > 0) return;
    setLoading(true);
    setCooldown(5);
    try {
      const r = await fn({ data: { code: code.trim() } });
      if (r.success) {
        toast.success(`积分已成功入账！本次到账 ${r.amount} 点`);
        await refreshProfile();
        onOpenChange(false);
      } else {
        toast.error(r.message || "兑换失败");
      }
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "兑换失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-1rem)] max-w-6xl max-h-[calc(100dvh-1rem)] overflow-y-auto border-border/70 bg-card/90 p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] backdrop-blur-2xl md:max-h-[92vh] md:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Gift className="h-5 w-5 text-primary" /> 充值中心
          </DialogTitle>
          <p className="text-xs text-muted-foreground">选择适合你的套餐，购买后积分立即到账</p>
        </DialogHeader>

        {paymentOrder ? (
          <div className="rounded-lg border border-emerald-500/20 bg-zinc-950/40 p-4 md:p-6">
            <XunhuPayStatus order={paymentOrder} onBack={() => setPaymentOrder(null)} />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 pt-2 sm:grid-cols-2 md:gap-4 lg:grid-cols-5">
            {plans.map((p) => (
              <PlanCard
                key={p.id}
                plan={p}
                onBuy={handlePurchase}
                loading={creatingPlanId === p.id}
                disabled={creatingPlanId !== null}
              />
            ))}
          </div>
        )}

        {/* 兑换码区 */}
        <div
          className={cn(
            "mt-6 w-full rounded-2xl border border-emerald-500/30 bg-gray-900/50 p-4 shadow-[0_0_15px_rgba(16,185,129,0.15)] backdrop-blur-sm md:mt-8 md:p-5",
            paymentOrder && "hidden",
          )}
        >
          <div className="mb-3 flex items-center gap-2">
            <span className="text-base font-bold text-emerald-400">⚡ 极速兑换，秒速到账</span>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="请输入您在发卡网购买的卡密..."
              className="h-11 min-w-0 flex-1 border-emerald-500/20 bg-black/40 font-mono tracking-wider text-zinc-100 placeholder:text-zinc-500 focus-visible:ring-emerald-500/40"
              onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
              disabled={loading || cooldown > 0}
            />
            <Button
              onClick={submit}
              disabled={loading || cooldown > 0 || !code.trim()}
              className="h-11 w-full bg-emerald-500 font-semibold text-white shadow-[0_0_18px_rgba(16,185,129,0.45)] hover:bg-emerald-400 sm:w-auto sm:min-w-[110px]"
            >
              {loading ? (
                <span className="flex items-center gap-1.5">
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  激活中…
                </span>
              ) : cooldown > 0 ? (
                `请稍候 ${cooldown}s`
              ) : (
                "激活权益"
              )}
            </Button>
          </div>
          <p className="mt-3 text-xs text-zinc-400">
            还没有兑换码？
            <a
              href="https://www.kufaka.com/shop/ATG0OHM3"
              target="_blank"
              rel="noopener noreferrer"
              className="ml-1 font-medium text-emerald-400 underline-offset-2 hover:text-emerald-300 hover:underline"
            >
              点击这里前往官方商城购买
            </a>
          </p>
        </div>

      </DialogContent>
    </Dialog>
  );
}

function PlanCard({
  plan,
  onBuy,
  loading,
  disabled,
}: {
  plan: Plan;
  onBuy: (id: string) => void;
  loading: boolean;
  disabled: boolean;
}) {
  const highlight = plan.highlighted || plan.isPopular;
  return (
    <div
      className={cn(
        "group relative flex flex-col rounded-2xl p-4 transition-all duration-300 md:p-5",
        "hover:-translate-y-1",
        highlight
          ? "bg-zinc-900 shadow-[0_0_28px_rgba(16,185,129,0.28)] md:scale-[1.03] lg:scale-[1.06]"
          : "border border-zinc-800 bg-zinc-900/50 hover:border-zinc-600 hover:shadow-lg hover:shadow-black/30",
      )}
    >
      {/* 高亮卡片：径向翡翠光晕 + 2px 渐变描边 */}
      {highlight && (
        <>
          <div
            className="pointer-events-none absolute inset-0 rounded-2xl"
            style={{
              background:
                "radial-gradient(120% 80% at 50% 0%, rgba(16,185,129,0.18) 0%, rgba(16,185,129,0.06) 35%, rgba(0,0,0,0) 70%)",
            }}
          />
          <div
            className="pointer-events-none absolute inset-0 rounded-2xl p-[2px] bg-gradient-to-br from-emerald-400 to-cyan-500"
            style={{
              WebkitMask:
                "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
              WebkitMaskComposite: "xor",
              maskComposite: "exclude",
            }}
          />
        </>
      )}

      {/* 角标：右上角 */}
      {(plan.isPopular || plan.badgeText) && (
        <div className="absolute -top-2.5 right-2 z-10 rounded-full bg-gradient-to-r from-emerald-400 to-cyan-500 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white shadow-[0_4px_14px_rgba(16,185,129,0.45)] md:-right-2">
          {plan.badgeText || "最受欢迎"}
        </div>
      )}

      <div className="relative flex items-center gap-2">
        {plan.icon && <span className={highlight ? "text-emerald-400" : "text-zinc-400"}>{plan.icon}</span>}
        <h3 className={cn("text-base font-semibold", highlight ? "text-white" : "text-zinc-100")}>{plan.title}</h3>
      </div>
      <p className="relative mt-1 text-xs text-zinc-400">{plan.subtitle}</p>

      <div className="relative mt-4 flex items-baseline gap-1">
        <span className={cn("text-sm", highlight ? "text-zinc-300" : "text-zinc-500")}>¥</span>
        <span
          className={cn(
            "font-bold tabular-nums leading-none",
            highlight ? "text-4xl text-white drop-shadow-[0_2px_8px_rgba(16,185,129,0.35)] md:text-5xl" : "text-4xl text-zinc-100",
          )}
        >
          {plan.price}
        </span>
      </div>

      <ul className="relative mt-4 flex-1 space-y-2">
        {plan.features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-xs text-zinc-300">
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
            <span>{f}</span>
          </li>
        ))}
      </ul>

      <Button
        onClick={() => onBuy(plan.id)}
        disabled={disabled}
        className={cn(
          "relative mt-5 w-full font-semibold",
          highlight
            ? "bg-emerald-500 text-white shadow-[0_0_18px_rgba(16,185,129,0.45)] hover:bg-emerald-400"
            : "border border-zinc-700 bg-zinc-800/60 text-zinc-100 shadow-none hover:border-emerald-500/60 hover:bg-zinc-800",
        )}
      >
        {loading ? "正在创建支付..." : plan.buttonText}
      </Button>
      {plan.purchaseUrl && /^https?:\/\//i.test(plan.purchaseUrl) && (
        <a
          href={plan.purchaseUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="relative mt-2 text-center text-[11px] text-zinc-500 hover:text-emerald-400"
        >
          备用购买渠道
        </a>
      )}
    </div>
  );
}
