import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  CheckCircle2,
  CircleAlert,
  Clock3,
  Copy,
  ExternalLink,
  MessageCircle,
  RefreshCw,
  Smartphone,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { confirmXunhuPayOrder, getUserOrderStatus } from "@/lib/payment.functions";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

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

export function XunhuPayStatus({
  order,
  onBack,
}: {
  order: PaymentViewOrder;
  onBack?: () => void;
}) {
  const getStatus = useServerFn(getUserOrderStatus);
  const confirmOrder = useServerFn(confirmXunhuPayOrder);
  const { refreshProfile } = useAuth();
  const [status, setStatus] = useState<PaymentStatus>("pending");
  const [amount, setAmount] = useState(order.amount ?? "");
  const [credits, setCredits] = useState(order.credits ?? 0);
  const [confirming, setConfirming] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [message, setMessage] = useState("");
  const [isMobile, setIsMobile] = useState<boolean | null>(null);
  const [qrRemaining, setQrRemaining] = useState(300);
  const refreshed = useRef(false);

  const applyResult = useCallback(
    (result: { status: PaymentStatus; amount: string; credits: number }) => {
      setStatus(result.status);
      setAmount(String(result.amount));
      setCredits(Number(result.credits));
      setMessage("");
    },
    [],
  );

  useEffect(() => {
    setIsMobile(/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent));
  }, []);
  useEffect(() => {
    if (status !== "pending" || qrRemaining <= 0) return;
    const timer = window.setInterval(() => setQrRemaining((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [qrRemaining, status]);

  useEffect(() => {
    setQrRemaining(300);
  }, [order.outTradeNo]);

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
        {onBack && (
          <Button className="mt-6" onClick={onBack}>
            返回充值中心
          </Button>
        )}
      </div>
    );
  }

  const copyWechat = async () => {
    try {
      await navigator.clipboard.writeText("MaPle_Alr");
      toast.success("微信号已复制");
    } catch {
      toast.error("复制失败");
    }
  };

  if (status === "cancelled") {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center py-8 text-center">
        <CircleAlert className="h-12 w-12 text-amber-400" />
        <h2 className="mt-4 text-lg font-semibold text-white">支付已取消</h2>
        <p className="mt-2 text-sm text-zinc-400">本次订单未产生积分到账。</p>
        {onBack && (
          <Button className="mt-6" variant="secondary" onClick={onBack}>
            重新选择套餐
          </Button>
        )}
      </div>
    );
  }

  const formattedQrTime =
    String(Math.floor(qrRemaining / 60)).padStart(2, "0") +
    ":" +
    String(qrRemaining % 60).padStart(2, "0");
  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="grid gap-6 md:grid-cols-2">
        <section className="rounded-2xl border border-emerald-500/25 bg-zinc-950/70 p-5">
          <div className="flex items-center justify-center gap-2 text-emerald-400">
            <MessageCircle className="h-6 w-6" />
            <span>微信支付</span>
          </div>
          <div className="mt-5 text-center">
            <h2 className="text-lg font-semibold text-white">
              {order.packageTitle || "ShunTu AI"}
            </h2>
            {amount && (
              <div className="mt-2 text-3xl font-bold text-white">¥{Number(amount).toFixed(2)}</div>
            )}
            {credits > 0 && (
              <p className="mt-2 text-sm text-zinc-300">
                到账 {credits.toLocaleString("zh-CN")} 积分
              </p>
            )}
          </div>
          {isMobile === null ? (
            <div className="mt-5 flex min-h-[250px] items-center justify-center rounded-xl border border-emerald-500/20 bg-zinc-900/60 p-6 text-center text-sm text-zinc-300">
              正在准备支付环境...
            </div>
          ) : isMobile ? (
            <div className="mt-5 flex min-h-[250px] flex-col items-center justify-center rounded-xl border border-emerald-500/20 bg-zinc-900/60 p-6 text-center">
              <Smartphone className="h-12 w-12 text-emerald-400" />
              <p className="mt-4 text-sm text-zinc-300">微信支付</p>
              {order.mobileUrl ? (
                <>
                  <a
                    href={order.mobileUrl}
                    className="mt-5 inline-flex h-11 w-full max-w-xs items-center justify-center rounded-lg bg-emerald-500 px-5 text-sm font-semibold text-zinc-950 transition-colors hover:bg-emerald-400"
                  >
                    进入手机支付页
                  </a>
                  <p className="mt-4 text-xs leading-5 text-zinc-400">
                    进入支付页后，请按页面提示截图或保存二维码，再使用微信扫一扫从相册识别完成支付。
                  </p>
                </>
              ) : (
                <p className="mt-4 text-sm text-zinc-400">支付链接暂不可用，请重新生成支付订单</p>
              )}
            </div>
          ) : (
            <>
              <div className="mt-5 flex min-h-[250px] items-center justify-center rounded-xl bg-white p-4">
                {qrRemaining > 0 && order.urlQrcode ? (
                  <img src={order.urlQrcode} alt="微信支付二维码" className="h-[218px] w-[218px]" />
                ) : (
                  <div className="text-center text-sm text-zinc-700">
                    二维码已失效
                    <br />
                    请重新生成支付订单
                  </div>
                )}
              </div>
              <p className="mt-4 text-center text-sm text-zinc-200">微信扫码完成支付</p>
              <div className="mt-4 text-center text-sm text-emerald-300">
                {qrRemaining > 0 ? (
                  <>
                    剩余支付时间 <strong className="ml-2 font-mono">{formattedQrTime}</strong>
                  </>
                ) : (
                  "二维码已失效"
                )}
              </div>
            </>
          )}
        </section>
        <section className="rounded-2xl border border-white/10 bg-zinc-950/45 p-5">
          <div className="flex items-center gap-2 text-sm text-amber-300">
            <Clock3 className="h-4 w-4" />
            等待支付
          </div>
          <Button
            className="mt-5 w-full"
            variant="secondary"
            onClick={confirm}
            disabled={confirming || cooldown > 0}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            {confirming ? "正在确认" : cooldown > 0 ? "请稍候 " + cooldown + "s" : "我已付款"}
          </Button>
          <p className="mt-4 text-xs text-zinc-400">
            支付成功后通常会自动到账，如长时间未更新，可点击“我已付款”重新确认。
          </p>
          {message && <p className="mt-3 text-sm text-amber-300">{message}</p>}
          <div className="mt-8 border-t border-white/10 pt-5">
            <p className="text-xs text-zinc-400">支付遇见问题联系客服</p>
            <button
              type="button"
              onClick={copyWechat}
              className="mt-2 inline-flex items-center gap-1.5 text-sm text-emerald-400"
            >
              WX：MaPle_Alr <Copy className="h-3.5 w-3.5" />
            </button>
          </div>
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
        </section>
      </div>
      {onBack && (
        <button type="button" onClick={onBack} className="mt-5 text-xs text-zinc-500">
          返回套餐列表
        </button>
      )}
    </div>
  );
}
