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
import { PREVIEW_RECHARGE_PACKAGES } from "@/lib/recharge-packages";

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
  doubleCredits?: boolean;
  note?: string;
};

const PLANS: Plan[] = PREVIEW_RECHARGE_PACKAGES.map((plan) => ({
  ...plan,
  icon: plan.doubleCredits ? <Crown className="h-4 w-4" /> : plan.highlighted ? <Zap className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />,
}));

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
  doubleCredits?: boolean;
  note?: string;
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
    doubleCredits: Boolean(row.doubleCredits),
    note: row.note,
    icon: row.doubleCredits ? <Crown className="h-4 w-4" /> : row.highlighted ? <Zap className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />,
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
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "创建支付失败，请稍后重试");
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
          <div className="grid grid-cols-1 gap-3 pt-2 sm:grid-cols-2 md:gap-3 lg:grid-cols-3 xl:grid-cols-6">
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
  const enterprise = plan.doubleCredits;
  return (
    <div
      className={cn(
        "group relative flex min-w-0 flex-col rounded-xl border p-3 transition-all duration-300 md:p-4",
        "hover:-translate-y-1",
        highlight
          ? "border-emerald-400/80 bg-zinc-900 shadow-[0_0_28px_rgba(16,185,129,0.28)]"
          : enterprise
            ? "border-amber-400/50 bg-zinc-900/80 shadow-[0_0_20px_rgba(251,191,36,0.12)] hover:border-amber-300/80"
            : "border-zinc-800 bg-zinc-900/50 hover:border-zinc-600 hover:shadow-lg hover:shadow-black/30",
      )}
    >
      {/* 高亮卡片：径向翡翠光晕 + 2px 渐变描边 */}
      {highlight && (
        <>
          <div
            className="pointer-events-none absolute inset-0 rounded-xl"
            style={{
              background:
                "radial-gradient(120% 80% at 50% 0%, rgba(16,185,129,0.18) 0%, rgba(16,185,129,0.06) 35%, rgba(0,0,0,0) 70%)",
            }}
          />
          <div
            className="pointer-events-none absolute inset-0 rounded-xl p-[2px] bg-gradient-to-br from-emerald-400 to-cyan-500"
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
        <div className={cn(
          "absolute -top-2.5 right-2 z-10 rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wider shadow-[0_4px_14px_rgba(16,185,129,0.35)] md:-right-2",
          enterprise ? "bg-amber-400 text-zinc-950 shadow-[0_4px_14px_rgba(251,191,36,0.25)]" : "bg-gradient-to-r from-emerald-400 to-cyan-500 text-white",
        )}>
          {plan.badgeText || "最受欢迎"}
        </div>
      )}

      {enterprise && (
        <div className="relative mt-2 inline-flex w-fit items-center gap-1 rounded-md border border-amber-400/30 bg-amber-400/10 px-2 py-1 text-[10px] font-semibold text-amber-200">
          <Crown className="h-3 w-3" />积分加倍
        </div>
      )}

      <div className="relative flex items-center gap-2">
        {plan.icon && <span className={highlight ? "text-emerald-400" : "text-zinc-400"}>{plan.icon}</span>}
        <h3 className={cn("text-base font-semibold", highlight ? "text-white" : "text-zinc-100")}>{plan.title}</h3>
      </div>
      <p className="relative mt-1 text-xs text-zinc-400">{plan.subtitle}</p>

      <div className={cn("relative flex items-baseline gap-1", enterprise ? "mt-3" : "mt-4")}>
        <span className={cn("text-sm", highlight ? "text-zinc-300" : "text-zinc-500")}>¥</span>
        <span
          className={cn(
            "text-3xl font-bold tabular-nums leading-none",
            highlight ? "text-white drop-shadow-[0_2px_8px_rgba(16,185,129,0.35)] md:text-4xl" : enterprise ? "text-amber-100" : "text-zinc-100",
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

      {plan.note && <p className="relative mt-3 text-[11px] leading-4 text-emerald-300">{plan.note}</p>}

      <Button
        onClick={() => onBuy(plan.id)}
        disabled={disabled}
        className={cn(
          "relative mt-5 w-full font-semibold",
          highlight
            ? "bg-emerald-500 text-white shadow-[0_0_18px_rgba(16,185,129,0.45)] hover:bg-emerald-400"
            : enterprise
              ? "border border-amber-400/40 bg-amber-400/10 text-amber-100 shadow-none hover:border-amber-300/80 hover:bg-amber-400/20"
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
