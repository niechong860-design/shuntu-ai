import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const orderInput = z.object({
  outTradeNo: z.string().min(1).max(32).regex(/^[0-9A-Za-z_*-]+$/),
});

const FIXED_PACKAGE_CREDITS = new Map<number, number>([
  [990, 1000],
  [2990, 3180],
  [6990, 7560],
  [12900, 14170],
  [19900, 22000],
]);

type OrderRow = {
  out_trade_no: string;
  amount: number | string;
  credits: number | string;
  status: string;
  trade_no: string | null;
};

function publicOrderStatus(row: OrderRow) {
  return {
    outTradeNo: row.out_trade_no,
    status: row.status === "paid" ? "paid" as const : row.status === "cancelled" ? "cancelled" as const : "pending" as const,
    amount: String(row.amount),
    credits: Number(row.credits),
  };
}

async function getOwnOrder(outTradeNo: string, userId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_orders")
    .select("out_trade_no, amount, credits, status, trade_no")
    .eq("out_trade_no", outTradeNo)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error("订单查询失败");
  return data as OrderRow | null;
}

export const createXunhuPayOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ packageId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const payment = await import("@/lib/xunhupay.server");
    const { data: rechargePackage, error: packageError } = await supabaseAdmin
      .from("recharge_packages")
      .select("id, title, price, credits, purchase_url, is_visible")
      .eq("id", data.packageId)
      .eq("is_visible", true)
      .maybeSingle();
    if (packageError || !rechargePackage) throw new Error("充值套餐不存在或已下架");

    let amountCents: number;
    try {
      amountCents = payment.parseYuanToCents(rechargePackage.price);
    } catch {
      throw new Error("套餐价格配置错误");
    }
    const credits = Number(rechargePackage.credits);
    if (!Number.isSafeInteger(credits) || FIXED_PACKAGE_CREDITS.get(amountCents) !== credits) {
      throw new Error("套餐积分配置错误，请联系管理员");
    }

    const outTradeNo = await payment.generateTrustedOrderNo();
    const amount = payment.centsToYuan(amountCents);
    const { error: insertError } = await supabaseAdmin.from("user_orders").insert({
      user_id: context.userId,
      out_trade_no: outTradeNo,
      // user_orders.amount is NUMERIC(10,2); persist a number derived from integer cents.
      amount: amountCents / 100,
      credits,
      status: "pending",
      pay_type: "wechat",
    });
    if (insertError) throw new Error("创建本地订单失败，请稍后重试");

    try {
      const provider = await payment.createXunhuPayment({
        outTradeNo,
        amountCents,
        title: "ShunTu AI Credits",
      });
      return {
        outTradeNo,
        amount,
        credits,
        packageTitle: rechargePackage.title,
        purchaseUrl: rechargePackage.purchase_url ?? "",
        ...provider,
      };
    } catch (error) {
      console.error("[XunhuPay] create payment failed", {
        outTradeNo,
        reason: error instanceof Error ? error.message : "UNKNOWN",
      });
      throw new Error("创建支付失败，请稍后重试");
    }
  });

export const getUserOrderStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => orderInput.parse(input))
  .handler(async ({ data, context }) => {
    const row = await getOwnOrder(data.outTradeNo, context.userId);
    if (!row) throw new Error("订单不存在");
    return publicOrderStatus(row);
  });

export const confirmXunhuPayOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => orderInput.parse(input))
  .handler(async ({ data, context }) => {
    const payment = await import("@/lib/xunhupay.server");
    const row = await getOwnOrder(data.outTradeNo, context.userId);
    if (!row) throw new Error("订单不存在");
    if (row.status === "paid") return publicOrderStatus(row);
    if (row.status === "cancelled") return publicOrderStatus(row);
    if (row.status !== "pending" || !(await payment.verifyTrustedOrderNo(row.out_trade_no))) {
      throw new Error("订单无法确认");
    }

    let provider: Awaited<ReturnType<typeof payment.queryXunhuPayment>>;
    try {
      provider = await payment.queryXunhuPayment(row.out_trade_no);
    } catch (error) {
      console.error("[XunhuPay] query payment failed", {
        outTradeNo: row.out_trade_no,
        reason: error instanceof Error ? error.message : "UNKNOWN",
      });
      throw new Error("支付确认失败，请稍后重试");
    }

    if (provider.status === "WP") return publicOrderStatus(row);
    if (provider.status === "CD") {
      return { ...publicOrderStatus(row), status: "cancelled" as const };
    }

    let localCents: number;
    let providerCents: number;
    try {
      localCents = payment.parseYuanToCents(String(row.amount));
      providerCents = payment.parseYuanToCents(provider.totalFee);
    } catch {
      throw new Error("支付确认失败，请稍后重试");
    }
    if (
      provider.tradeOrderId !== row.out_trade_no ||
      providerCents !== localCents ||
      !/^[0-9A-Za-z_-]{1,128}$/.test(provider.transactionId)
    ) {
      console.error("[XunhuPay] query result mismatch", { outTradeNo: row.out_trade_no });
      throw new Error("支付确认失败，请稍后重试");
    }

    const { error: completeError } = await supabaseAdmin.rpc("complete_paid_order", {
      _out_trade_no: row.out_trade_no,
      _trade_no: provider.transactionId,
    });
    if (completeError) throw new Error("支付确认失败，请稍后重试");
    const completed = await getOwnOrder(row.out_trade_no, context.userId);
    if (!completed || completed.status !== "paid") throw new Error("订单暂未确认");
    return publicOrderStatus(completed);
  });
