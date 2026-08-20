import { createFileRoute } from "@tanstack/react-router";

const MAX_NOTIFY_BODY_LENGTH = 32 * 1024;

function textResponse(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export const Route = createFileRoute("/api/xunhupay/notify")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
        if (!contentType.startsWith("application/x-www-form-urlencoded")) {
          return textResponse("invalid content type", 415);
        }
        const declaredLength = Number(request.headers.get("content-length") ?? 0);
        if (declaredLength > MAX_NOTIFY_BODY_LENGTH) return textResponse("payload too large", 413);

        const body = await request.text();
        if (body.length > MAX_NOTIFY_BODY_LENGTH) return textResponse("payload too large", 413);
        const params = new URLSearchParams(body);
        const fields: Record<string, string> = {};
        for (const [key, value] of params) {
          if (Object.prototype.hasOwnProperty.call(fields, key)) return textResponse("duplicate field", 400);
          fields[key] = value;
        }

        const payment = await import("@/lib/xunhupay.server");
        if (!payment.verifyXunhuHash(fields)) return textResponse("invalid signature", 400);
        if (fields.appid !== payment.getXunhuAppId()) return textResponse("invalid appid", 400);
        if (fields.status !== "OD") return textResponse("ignored status", 400);
        const outTradeNo = fields.trade_order_id ?? "";
        if (!(await payment.verifyTrustedOrderNo(outTradeNo))) return textResponse("invalid order", 400);
        const transactionId = fields.transaction_id ?? "";
        if (!/^[0-9A-Za-z_-]{1,128}$/.test(transactionId)) return textResponse("invalid transaction", 400);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: order, error: orderError } = await supabaseAdmin
          .from("user_orders")
          .select("amount, status, trade_no")
          .eq("out_trade_no", outTradeNo)
          .maybeSingle();
        if (orderError || !order) return textResponse("order not found", 404);

        let expectedCents: number;
        let receivedCents: number;
        try {
          expectedCents = payment.parseYuanToCents(String(order.amount));
          receivedCents = payment.parseYuanToCents(fields.total_fee ?? "");
        } catch {
          return textResponse("invalid amount", 400);
        }
        if (expectedCents !== receivedCents) {
          console.error("[XunhuPay] notify amount mismatch", { outTradeNo });
          return textResponse("amount mismatch", 400);
        }

        if (order.status === "paid") {
          if (order.trade_no === transactionId) return textResponse("success");
          console.error("[XunhuPay] paid order transaction mismatch", { outTradeNo });
          return textResponse("transaction mismatch", 409);
        }
        if (order.status !== "pending") return textResponse("invalid order status", 409);

        const { error: completeError } = await supabaseAdmin.rpc("complete_paid_order", {
          _out_trade_no: outTradeNo,
          _trade_no: transactionId,
        });
        if (completeError) {
          console.error("[XunhuPay] complete order failed", { outTradeNo });
          return textResponse("temporary failure", 500);
        }

        const { data: completed } = await supabaseAdmin
          .from("user_orders")
          .select("status, trade_no")
          .eq("out_trade_no", outTradeNo)
          .maybeSingle();
        if (completed?.status !== "paid" || completed.trade_no !== transactionId) {
          console.error("[XunhuPay] completed order verification failed", { outTradeNo });
          return textResponse("temporary failure", 500);
        }
        return textResponse("success");
      },
    },
  },
});
