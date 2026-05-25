import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Loader2, Upload, Lock, User as UserIcon } from "lucide-react";
import { toast } from "sonner";
import { thumbUrl } from "@/lib/image-url";

export function SettingsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { user, profile, refreshProfile } = useAuth();
  const [tab, setTab] = useState("security");

  // password state
  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [savingPwd, setSavingPwd] = useState(false);

  // profile state
  const [displayName, setDisplayName] = useState(profile?.display_name || "");
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const updatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPwd !== confirmPwd) return toast.error("两次输入的新密码不一致");
    if (newPwd.length < 6) return toast.error("密码至少 6 位");
    setSavingPwd(true);
    try {
      // verify current password
      const { error: signinErr } = await supabase.auth.signInWithPassword({
        email: user!.email!,
        password: currentPwd,
      });
      if (signinErr) throw new Error("当前密码不正确");
      const { error } = await supabase.auth.updateUser({ password: newPwd });
      if (error) throw error;
      toast.success("密码已更新");
      setCurrentPwd(""); setNewPwd(""); setConfirmPwd("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "更新失败");
    } finally { setSavingPwd(false); }
  };

  const uploadAvatar = async (file: File) => {
    if (!user) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "png";
      const path = `${user.id}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(path);
      const { error: profErr } = await supabase.from("profiles").update({ avatar_url: publicUrl }).eq("id", user.id);
      if (profErr) throw profErr;
      await refreshProfile();
      toast.success("头像已更新");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "上传失败");
    } finally { setUploading(false); }
  };

  const saveProfile = async () => {
    if (!user) return;
    setSavingProfile(true);
    try {
      const { error } = await supabase.from("profiles").update({ display_name: displayName }).eq("id", user.id);
      if (error) throw error;
      await refreshProfile();
      toast.success("资料已保存");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "保存失败");
    } finally { setSavingProfile(false); }
  };

  const initial = (profile?.display_name || profile?.email || "U")[0].toUpperCase();
  const avatar = profile?.avatar_url;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg border-border/70 bg-card/90 backdrop-blur-2xl">
        <DialogHeader>
          <DialogTitle className="font-display text-base">个人管理中心</DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2 bg-white/[0.03]">
            <TabsTrigger value="security" className="gap-1.5 text-xs"><Lock className="h-3.5 w-3.5" /> 安全设置</TabsTrigger>
            <TabsTrigger value="profile" className="gap-1.5 text-xs"><UserIcon className="h-3.5 w-3.5" /> 资料修改</TabsTrigger>
          </TabsList>

          <TabsContent value="security" className="mt-5">
            <form onSubmit={updatePassword} className="space-y-3">
              <Input label="当前密码" type="password" value={currentPwd} onChange={setCurrentPwd} />
              <Input label="新密码" type="password" value={newPwd} onChange={setNewPwd} />
              <Input label="确认新密码" type="password" value={confirmPwd} onChange={setConfirmPwd} />
              <button
                type="submit"
                disabled={savingPwd}
                className="mt-2 flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-gradient-aurora text-sm font-semibold text-primary-foreground shadow-glow disabled:opacity-60"
              >
                {savingPwd && <Loader2 className="h-4 w-4 animate-spin" />} 保存修改
              </button>
            </form>
          </TabsContent>

          <TabsContent value="profile" className="mt-5 space-y-5">
            <div className="flex items-center gap-4">
              <button
                onClick={() => fileRef.current?.click()}
                className="group relative h-20 w-20 overflow-hidden rounded-full ring-1 ring-border transition-all hover:ring-primary/60"
              >
                {avatar ? (
                  <img src={thumbUrl(avatar, { width: 160, quality: 80 })} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                ) : (
                  <>
                    <div className="h-full w-full bg-gradient-to-br from-primary/40 via-accent to-secondary" />
                    <div className="absolute inset-0 flex items-center justify-center text-2xl font-semibold">{initial}</div>
                  </>
                )}
                <div className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 transition-opacity group-hover:opacity-100">
                  {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
                </div>
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => e.target.files?.[0] && uploadAvatar(e.target.files[0])}
              />
              <div className="text-xs text-muted-foreground">
                <div>点击头像更换</div>
                <div className="mt-1">建议正方形 · JPG/PNG · ≤ 2MB</div>
              </div>
            </div>

            <Input label="昵称" type="text" value={displayName} onChange={setDisplayName} />
            <Input label="邮箱" type="email" value={user?.email || ""} onChange={() => {}} disabled />

            <button
              onClick={saveProfile}
              disabled={savingProfile}
              className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-gradient-aurora text-sm font-semibold text-primary-foreground shadow-glow disabled:opacity-60"
            >
              {savingProfile && <Loader2 className="h-4 w-4 animate-spin" />} 保存资料
            </button>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function Input({ label, type, value, onChange, disabled }: { label: string; type: string; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-medium text-muted-foreground">{label}</span>
      <input
        type={type}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-full rounded-lg border border-border bg-white/[0.03] px-3 text-sm outline-none transition-all focus:border-primary/60 focus:bg-white/[0.05] focus:shadow-[0_0_0_3px_oklch(0.86_0.21_155_/_0.18)] disabled:opacity-60"
      />
    </label>
  );
}
