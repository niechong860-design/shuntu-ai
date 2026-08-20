const XUNHUPAY_CREATE_URL = "https://api.xunhupay.com/payment/do.html";
const XUNHUPAY_QUERY_URL = "https://api.xunhupay.com/payment/query.html";
const NOTIFY_URL = "https://shuntu.cc/api/xunhupay/notify";
const SITE_URL = "https://shuntu.cc";
const REQUEST_TIMEOUT_MS = 12_000;

export type XunhuFields = Record<string, string>;

type JsonRecord = Record<string, unknown>;

export type XunhuQueryResult = {
  status: "OD" | "WP" | "CD";
  tradeOrderId: string;
  totalFee: string;
  transactionId: string;
};

function getConfig() {
  const appid = process.env.XUNHUPAY_APPID?.trim();
  const appsecret = process.env.XUNHUPAY_APPSECRET?.trim();
  if (!appid || !appsecret) throw new Error("XUNHUPAY_CONFIG_MISSING");
  return { appid, appsecret };
}

function leftRotate(value: number, shift: number) {
  return ((value << shift) | (value >>> (32 - shift))) >>> 0;
}

function md5(value: string) {
  const input = new TextEncoder().encode(value);
  const paddedLength = Math.ceil((input.length + 9) / 64) * 64;
  const bytes = new Uint8Array(paddedLength);
  bytes.set(input);
  bytes[input.length] = 0x80;
  const bitLength = input.length * 8;
  const view = new DataView(bytes.buffer);
  view.setUint32(paddedLength - 8, bitLength >>> 0, true);
  view.setUint32(paddedLength - 4, Math.floor(bitLength / 0x1_0000_0000), true);

  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;
  const shifts = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
  ];
  const constants = Array.from({ length: 64 }, (_, i) =>
    Math.floor(Math.abs(Math.sin(i + 1)) * 0x1_0000_0000) >>> 0,
  );

  for (let offset = 0; offset < bytes.length; offset += 64) {
    const words = Array.from({ length: 16 }, (_, i) => view.getUint32(offset + i * 4, true));
    let a = a0;
    let b = b0;
    let c = c0;
    let d = d0;

    for (let i = 0; i < 64; i++) {
      let f: number;
      let g: number;
      if (i < 16) {
        f = (b & c) | (~b & d);
        g = i;
      } else if (i < 32) {
        f = (d & b) | (~d & c);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        f = b ^ c ^ d;
        g = (3 * i + 5) % 16;
      } else {
        f = c ^ (b | ~d);
        g = (7 * i) % 16;
      }
      const nextD = d;
      d = c;
      c = b;
      const sum = (a + f + constants[i] + words[g]) >>> 0;
      b = (b + leftRotate(sum, shifts[i])) >>> 0;
      a = nextD;
    }

    a0 = (a0 + a) >>> 0;
    b0 = (b0 + b) >>> 0;
    c0 = (c0 + c) >>> 0;
    d0 = (d0 + d) >>> 0;
  }

  return [a0, b0, c0, d0]
    .map((word) => [0, 8, 16, 24].map((shift) => ((word >>> shift) & 0xff).toString(16).padStart(2, "0")).join(""))
    .join("");
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let i = 0; i < left.length; i++) difference |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return difference === 0;
}

export function generateXunhuHash(fields: XunhuFields, appsecret = getConfig().appsecret) {
  const serialized = Object.entries(fields)
    .filter(([key, value]) => key !== "hash" && value !== "")
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
  return md5(serialized + appsecret);
}

export function verifyXunhuHash(fields: XunhuFields, appsecret = getConfig().appsecret) {
  const received = fields.hash?.toLowerCase() ?? "";
  return /^[0-9a-f]{32}$/.test(received) && constantTimeEqual(generateXunhuHash(fields, appsecret), received);
}

export function parseYuanToCents(value: string) {
  const normalized = value.trim();
  const match = /^(0|[1-9]\d{0,15})(?:\.(\d{1,2}))?$/.exec(normalized);
  if (!match) throw new Error("INVALID_AMOUNT");
  const cents = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  if (!Number.isSafeInteger(cents) || cents <= 0) throw new Error("INVALID_AMOUNT");
  return cents;
}

export function centsToYuan(cents: number) {
  if (!Number.isSafeInteger(cents) || cents <= 0) throw new Error("INVALID_AMOUNT");
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}

function randomHex(byteLength: number) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function orderSignature(core: string) {
  const { appsecret } = getConfig();
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(appsecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`shuntu-order-v1:${core}`));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, 12);
}

export async function generateTrustedOrderNo() {
  const timestamp = Date.now().toString(36).padStart(8, "0").slice(-8);
  const core = `ST${timestamp}${randomHex(5).slice(0, 9)}`;
  return `${core}_${await orderSignature(core)}`;
}

