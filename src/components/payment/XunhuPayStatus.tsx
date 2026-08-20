import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, CircleAlert, Clock3, ExternalLink, RefreshCw, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { confirmXunhuPayOrder, getUserOrderStatus } from "@/lib/payment.functions";
import { useAuth } from "@/hooks/use-auth";

export type PaymentViewOrder = {
  outTradeNo: string;
  amount?: string;
  credits?: number;
  packageTitle?: string;
  purchaseUrl?: string;
  urlQrcode?: string;
  mobileUrl?: string;
  expiresAt?: string;
};

type PaymentStatus = "pending" | "paid" | "cancelled";

const POLL_INTERVAL_MS = 3_000;
const POLL_TIMEOUT_MS = 10 * 60_000;

export function XunhuPayStatus({ order, onBack }: { order: PaymentViewOrder; onBack?: () => void }) {
  const getStatus = useServerFn(getUserOrderStatus);
  const confirmOrder = useServerFn(confirmXunhuPayOrder);
  const { refreshProfile } = useAuth();
  const [status, setStatus] = useState<PaymentStatus>("pending");
  const [amount, setAmount] = useState(order.amount ?? "");
  const [credits, setCredits] = useState(order.credits ?? 0);
  const [confirming, setConfirming] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [message, setMessage] = useState("");
  const [isMobile, setIsMobile] = useState(false);
  const refreshed = useRef(false);

  const applyResult = useCallback((result: { status: PaymentStatus; amount: string; credits: number }) => {
    setStatus(result.status);
    setAmount(String(result.amount));
    setCredits(Number(result.credits));
    setMessage("");
  }, []);

  useEffect(() => {
    setIsMobile(/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent));
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  useEffect(() => {
    if (status !== "paid" || refreshed.current) return;
    refreshed.current = true;
    void refreshProfile();
  }, [refreshProfile, status]);

  useEffect(() => {
    if (!order.outTradeNo || status !== "pending") return;
    let cancelled = false;
    const startedAt = Date.now();
    let timer: number | undefined;

    const poll = async () => {
      if (cancelled) return;
      if (Date.now() - startedAt >= POLL_TIMEOUT_MS) {
        setMessage("订单暂未确认，可稍后点击“我已付款”重新确认");
        return;
      }
      try {
        const result = await getStatus({ data: { outTradeNo: order.outTradeNo } });
        if (cancelled) return;
        applyResult(result);
        if (result.status !== "pending") return;
      } catch {
        if (!cancelled) setMessage("订单状态暂时无法更新");
      }
      if (!cancelled) timer = window.setTimeout(poll, POLL_INTERVAL_MS);
    };

    timer = window.setTimeout(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [applyResult, getStatus, order.outTradeNo, status]);

  const confirm = async () => {
    if (confirming || cooldown > 0 || status !== "pending") return;
    setConfirming(true);
    setCooldown(8);
    setMessage("");
    try {
      const result = await confirmOrder({ data: { outTradeNo: order.outTradeNo } });
      applyResult(result);
      if (result.status === "pending") setMessage("订单暂未确认，请稍后再试");
    } catch {
      setMessage("支付确认失败，请稍后重试");
    } finally {
      setConfirming(false);
    }
  };

  if (status === "paid") {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center py-8 text-center">
        <CheckCircle2 className="h-14 w-14 text-emerald-400" />
        <h2 className="mt-4 text-xl font-semibold text-white">充值成功</h2>
        <p className="mt-2 text-sm text-zinc-300">{credits.toLocaleString("zh-CN")} 积分已到账</p>
        {onBack && <Button className="mt-6" onClick={onBack}>返回充值中心</Button>}
      </div>
    );
  }

  if (status === "cancelled") {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center py-8 text-center">
        <CircleAlert className="h-12 w-12 text-amber-400" />
        <h2 className="mt-4 text-lg font-semibold text-white">支付已取消</h2>
        <p className="mt-2 text-sm text-zinc-400">本次订单未产生积分到账。</p>
        {onBack && <Button className="mt-6" variant="secondary" onClick={onBack}>重新选择套餐</Button>}
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="flex flex-col gap-6 md:flex-row md:items-center">
        <div className="flex min-h-[250px] flex-1 items-center justify-center rounded-lg border border-emerald-500/25 bg-white p-4">
          {isMobile && order.mobileUrl ? (
            <div className="flex flex-col items-center text-center text-zinc-900">
              <Smartphone className="h-12 w-12 text-emerald-600" />
              <p className="mt-3 text-sm font-medium">在手机上继续完成微信支付</p>
              <Button className="mt-5" asChild>
                <a href={order.mobileUrl}>打开微信支付</a>
              </Button>
            </div>
          ) : order.urlQrcode ? (
            <div className="text-center">
              <img src={order.urlQrcode} alt="微信支付二维码" className="mx-auto h-[218px] w-[218px] object-contain" />
              {isMobile && <p className="mt-2 text-xs text-zinc-600">可保存二维码后使用微信扫一扫识别</p>}
            </div>
          ) : (
            <div className="text-center text-sm text-zinc-700">支付二维码获取失败</div>
          )}
        </div>

        <div className="flex-1">
          <div className="text-xs font-medium text-emerald-400">微信支付</div>
          <h2 className="mt-1 text-lg font-semibold text-white">{order.packageTitle || "ShunTu AI 积分充值"}</h2>
          {amount && <div className="mt-4 text-3xl font-bold tabular-nums text-white">¥{Number(amount).toFixed(2)}</div>}
          {credits > 0 && <p className="mt-2 text-sm text-zinc-300">到账 {credits.toLocaleString("zh-CN")} 积分</p>}
          <p className="mt-5 text-sm text-zinc-300">请使用微信扫码完成支付</p>
          <div className="mt-3 flex items-center gap-2 text-sm text-amber-300">
            <Clock3 className="h-4 w-4" /> 等待支付中...
          </div>
          <Button className="mt-5 w-full" variant="secondary" onClick={confirm} disabled={confirming || cooldown > 0}>
            <RefreshCw className={`mr-2 h-4 w-4 ${confirming ? "animate-spin" : ""}`} />
            {confirming ? "正在确认" : cooldown > 0 ? `请稍候 ${cooldown}s` : "我已付款"}
          </Button>
          <p className="mt-3 text-xs leading-relaxed text-zinc-500">
            支付成功后通常会自动到账，如长时间未更新，可点击“我已付款”重新确认。
          </p>
          {message && <p className="mt-3 text-sm text-amber-300">{message}</p>}
          {order.purchaseUrl && /^https?:\/\//i.test(order.purchaseUrl) && (
            <a
              href={order.purchaseUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-5 inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-emerald-400"
            >
              在线支付遇到问题？前往备用购买渠道 <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </div>
      {onBack && <button type="button" onClick={onBack} className="mt-5 text-xs text-zinc-500 hover:text-zinc-300">返回套餐列表</button>}
    </div>
  );
}
