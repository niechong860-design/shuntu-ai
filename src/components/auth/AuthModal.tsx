import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Sparkles, Loader2, Mail, Lock } from "lucide-react";
import { toast } from "sonner";

type Tab = "login" | "signup" | "forgot";

/** 把 Supabase 返回的英文错误翻成大白话中文 */
function translateAuthError(err: unknown, tab: Tab): string {
  const raw = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  const m = raw.toLowerCase();

  // 已经是中文的（自定义抛出）直接返回
  if (/[\u4e00-\u9fa5]/.test(raw)) return raw;

  if (!raw) return "操作失败，请稍后再试";

  // 登录类
  if (m.includes("invalid login") || m.includes("invalid credentials") || m.includes("invalid_grant"))
    return "邮箱或密码不对，请再检查一下";
  if (m.includes("email not confirmed") || m.includes("email_not_confirmed"))
    return "邮箱还没验证，请去邮箱点一下验证链接再登录";
  if (m.includes("user not found") || m.includes("no user found"))
    return "找不到这个账号，要不先去注册一下？";
  if (m.includes("user is banned") || m.includes("banned"))
    return "这个账号已被封禁，请联系客服";

  // 注册类
  if (m.includes("user already registered") || m.includes("already registered") || m.includes("already been registered"))
    return "这个邮箱已经注册过了，直接登录就行";
  if (m.includes("password should be at least") || m.includes("password is too short") || m.includes("password_too_short"))
    return "密码太短啦，至少要 6 位";
  if (m.includes("password") && m.includes("weak"))
    return "密码太简单了，建议加上字母、数字或符号";
  if (m.includes("pwned") || m.includes("compromised"))
    return "这个密码在网上被泄露过了，换一个更安全的吧";
  if (m.includes("invalid email") || m.includes("email_address_invalid"))
    return "邮箱格式不对，请检查一下";
  if (m.includes("signup") && m.includes("disabled"))
    return "暂时不开放注册，请稍后再来";

  // 频率/限流
  if (m.includes("rate limit") || m.includes("too many requests") || m.includes("over_email_send_rate_limit"))
    return "操作太频繁啦，歇一会儿再试";
  if (m.includes("email rate limit"))
    return "验证邮件发太快了，请等几分钟再试";

  // 重置密码
  if (m.includes("token") && (m.includes("expired") || m.includes("invalid")))
    return "链接已失效，请重新发送一封";

  // 网络
  if (m.includes("failed to fetch") || m.includes("network") || m.includes("networkerror"))
    return "网络不太通畅，请检查网络后重试";
  if (m.includes("timeout") || m.includes("timed out"))
    return "请求超时了，请重试一下";

  // 服务端
  if (/\b5\d\d\b/.test(m) || m.includes("internal server"))
    return "服务器临时打了个盹，请稍后再试";

  // 兜底：按 tab 给一个友好的默认
  return tab === "login"
    ? "登录失败，请检查邮箱和密码后重试"
    : tab === "signup"
      ? "注册失败，请稍后再试"
      : "发送失败，请稍后再试";
}

export function AuthModal({ onSuccess }: { onSuccess?: () => void }) {
  const [tab, setTab] = useState<Tab>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    // 前置校验（用大白话）
    const trimmedEmail = email.trim();
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
        if (error) throw error;
        toast.success("登录成功，欢迎回来");
        onSuccess?.();
      } else if (tab === "signup") {
        const { error } = await supabase.auth.signUp({
          email: trimmedEmail,
          password,
          options: { emailRedirectTo: `${window.location.origin}/` },
        });
        if (error) throw error;
        toast.success("注册成功！请去邮箱点一下验证链接");
        setTab("login");
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(trimmedEmail, {
          redirectTo: `${window.location.origin}/`,
        });
        if (error) throw error;
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
                  minLength={6}
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

            <button
              type="submit"
              disabled={loading}
              className="mt-2 flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-gradient-aurora text-sm font-semibold text-primary-foreground shadow-glow transition-transform hover:scale-[1.01] disabled:opacity-60"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {tab === "login" ? "登 录" : tab === "signup" ? "创建账号" : "发送重置链接"}
            </button>
          </form>

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