export async function verifyTrustedOrderNo(value: string) {
  const match = /^(ST[0-9a-z]{8}[0-9a-f]{9})_([0-9a-f]{12})$/.exec(value);
  if (!match || value.length > 32) return false;
  return constantTimeEqual(await orderSignature(match[1]), match[2]);
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function signedDataFromEnvelope(envelope: JsonRecord) {
  if (!isRecord(envelope.data) || typeof envelope.hash !== "string") throw new Error("XUNHUPAY_INVALID_RESPONSE");
  const fields: XunhuFields = {};
  for (const [key, value] of Object.entries(envelope.data)) {
    if (value === null || value === undefined || value === "") continue;
    if (!["string", "number", "boolean"].includes(typeof value)) throw new Error("XUNHUPAY_INVALID_RESPONSE");
    fields[key] = String(value);
  }
  fields.hash = envelope.hash;
  if (!verifyXunhuHash(fields)) throw new Error("XUNHUPAY_INVALID_SIGNATURE");
  return fields;
}

function simpleSignedFields(payload: JsonRecord) {
  if (typeof payload.hash !== "string") throw new Error("XUNHUPAY_INVALID_RESPONSE");
  const fields: XunhuFields = {};
  for (const [key, value] of Object.entries(payload)) {
    if (key === "hash" || value === null || value === undefined || value === "") continue;
    if (!["string", "number", "boolean"].includes(typeof value)) throw new Error("XUNHUPAY_INVALID_RESPONSE");
    fields[key] = String(value);
  }
  fields.hash = payload.hash;
  if (!verifyXunhuHash(fields)) throw new Error("XUNHUPAY_INVALID_SIGNATURE");
  return fields;
}

async function postForm(url: string, fields: XunhuFields) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
        accept: "application/json, text/plain;q=0.9",
      },
      body: new URLSearchParams(fields).toString(),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error("XUNHUPAY_HTTP_ERROR");
    const responseText = await response.text();
    let payload: unknown;
    try {
      payload = JSON.parse(responseText);
    } catch {
      throw new Error("XUNHUPAY_INVALID_RESPONSE");
    }
    if (!isRecord(payload)) throw new Error("XUNHUPAY_INVALID_RESPONSE");
    if (Number(payload.errcode) !== 0) throw new Error("XUNHUPAY_PROVIDER_ERROR");
    return { payload };
  } finally {
    clearTimeout(timeout);
  }
}

async function postJson(url: string, fields: XunhuFields) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json;charset=UTF-8", accept: "application/json, text/plain;q=0.9" },
      body: JSON.stringify(fields),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error("XUNHUPAY_HTTP_ERROR");
    let payload: unknown;
    try { payload = JSON.parse(await response.text()); } catch { throw new Error("XUNHUPAY_INVALID_RESPONSE"); }
    if (!isRecord(payload)) throw new Error("XUNHUPAY_INVALID_RESPONSE");
    if (Number(payload.errcode) !== 0) throw new Error("XUNHUPAY_PROVIDER_ERROR");
    return { payload, data: simpleSignedFields(payload) };
  } finally { clearTimeout(timeout); }
}

async function postJsonPayload(url: string, fields: XunhuFields) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json;charset=UTF-8", accept: "application/json, text/plain;q=0.9" },
      body: JSON.stringify(fields),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error("XUNHUPAY_HTTP_ERROR");
    let payload: unknown;
    try { payload = JSON.parse(await response.text()); } catch { throw new Error("XUNHUPAY_INVALID_RESPONSE"); }
    if (!isRecord(payload)) throw new Error("XUNHUPAY_INVALID_RESPONSE");
    console.info("[XunhuPay] query response shape", {
      status: response.status,
      topLevelKeys: Object.keys(payload),
      dataKeys: isRecord(payload.data) ? Object.keys(payload.data) : [],
    });
    if (payload.errcode !== 0) throw new Error("XUNHUPAY_PROVIDER_ERROR");
    return payload;
  } finally { clearTimeout(timeout); }
}

function assertProviderUrl(value: string, required: boolean) {
  if (!value) {
    if (required) throw new Error("XUNHUPAY_QRCODE_MISSING");
    return "";
  }
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") throw new Error();
    return url.href;
  } catch {
    throw new Error("XUNHUPAY_INVALID_URL");
  }
}

export async function createXunhuPayment(input: {
  outTradeNo: string;
  amountCents: number;
  title: string;
}) {
  const { appid } = getConfig();
  const fields: XunhuFields = {
    version: "1.1",
    appid,
    trade_order_id: input.outTradeNo,
    total_fee: centsToYuan(input.amountCents),
    title: input.title,
    time: String(Math.floor(Date.now() / 1000)),
    notify_url: NOTIFY_URL,
    return_url: `${SITE_URL}/payment/return?order=${encodeURIComponent(input.outTradeNo)}`,
    callback_url: SITE_URL,
    nonce_str: randomHex(16),
  };
  fields.hash = generateXunhuHash(fields);
  const { data } = await postJson(XUNHUPAY_CREATE_URL, fields);
  if (data.appid && data.appid !== appid) throw new Error("XUNHUPAY_APPID_MISMATCH");
  if (data.trade_order_id && data.trade_order_id !== input.outTradeNo) throw new Error("XUNHUPAY_ORDER_MISMATCH");
  return {
    urlQrcode: assertProviderUrl(data.url_qrcode, true),
    mobileUrl: assertProviderUrl(data.url, false),
    expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
  };
}

export async function queryXunhuPayment(outTradeNo: string): Promise<XunhuQueryResult> {
  const { appid } = getConfig();
  const fields: XunhuFields = {
    appid,
    out_trade_order: outTradeNo,
    time: String(Math.floor(Date.now() / 1000)),
    nonce_str: randomHex(16),
  };
  fields.hash = generateXunhuHash(fields);
  const payload = await postJsonPayload(XUNHUPAY_QUERY_URL, fields);
  const data = isRecord(payload.data) ? signedDataFromEnvelope(payload) : simpleSignedFields(payload);
  if (data.appid && data.appid !== appid) throw new Error("XUNHUPAY_APPID_MISMATCH");
  if (!["OD", "WP", "CD"].includes(data.status)) throw new Error("XUNHUPAY_INVALID_STATUS");
  return {
    status: data.status as XunhuQueryResult["status"],
    tradeOrderId: data.trade_order_id || data.out_trade_order || "",
    totalFee: data.total_fee || data.total_amount || "",
    transactionId: data.transaction_id || "",
  };
}

export function getXunhuAppId() {
  return getConfig().appid;
}
