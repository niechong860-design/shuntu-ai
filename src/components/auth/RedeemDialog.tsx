import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useServerFn } from "@tanstack/react-start";
import { redeemCoupon } from "@/lib/admin.functions";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { Gift, Sparkles, Check, Zap, Crown } from "lucide-react";
import { cn } from "@/lib/utils";

type Plan = {
  id: string;
  name: string;
  price: number;
  desc: string;
  features: string[];
  highlight?: boolean;
  icon?: React.ReactNode;
};

const PLANS: Plan[] = [
  {
    id: "trial",
    name: "试用套餐",
    price: 9.9,
    desc: "适合偶尔体验的尝鲜用户",
    features: ["100 积分", "基础图像模型", "标准排队速度"],
  },
  {
    id: "starter",
    name: "入门套餐",
    price: 29,
    desc: "轻量级创作者的首选",
    features: ["400 积分", "所有基础模型", "标准排队速度"],
  },
  {
    id: "core",
    name: "主力套餐",
    price: 69,
    desc: "性价比之王，适合日常创作",
    features: ["1000 积分", "解锁高级模型 (Wan2.6/Pro)", "优先生成队列"],
    highlight: true,
    icon: <Zap className="h-4 w-4" />,
  },
  {
    id: "pro",
    name: "专业套餐",
    price: 129,
    desc: "为高频重度使用者打造",
    features: ["2200 积分", "全模型无限制访问", "极速极享队列", "专属客服支持"],
  },
  {
    id: "premium",
    name: "高端套餐",
    price: 199,
    desc: "工作室与商业变现必备",
    features: ["4000 积分", "最高优先级算力", "支持 API 批量调用", "提供商业授权"],
    icon: <Crown className="h-4 w-4" />,
  },
];

export function RedeemDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const fn = useServerFn(redeemCoupon);
  const { refreshProfile } = useAuth();

  useEffect(() => { if (!open) setCode(""); }, [open]);

  const handlePurchase = (planId: string, amount: number) => {
    // TODO: 接入真实支付通道。当前仅做占位提示。
    toast.info(`已选择套餐 ${planId} · ¥${amount}`, {
      description: "支付通道接入中，请联系客服完成充值。",
    });
    console.log("[purchase]", { planId, amount });
  };

  const submit = async () => {
    if (!code.trim()) return;
    setLoading(true);
    try {
      const r = await fn({ data: { code: code.trim() } });
      if (r.success) {
        toast.success(`兑换成功！已为您充值 ${r.amount} 点数`);
        await refreshProfile();
        onOpenChange(false);
      } else {
        toast.error(r.message || "兑换失败");
      }
    } catch (e: any) {
      toast.error(e.message || "兑换失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[92vh] overflow-y-auto border-border/70 bg-card/90 backdrop-blur-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Gift className="h-5 w-5 text-primary" /> 充值中心
          </DialogTitle>
          <p className="text-xs text-muted-foreground">选择适合你的套餐，购买后积分立即到账</p>
        </DialogHeader>

        {/* 价格套餐卡片区 */}
        <div className="grid grid-cols-1 gap-4 pt-2 sm:grid-cols-2 lg:grid-cols-5">
          {PLANS.map((p) => (
            <PlanCard key={p.id} plan={p} onBuy={handlePurchase} />
          ))}
        </div>

        {/* 兑换码区 */}
        <div className="mt-6 rounded-xl border border-border/60 bg-white/[0.02] p-4">
          <div className="mb-3 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">兑换码充值</span>
            <span className="text-xs text-muted-foreground">· 联系客服获取兑换码</span>
          </div>
          <div className="flex gap-2">
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="LUMEN-XXXX-XXXX"
              className="h-10 flex-1 font-mono tracking-wider"
              onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
            />
            <Button
              onClick={submit}
              disabled={loading || !code.trim()}
              className="h-10 bg-gradient-aurora text-primary-foreground shadow-glow"
            >
              {loading ? "兑换中…" : "立即兑换"}
            </Button>
          </div>
        </div>

        {/* 隐藏的开发者支付测试入口 · 测试通过后可直接删除该按钮 */}
        <div className="mt-4 flex justify-center">
          <button
            onClick={() => handlePurchase("dev_test", 0.01)}
            className="text-[11px] text-muted-foreground/50 underline-offset-4 transition-colors hover:text-muted-foreground hover:underline"
          >
            开发者支付链路测试
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PlanCard({ plan, onBuy }: { plan: Plan; onBuy: (id: string, amount: number) => void }) {
  const { highlight } = plan;
  return (
    <div
      className={cn(
        "group relative flex flex-col rounded-2xl p-5 transition-all duration-300",
        "hover:-translate-y-1",
        highlight
          ? "scale-[1.03] bg-zinc-900 shadow-[0_0_28px_rgba(16,185,129,0.28)] lg:scale-[1.06]"
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

      {/* 角标 */}
      {highlight && (
        <div className="absolute -top-3 left-1/2 z-10 -translate-x-1/2 rounded-full bg-gradient-to-r from-emerald-400 to-cyan-500 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white shadow-[0_4px_14px_rgba(16,185,129,0.45)]">
          最受欢迎 · Most Popular
        </div>
      )}

      <div className="relative flex items-center gap-2">
        {plan.icon && <span className={highlight ? "text-emerald-400" : "text-zinc-400"}>{plan.icon}</span>}
        <h3 className={cn("text-base font-semibold", highlight ? "text-white" : "text-zinc-100")}>{plan.name}</h3>
      </div>
      <p className="relative mt-1 text-xs text-zinc-400">{plan.desc}</p>

      <div className="relative mt-4 flex items-baseline gap-1">
        <span className={cn("text-sm", highlight ? "text-zinc-300" : "text-zinc-500")}>¥</span>
        <span
          className={cn(
            "font-bold tabular-nums leading-none",
            highlight ? "text-5xl text-white drop-shadow-[0_2px_8px_rgba(16,185,129,0.35)]" : "text-4xl text-zinc-100",
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
        onClick={() => onBuy(plan.id, plan.price)}
        className={cn(
          "relative mt-5 w-full font-semibold",
          highlight
            ? "bg-emerald-500 text-white shadow-[0_0_18px_rgba(16,185,129,0.45)] hover:bg-emerald-400"
            : "border border-zinc-700 bg-zinc-800/60 text-zinc-100 shadow-none hover:border-emerald-500/60 hover:bg-zinc-800",
        )}
      >
        立即购买
      </Button>
    </div>
  );
}
