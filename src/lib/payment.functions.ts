import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import crypto from "crypto";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function genOutTradeNo() {
  const d = new Date();
  const pad = (n: number, l = 2) => String(n).padStart(l, "0");
  const ts =
    d.getFullYear().toString() +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) +
    pad(d.getHours()) +
    pad(d.getMinutes()) +
    pad(d.getSeconds());
  const rand = Math.floor(1000 + Math.random() * 9000).toString();
  return ts + rand;
}

function buildSign(params: Record<string, string>, key: string) {
  const keys = Object.keys(params)
    .filter((k) => params[k] !== "" && params[k] !== null && params[k] !== undefined && k !== "sign" && k !== "sign_type")
    .sort();
  const str = keys.map((k) => `${k}=${params[k]}`).join("&") + key;
  return crypto.createHash("md5").update(str, "utf8").digest("hex");
}

export const createPaymentOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        amount: z.number().positive().max(100000),
        credits: z.number().nonnegative(),
        payType: z.string().min(1).max(20).optional(),
        returnOrigin: z.string().url().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const pid = process.env.EZFPY_PID;
    const key = process.env.EZFPY_KEY;
    const apiUrl = process.env.EZFPY_API_URL;
    if (!pid || !key || !apiUrl) {
      throw new Error("支付未配置，请联系管理员");
    }

    const payType = data.payType || "alipay";
    const outTradeNo = genOutTradeNo();
    const money = data.amount.toFixed(2);
    const name = `充值 ${data.credits} 算力点`;

    const { error: insertErr } = await supabase.from("user_orders").insert({
      user_id: userId,
      out_trade_no: outTradeNo,
      amount: data.amount,
      credits: data.credits,
      status: "pending",
      pay_type: payType,
    });
    if (insertErr) throw new Error(`创建订单失败: ${insertErr.message}`);

    const returnOrigin = data.returnOrigin || "";
    const params: Record<string, string> = {
      pid,
      type: payType,
      out_trade_no: outTradeNo,
      notify_url: "https://api.example.com/notify",
      return_url: `${returnOrigin}/payment/success`,
      name,
      money,
    };

    const sign = buildSign(params, key);

    // 易支付 submit.php 是 POST 接口，返回完整表单参数供前端构造 form 自动提交。
    // 同时返回 payUrl 作为 GET 跳转的兜底（部分通道支持）。
    const formParams: Record<string, string> = { ...params, sign, sign_type: "MD5" };
    const query = Object.keys(formParams)
      .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(formParams[k])}`)
      .join("&");
    const payUrl = `${apiUrl}${apiUrl.includes("?") ? "&" : "?"}${query}`;

    return { apiUrl, params: formParams, payUrl, outTradeNo };
  });
