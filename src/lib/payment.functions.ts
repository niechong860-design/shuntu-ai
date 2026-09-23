import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { BusinessDatabase } from "@/lib/business-database";
import { createBusinessDatabaseFromContext } from "@/lib/business-database-router";
import { hasTrustedPackageCreditMapping } from "@/lib/recharge-packages";

const orderInput = z.object({
  outTradeNo: z.string().min(1).max(32).regex(/^[0-9A-Za-z_*-]+$/),
});

type OrderRow = {
  out_trade_no: string;
  amount: number | string;
  credits: number | string;
  status: string;
  trade_no: string | null;
};

function getBusinessDb(context: unknown): BusinessDatabase {
  return createBusinessDatabaseFromContext(context as Parameters<typeof createBusinessDatabaseFromContext>[0]);
}

function publicOrderStatus(row: OrderRow) {
  return {
    outTradeNo: row.out_trade_no,
    status: row.status === "paid" ? "paid" as const : row.status === "cancelled" ? "cancelled" as const : "pending" as const,
    amount: String(row.amount),
    credits: Number(row.credits),
  };
}

async function getOwnOrder(db: BusinessDatabase, outTradeNo: string, userId: string) {
  const row = await db.getUserOrder({ outTradeNo, userId });
  return row as OrderRow | null;
}

export const createXunhuPayOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ packageId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const payment = await import("@/lib/xunhupay.server");
    const db = getBusinessDb(context);
    const rechargePackage = (await db.listRechargePackages()).find((row) => row.id === data.packageId && row.is_visible);
    if (!rechargePackage) throw new Error("充值套餐不存在或已下架");

    let amountCents: number;
    try {
      amountCents = payment.parseYuanToCents(rechargePackage.price);
    } catch {
      throw new Error("套餐价格配置错误");
    }
    const credits = Number(rechargePackage.credits);
    if (!Number.isSafeInteger(credits) || !hasTrustedPackageCreditMapping(data.packageId, amountCents, credits)) {
      throw new Error("套餐积分配置错误，请联系管理员");
    }

    const outTradeNo = await payment.generateTrustedOrderNo();
    const amount = payment.centsToYuan(amountCents);
    try {
      await db.createUserOrder({
        userId: context.userId,
        outTradeNo,
        // user_orders.amount is NUMERIC(10,2); persist a number derived from integer cents.
        amount: amountCents / 100,
        credits,
        payType: "wechat",
      });
    } catch {
      throw new Error("创建本地订单失败，请稍后重试");
    }

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
    const db = getBusinessDb(context);
    const row = await getOwnOrder(db, data.outTradeNo, context.userId);
    if (!row) throw new Error("订单不存在");
    return publicOrderStatus(row);
  });

export const confirmXunhuPayOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => orderInput.parse(input))
  .handler(async ({ data, context }) => {
    const payment = await import("@/lib/xunhupay.server");
    const db = getBusinessDb(context);
    const row = await getOwnOrder(db, data.outTradeNo, context.userId);
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

    const complete = await db.completePaidOrder({ outTradeNo: row.out_trade_no, tradeNo: provider.transactionId });
    if (!complete.success) throw new Error("支付确认失败，请稍后重试");
    const completed = await getOwnOrder(db, row.out_trade_no, context.userId);
    if (!completed || completed.status !== "paid") throw new Error("订单暂未确认");
    return publicOrderStatus(completed);
  });
