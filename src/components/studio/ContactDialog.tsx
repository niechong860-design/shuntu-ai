import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useServerFn } from "@tanstack/react-start";
import { getContactInfo } from "@/lib/admin.functions";
import { Copy, Headphones, MessageCircle } from "lucide-react";
import { toast } from "sonner";

type Props = { open: boolean; onOpenChange: (v: boolean) => void };

export function ContactDialog({ open, onOpenChange }: Props) {
  const fetchFn = useServerFn(getContactInfo);
  const [wechat, setWechat] = useState("");
  const [qq, setQq] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetchFn()
      .then((r: any) => {
        setWechat(r?.wechat ?? "");
        setQq(r?.qq ?? "");
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open]);

  const copy = async (val: string, label: string) => {
    try {
      await navigator.clipboard.writeText(val);
      toast.success(`${label} 已复制`);
    } catch {
      toast.error("复制失败");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Headphones className="h-4 w-4 text-primary" />
            联系客服
          </DialogTitle>
          <DialogDescription>添加下方任一方式，我们会尽快为您处理</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <ContactRow
            label="微信 WX"
            value={wechat}
            loading={loading}
            onCopy={() => copy(wechat, "微信号")}
          />
          <ContactRow
            label="QQ"
            value={qq}
            loading={loading}
            onCopy={() => copy(qq, "QQ 号")}
          />
          {!loading && !wechat && !qq && (
            <div className="rounded-lg border border-dashed border-border bg-white/[0.02] p-4 text-center text-xs text-muted-foreground">
              管理员尚未配置联系方式
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ContactRow({
  label, value, loading, onCopy,
}: { label: string; value: string; loading: boolean; onCopy: () => void }) {
  if (!value && !loading) return null;
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-white/[0.03] p-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <MessageCircle className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="truncate font-mono text-sm">
          {loading ? "加载中…" : value}
        </div>
      </div>
      {!loading && value && (
        <Button size="sm" variant="outline" onClick={onCopy}>
          <Copy className="mr-1.5 h-3.5 w-3.5" />复制
        </Button>
      )}
    </div>
  );
}
