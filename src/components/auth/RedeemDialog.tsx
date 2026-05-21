import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useServerFn } from "@tanstack/react-start";
import { redeemCoupon } from "@/lib/admin.functions";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { Gift, Sparkles } from "lucide-react";

export function RedeemDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const fn = useServerFn(redeemCoupon);
  const { refreshProfile } = useAuth();

  useEffect(() => { if (!open) setCode(""); }, [open]);

  const submit = async () => {
    if (!code.trim()) return;
    setLoading(true);
    try {
      const r = await fn({ data: { code: code.trim() } });
      if (r.success) {
        toast.success(`兑换成功！已为您充值 ${r.amount} 点数`);
        await refreshProfile();
        onOpenChange(false);
      } else {
        toast.error(r.message || "兑换失败");
      }
    } catch (e: any) {
      toast.error(e.message || "兑换失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md border-border/70 bg-card/80 backdrop-blur-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gift className="h-4 w-4 text-primary" /> 卡密兑换中心
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="relative overflow-hidden rounded-lg border border-border bg-white/[0.03] p-4">
            <div className="pointer-events-none absolute -top-10 -right-10 h-32 w-32 rounded-full bg-gradient-aurora opacity-20 blur-3xl" />
            <p className="text-xs text-muted-foreground">输入您手中的充值卡密，立即获得对应算力点数。</p>
          </div>
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">请输入您的充值卡密</label>
            <Input
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="LUMEN-XXXX-XXXX"
              className="h-11 font-mono tracking-wider"
              onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
            />
          </div>
          <Button
            onClick={submit}
            disabled={loading || !code.trim()}
            className="w-full bg-gradient-aurora text-primary-foreground shadow-glow"
          >
            <Sparkles className="mr-2 h-4 w-4" />
            {loading ? "兑换中…" : "立即兑换"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
