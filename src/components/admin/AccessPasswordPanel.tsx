import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useServerFn } from "@tanstack/react-start";
import { founderGetAccessPassword, founderSetAccessPassword } from "@/lib/admin.functions";
import { toast } from "sonner";
import { Lock, Eye, EyeOff, Save, RefreshCw } from "lucide-react";

export function AccessPasswordPanel() {
  const getPw = useServerFn(founderGetAccessPassword);
  const setPw = useServerFn(founderSetAccessPassword);
  const [current, setCurrent] = useState<string>("");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [next, setNext] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const r: any = await getPw({});
      setCurrent(r.password ?? "");
      setUpdatedAt(r.updated_at ?? null);
      setNext(r.password ?? "");
    } catch (e: any) { toast.error(e.message); }
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!next.trim()) return toast.error("密码不能为空");
    setBusy(true);
    try {
      await setPw({ data: { password: next.trim() } });
      toast.success("访问密码已更新");
      load();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border/60 bg-white/[0.03] p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Lock className="h-4 w-4 text-primary" />
          后台访问密码
        </div>
        <p className="text-xs text-muted-foreground">
          所有管理员和创始人进入后台时都需要输入此密码。密码支持中文、英文、数字等任意字符。
        </p>

        <div className="space-y-1">
          <label className="text-[11px] text-muted-foreground">当前密码</label>
          <div className="flex items-center gap-2">
            <Input readOnly type={show ? "text" : "password"} value={current} className="font-mono" />
            <Button variant="outline" size="icon" onClick={() => setShow(s => !s)}>
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
            <Button variant="outline" size="icon" onClick={load}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
          {updatedAt && (
            <p className="text-[10px] text-muted-foreground">最后更新：{new Date(updatedAt).toLocaleString()}</p>
          )}
        </div>

        <div className="space-y-1">
          <label className="text-[11px] text-muted-foreground">设置新密码</label>
          <div className="flex items-center gap-2">
            <Input
              type="text"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              placeholder="例如：九辞后台2026"
            />
            <Button onClick={save} disabled={busy || !next.trim() || next.trim() === current}>
              <Save className="mr-1.5 h-3.5 w-3.5" />保存
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
