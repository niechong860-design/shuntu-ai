import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Lock } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { verifyAdminAccessPassword } from "@/lib/admin.functions";
import { toast } from "sonner";

export function AccessGate({
  open,
  onCancel,
  onPass,
}: {
  open: boolean;
  onCancel: () => void;
  onPass: () => void;
}) {
  const verify = useServerFn(verifyAdminAccessPassword);
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (open) setPw(""); }, [open]);

  const submit = async () => {
    if (!pw.trim()) return toast.error("请输入访问密码");
    setBusy(true);
    try {
      await verify({ data: { password: pw } });
      onPass();
    } catch (e: any) {
      toast.error(e.message || "验证失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <DialogContent className="max-w-sm border-border/70 bg-card/85 backdrop-blur-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-primary" /> 后台访问验证
          </DialogTitle>
          <DialogDescription>请输入后台访问密码以继续。</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 pt-1">
          <Input
            autoFocus
            type="password"
            placeholder="访问密码（支持中文）"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
          />
          <Button className="w-full" onClick={submit} disabled={busy}>
            {busy ? "验证中…" : "进入后台"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
