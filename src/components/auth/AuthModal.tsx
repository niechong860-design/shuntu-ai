import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Sparkles, Loader2, Mail, Lock, Headphones, Copy } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { getContactInfo } from "@/lib/admin.functions";

type Tab = "login" | "signup" | "forgot";

const PASSWORD_TOO_SHORT_MSG = "密码长度不足，请至少设置 6 位密码";
const PASSWORD_TOO_SIMPLE_MSG = "密码不可用，请更换一个不常见的密码";
const PASSWORD_MISMATCH_MSG = "两次输入的密码不一致";
const INVALID_EMAIL_MSG = "请输入正确的邮箱地址";
const EMAIL_REGISTERED_MSG = "该邮箱已注册，请直接登录";
const SIGNUP_FAILED_MSG = "注册失败，请稍后重试";

function isWeakSignupPassword(password: string) {
  return password.trim().length < 6;
}

/** 把 Supabase 返回的英文错误翻成更明确的中文提示 */
function translateAuthError(err: unknown, tab: Tab): string {
  const raw = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  // 新版 Supabase 错误把详情放在 code/status 字段，message 可能是通用文案
  const errObj = (err && typeof err === "object" ? err : {}) as {
    code?: string;
    error_code?: string;
    status?: number;
    name?: string;
  };
  const code = (errObj.code ?? errObj.error_code ?? "").toLowerCase();
  const status = errObj.status ?? 0;
  const m = (raw + " " + code).toLowerCase();

  if (tab === "signup") {
    if (
      code === "user_already_exists" ||
      code === "email_exists" ||
      m.includes("user already registered") ||
      m.includes("already registered") ||
      m.includes("already exists")
    ) {
      return EMAIL_REGISTERED_MSG;
    }
    if (
      code === "email_address_invalid" ||
      code === "validation_failed" ||
      m.includes("invalid email") ||
      m.includes("unable to validate email")
    ) {
      return INVALID_EMAIL_MSG;
    }
    if (
      code === "password_too_short" ||
      m.includes("password should be at least") ||
      m.includes("password is too short") ||
      m.includes("password length") ||
      (m.includes("password") && (m.includes("at least") || m.includes("minimum")))
    ) {
      return PASSWORD_TOO_SHORT_MSG;
    }
    if (
      code === "weak_password" ||
      m.includes("weak_password") ||
      m.includes("pwned") ||
      m.includes("compromised") ||
      (m.includes("password") && (m.includes("weak") || m.includes("easy") || m.includes("simple") || m.includes("strength")))
    ) {
      return PASSWORD_TOO_SIMPLE_MSG;
    }
  }

  // 直接按 code 命中（新版 GoTrue 优先返回 code）
  if (code === "invalid_credentials" || code === "invalid_grant")
    return "邮箱或密码不正确，请重新输入";
  if (code === "email_not_confirmed") return "邮箱尚未验证，请先到邮箱完成验证";
  if (code === "user_not_found") return "账号不存在，请先注册";
  if (code === "user_banned") return "账号已被封禁，请联系客服";
  if (code === "user_already_exists" || code === "email_exists")
    return "该邮箱已注册，请直接登录";
  if (code === "password_too_short")
    return PASSWORD_TOO_SHORT_MSG;
  if (code === "weak_password")
    return PASSWORD_TOO_SIMPLE_MSG;
  if (
    code === "over_request_rate_limit" ||
    code === "over_email_send_rate_limit" ||
    code === "over_sms_send_rate_limit" ||
    status === 429
  )
    return "操作太频繁，请稍后再试";
  if (code === "validation_failed" || code === "email_address_invalid")
    return "请输入正确的邮箱地址";



  // 已经是中文的（自定义抛出）直接返回
  if (/[\u4e00-\u9fa5]/.test(raw)) return raw;
  if (!raw) return "操作失败，请稍后再试";

  // —— 登录类 ——
  if (m.includes("invalid login") || m.includes("invalid credentials") || m.includes("invalid_grant"))
    return "邮箱或密码不正确，请重新输入";
  if (m.includes("email not confirmed") || m.includes("email_not_confirmed"))
    return "邮箱尚未验证，请先到邮箱完成验证";
  if (m.includes("user not found") || m.includes("no user found"))
    return "账号不存在，请先注册";
  if (m.includes("user is banned") || m.includes("banned"))
    return "账号已被封禁，请联系客服";

  // —— 注册类（按用户要求的措辞）——
  if (
    m.includes("user already registered") ||
    m.includes("already registered") ||
    m.includes("already been registered") ||
    m.includes("user_already_exists") ||
    m.includes("email_exists")
  )
    return "该邮箱已注册，请直接登录";
  if (m.includes("invalid email") || m.includes("email_address_invalid") || m.includes("validation_failed"))
    return "请输入正确的邮箱地址";
  if (
    m.includes("password should be at least") ||
    m.includes("password is too short") ||
    m.includes("password_too_short")
  )
    return PASSWORD_TOO_SHORT_MSG;
  if (m.includes("weak_password"))
    return PASSWORD_TOO_SIMPLE_MSG;
  if (m.includes("password") && (m.includes("weak") || m.includes("easy") || m.includes("simple") || m.includes("strength")))
    return PASSWORD_TOO_SIMPLE_MSG;
  if (m.includes("pwned") || m.includes("compromised"))
    return "该密码已在公开泄露库中，请更换更安全的密码";
  if (m.includes("signup") && m.includes("disabled"))
    return "暂未开放注册，请稍后再试";

  // —— 邮件发送 ——
  if (
    m.includes("error sending confirmation email") ||
    m.includes("error sending email") ||
    m.includes("smtp") ||
    m.includes("email send failed") ||
    m.includes("error sending recovery email")
  )
    return "验证邮件发送失败，请稍后重试";
  if (m.includes("email rate limit") || m.includes("over_email_send_rate_limit"))
    return "验证邮件发送过于频繁，请几分钟后再试";

  // —— 频率/限流 ——
  if (m.includes("rate limit") || m.includes("too many requests") || m.includes("429"))
    return "操作太频繁，请稍后再试";

  // —— 重置密码 token ——
  if (m.includes("token") && (m.includes("expired") || m.includes("invalid")))
    return "链接已失效，请重新发送";

  // —— 网络 ——
  if (
    m.includes("failed to fetch") ||
    m.includes("network") ||
    m.includes("networkerror") ||
    m.includes("load failed") ||
    m.includes("fetch failed")
  )
    return "连接认证服务失败，请检查网络、浏览器代理或稍后重试";
  if (m.includes("timeout") || m.includes("timed out"))
    return "网络连接不稳定，请稍后重试";

  // —— 服务端 ——
  if (/\b5\d\d\b/.test(m) || m.includes("internal server") || m.includes("unexpected_failure"))
    return "服务器暂时繁忙，请稍后再试";

  // 登录 400 几乎都是账号/密码不匹配
  if (tab === "login" && status === 400) return "邮箱或密码不正确，请重新输入";

  // 兜底
  return tab === "login"
    ? "邮箱或密码不正确，请重新输入"
    : tab === "signup"
      ? "注册失败，请稍后重试"
      : "发送失败，请稍后重试";
}

