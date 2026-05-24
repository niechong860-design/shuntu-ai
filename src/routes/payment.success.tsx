import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/payment/success")({
  validateSearch: (s: Record<string, unknown>) => ({
    out_trade_no: typeof s.out_trade_no === "string" ? s.out_trade_no : "",
  }),
  component: PaymentSuccess,
});

function PaymentSuccess() {
  const { out_trade_no } = useSearch({ from: "/payment/success" });
  const { refreshProfile, profile } = useAuth();
  const [refreshing, setRefreshing] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let tries = 0;
    const tick = async () => {
      await refreshProfile();
      tries += 1;
      if (cancelled) return;
      // 异步通知可能稍有延迟，最多轮询 5 次（约 5 秒）
      if (tries < 5) setTimeout(tick, 1000);
      else setRefreshing(false);
    };
    tick();
    return () => {
      cancelled = true;
    };
  }, [refreshProfile]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-2xl border border-border/60 bg-card/80 p-8 text-center shadow-xl backdrop-blur-xl">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/15">
          <CheckCircle2 className="h-8 w-8 text-emerald-400" />
        </div>
        <h1 className="text-xl font-semibold">支付提交成功</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {refreshing ? (
            <span className="inline-flex items-center gap-1.5">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> 正在确认到账，请稍候…
            </span>
          ) : (
            <>积分已实时到账。如未到账，请稍后刷新页面查看。</>
          )}
        </p>
        {out_trade_no && (
          <p className="mt-3 font-mono text-[11px] text-muted-foreground/70">
            订单号：{out_trade_no}
          </p>
        )}
        {profile && (
          <p className="mt-3 text-sm">
            当前余额：<span className="font-semibold text-primary">{profile.credits}</span> 积分
          </p>
        )}
        <Button asChild className="mt-6 w-full">
          <Link to="/">返回首页</Link>
        </Button>
      </div>
    </div>
  );
}
