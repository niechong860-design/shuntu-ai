import { createFileRoute } from "@tanstack/react-router";
import crypto from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

function buildSign(params: Record<string, string>, key: string) {
  const keys = Object.keys(params)
    .filter(
      (k) =>
        params[k] !== "" &&
        params[k] !== null &&
        params[k] !== undefined &&
        k !== "sign" &&
        k !== "sign_type",
    )
    .sort();
  const str = keys.map((k) => `${k}=${params[k]}`).join("&") + key;
  return crypto.createHash("md5").update(str, "utf8").digest("hex");
}

async function handle(request: Request): Promise<Response> {
  const key = process.env.EZFPY_KEY;
  if (!key) return new Response("misconfigured", { status: 500 });

  // 易支付既可能用 GET 也可能用 POST 异步通知，兼容两种
  let raw: Record<string, string> = {};
  if (request.method === "POST") {
    const ct = request.headers.get("content-type") || "";
    if (ct.includes("application/x-www-form-urlencoded")) {
      const form = await request.formData();
      form.forEach((v, k) => (raw[k] = String(v)));
    } else {
      const text = await request.text();
      new URLSearchParams(text).forEach((v, k) => (raw[k] = v));
    }
  }
  const url = new URL(request.url);
  url.searchParams.forEach((v, k) => {
    if (!(k in raw)) raw[k] = v;
  });

  const sign = raw.sign;
  if (!sign) return new Response("missing sign", { status: 400 });

  const expected = buildSign(raw, key);
  if (expected !== sign) {
    console.error("[ezfpy-notify] sign mismatch", { expected, got: sign, raw });
    return new Response("sign error", { status: 401 });
  }

  if (raw.trade_status !== "TRADE_SUCCESS") {
    return new Response("success"); // 通知收到但非成功状态，告知不再重发
  }

  const outTradeNo = raw.out_trade_no;
  const tradeNo = raw.trade_no || "";
  if (!outTradeNo) return new Response("missing out_trade_no", { status: 400 });

  const { data, error } = await supabaseAdmin.rpc("complete_paid_order", {
    _out_trade_no: outTradeNo,
    _trade_no: tradeNo,
  });
  if (error) {
    console.error("[ezfpy-notify] rpc error", error);
    return new Response("db error", { status: 500 });
  }
  console.log("[ezfpy-notify] processed", { outTradeNo, tradeNo, result: data });

  // 易支付要求纯文本 "success"
  return new Response("success");
}

export const Route = createFileRoute("/api/public/ezfpy-notify")({
  server: {
    handlers: {
      GET: async ({ request }) => handle(request),
      POST: async ({ request }) => handle(request),
    },
  },
});