/** 提取一个非敏感的错误代码用于前端 console（不输出 message / email / token） */
function safeErrorCode(err: unknown): string {
  if (!err || typeof err !== "object") return "unknown";
  const e = err as { code?: string; error_code?: string; status?: number; name?: string };
  return e.code ?? e.error_code ?? (e.status ? `http_${e.status}` : e.name ?? "unknown");
}

const DISCLAIMER_AGREED_KEY = "shuntu:disclaimer_agreed:v1";

export function AuthModal({ onSuccess }: { onSuccess?: () => void }) {
  const [tab, setTab] = useState<Tab>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [contact, setContact] = useState<{ wechat: string; qq: string }>({ wechat: "", qq: "" });
  const [agreed, setAgreed] = useState(false);
  const fetchContact = useServerFn(getContactInfo);

  useEffect(() => {
    try {
      if (localStorage.getItem(DISCLAIMER_AGREED_KEY) === "1") setAgreed(true);
    } catch {}
  }, []);

  useEffect(() => {
    if (tab !== "forgot") return;
    fetchContact().then((r: any) => setContact({ wechat: r?.wechat ?? "", qq: r?.qq ?? "" })).catch(() => {});
  }, [tab]);

  const toggleAgreed = (next: boolean) => {
    setAgreed(next);
    try {
      if (next) localStorage.setItem(DISCLAIMER_AGREED_KEY, "1");
      else localStorage.removeItem(DISCLAIMER_AGREED_KEY);
    } catch {}
  };

  const copy = async (val: string, label: string) => {
    try {
      await navigator.clipboard.writeText(val);
      toast.success(`${label} 已复制`);
    } catch {
      toast.error("复制失败");
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agreed) {
      toast.error("请先阅读并同意《用户声明与免责声明》");
      return;
    }
    // 前置校验（用大白话）
    const trimmedEmail = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      toast.error(INVALID_EMAIL_MSG);
      return;
    }
    if (tab !== "forgot" && !password) {
      toast.error("请输入密码");
      return;
    }
    if (tab === "signup") {
      if (password.length < 6) {
        toast.error(PASSWORD_TOO_SHORT_MSG);
        return;
      }
      if (password !== confirm) {
        toast.error(PASSWORD_MISMATCH_MSG);
        return;
      }
    }
    if (!trimmedEmail) {
      toast.error("请先填一下邮箱");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      toast.error("邮箱格式不对，看起来少了 @ 或后缀");
      return;
    }
    if (tab !== "forgot" && password.length < 6) {
      toast.error("密码太短啦，至少要 6 位");
      return;
    }
    if (tab === "signup" && password !== confirm) {
      toast.error("两次输入的密码不一样，请再核对一下");
      return;
    }

    setLoading(true);
    try {
      if (tab === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email: trimmedEmail, password });
        if (error) {
          console.warn("[auth] login failed:", safeErrorCode(error));
          throw error;
        }
        toast.success("登录成功，欢迎回来");
        onSuccess?.();
      } else if (tab === "signup") {
        const { data: signUpData, error } = await supabase.auth.signUp({
          email: trimmedEmail,
          password,
          options: { emailRedirectTo: `${window.location.origin}/` },
        });
        if (error) {
          console.warn("[auth] signup failed:", safeErrorCode(error));
          throw error;
        }
        // 如果未自动登录（需邮箱验证场景），尝试登录
        const { error: signInErr } = await supabase.auth.signInWithPassword({
          email: trimmedEmail,
          password,
        });
        if (signInErr) {
          // 注册接口成功但无法立即登录，通常是邮箱验证开启
          console.warn("[auth] signup ok but auto sign-in failed:", safeErrorCode(signInErr));
          if (signUpData?.user && !signUpData.session) {
            toast.success("注册成功，请到邮箱完成验证后再登录");
          } else {
            toast.success("注册成功，请重新登录");
          }
          setTab("login");
        } else {
          toast.success("注册成功，欢迎加入");
          onSuccess?.();
        }
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(trimmedEmail, {
          redirectTo: `${window.location.origin}/`,
        });
        if (error) {
          console.warn("[auth] reset password failed:", safeErrorCode(error));
          throw error;
        }
        toast.success("重置链接已发到邮箱，请去查收");
        setTab("login");
      }
    } catch (err) {
      toast.error(translateAuthError(err, tab));
    } finally {
      setLoading(false);
    }
  };


  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      {/* blurred lock backdrop */}
      <div className="absolute inset-0 bg-background/40 backdrop-blur-xl" />
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-border bg-card/80 p-7 shadow-elevated backdrop-blur-2xl animate-[fade-in_0.3s_ease-out]">
        {/* aurora glow */}
        <div className="pointer-events-none absolute -top-24 left-1/2 h-48 w-72 -translate-x-1/2 rounded-full bg-gradient-aurora opacity-20 blur-3xl" />

        <div className="relative">
          <div className="mb-5 flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-aurora shadow-glow">
              <Sparkles className="h-4 w-4 text-primary-foreground" strokeWidth={2.5} />
            </div>
            <div>
              <div className="font-display text-base font-semibold" translate="no">ShunTu</div>
              <div className="text-[11px] text-muted-foreground">
                {tab === "login" ? "欢迎回来，开启你的创作" : tab === "signup" ? "创建账号，免费体验" : "找回你的账号"}
              </div>
            </div>
          </div>

          {tab !== "forgot" && (
            <div className="mb-5 flex gap-1 rounded-lg border border-border bg-white/[0.02] p-1">
              {(["login", "signup"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={`flex-1 rounded-md py-1.5 text-xs font-medium transition-all ${
                    tab === t ? "bg-gradient-aurora text-primary-foreground shadow-glow" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t === "login" ? "登录" : "注册"}
                </button>
              ))}
            </div>
          )}

          <form onSubmit={submit} className="space-y-3">
            <Field icon={<Mail className="h-4 w-4" />}>
              <input
                type="email"
                required
                placeholder="邮箱地址"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </Field>

            {tab !== "forgot" && (
              <Field icon={<Lock className="h-4 w-4" />}>
                <input
                  type="password"
                  required
                  minLength={tab === "signup" ? 6 : 1}
                  placeholder="密码"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
              </Field>
            )}

            {tab === "signup" && (
              <Field icon={<Lock className="h-4 w-4" />}>
                <input
                  type="password"
                  required
                  minLength={6}
                  placeholder="确认密码"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
              </Field>
            )}

            <label className="mt-1 flex items-start gap-2 text-[11px] leading-relaxed text-muted-foreground select-none">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => toggleAgreed(e.target.checked)}
                className="mt-0.5 h-3.5 w-3.5 cursor-pointer accent-primary"
              />
              <span>
                我已阅读并同意
                <a
                  href="/disclaimer"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mx-0.5 text-primary underline-offset-2 hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  《用户声明与免责声明》
                </a>
              </span>
            </label>

            <button
              type="submit"
              disabled={loading}
              aria-disabled={!agreed}
              className="mt-2 flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-gradient-aurora text-sm font-semibold text-primary-foreground shadow-glow transition-transform hover:scale-[1.01] disabled:opacity-60"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {tab === "login" ? "登 录" : tab === "signup" ? "创建账号" : "发送重置链接"}
            </button>
          </form>

          {tab === "forgot" && (
            <div className="mt-4 rounded-xl border border-border bg-white/[0.03] p-3">
              <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                <Headphones className="h-3.5 w-3.5 text-primary" />
                收不到邮件？联系客服帮你重置
              </div>
              <div className="space-y-1.5">
                {contact.wechat && (
                  <ContactLine label="微信" value={contact.wechat} onCopy={() => copy(contact.wechat, "微信号")} />
                )}
                {contact.qq && (
                  <ContactLine label="QQ" value={contact.qq} onCopy={() => copy(contact.qq, "QQ 号")} />
                )}
                {!contact.wechat && !contact.qq && (
                  <div className="text-[11px] text-muted-foreground">暂未配置联系方式</div>
                )}
              </div>
            </div>
          )}

          <div className="mt-4 flex items-center justify-between text-[11px] text-muted-foreground">
            {tab === "login" ? (
              <>
                <button onClick={() => setTab("forgot")} className="hover:text-foreground">忘记密码？</button>
                <button onClick={() => setTab("signup")} className="hover:text-foreground">没有账号？立即注册</button>
              </>
            ) : (
              <button onClick={() => setTab("login")} className="hover:text-foreground">← 返回登录</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="group flex h-11 items-center gap-2.5 rounded-lg border border-border bg-white/[0.03] px-3 transition-all focus-within:border-primary/60 focus-within:bg-white/[0.05] focus-within:shadow-[0_0_0_3px_oklch(0.86_0.21_155_/_0.18)] focus-within:[animation:breathe_2.4s_ease-in-out_infinite]">
      <span className="text-muted-foreground transition-colors group-focus-within:text-primary">{icon}</span>
      {children}
    </label>
  );
}

function ContactLine({ label, value, onCopy }: { label: string; value: string; onCopy: () => void }) {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-white/[0.02] px-2.5 py-1.5">
      <span className="w-8 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className="min-w-0 flex-1 truncate font-mono text-xs">{value}</span>
      <button
        type="button"
        onClick={onCopy}
        className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[10px] text-muted-foreground hover:bg-white/[0.05] hover:text-foreground"
      >
        <Copy className="h-3 w-3" />复制
      </button>
    </div>
  );
}
