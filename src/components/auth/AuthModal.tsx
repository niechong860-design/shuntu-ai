import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Sparkles, Loader2, Mail, Lock } from "lucide-react";
import { toast } from "sonner";

type Tab = "login" | "signup" | "forgot";

export function AuthModal({ onSuccess }: { onSuccess?: () => void }) {
  const [tab, setTab] = useState<Tab>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (tab === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("登录成功");
        onSuccess?.();
      } else if (tab === "signup") {
        if (password !== confirm) throw new Error("两次输入的密码不一致");
        if (password.length < 6) throw new Error("密码至少 6 位");
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/` },
        });
        if (error) throw error;
        toast.success("注册成功，请查收邮件完成验证");
        setTab("login");
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/`,
        });
        if (error) throw error;
        toast.success("重置链接已发送至邮箱");
        setTab("login");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "操作失败");
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
