import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useServerFn } from "@tanstack/react-start";
import {
  adminListUsers, adminResetPassword, adminAdjustCredits,
  adminListCoupons, adminGenerateCoupons,
} from "@/lib/admin.functions";
import { toast } from "sonner";
import { Shield, KeyRound, Coins, Copy, Plus, RefreshCw, Users, Ticket } from "lucide-react";

type UserRow = { id: string; email: string | null; display_name: string | null; credits: number; created_at: string };
type Coupon = {
  id: string; code: string; amount: number; is_used: boolean;
  used_by_email: string | null; used_at: string | null; created_at: string;
};

export function AdminDashboard({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl border-border/70 bg-card/80 p-0 backdrop-blur-2xl">
        <DialogHeader className="border-b border-border/60 px-6 py-4">
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" /> 系统管理后台
          </DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="users" className="px-6 pb-6 pt-4">
          <TabsList className="bg-white/[0.04]">
            <TabsTrigger value="users" className="gap-1.5"><Users className="h-3.5 w-3.5" />用户管理</TabsTrigger>
            <TabsTrigger value="coupons" className="gap-1.5"><Ticket className="h-3.5 w-3.5" />卡密管理</TabsTrigger>
          </TabsList>
          <TabsContent value="users" className="mt-4"><UsersPanel /></TabsContent>
          <TabsContent value="coupons" className="mt-4"><CouponsPanel /></TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function UsersPanel() {
  const list = useServerFn(adminListUsers);
  const resetPw = useServerFn(adminResetPassword);
  const adjust = useServerFn(adminAdjustCredits);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [pwOpen, setPwOpen] = useState<UserRow | null>(null);
  const [creditOpen, setCreditOpen] = useState<UserRow | null>(null);

  const load = async () => {
    setLoading(true);
    try { setUsers((await list({})) as UserRow[]); } catch (e: any) { toast.error(e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">共 {users.length} 个用户</p>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" />刷新
        </Button>
      </div>
      <div className="max-h-[55vh] overflow-auto rounded-lg border border-border/60">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>邮箱</TableHead>
              <TableHead>用户ID</TableHead>
              <TableHead>注册时间</TableHead>
              <TableHead className="text-right">算力余额</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map(u => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">{u.email ?? "—"}</TableCell>
                <TableCell className="font-mono text-[11px] text-muted-foreground">{u.id.slice(0, 8)}…</TableCell>
                <TableCell className="text-xs text-muted-foreground">{new Date(u.created_at).toLocaleString()}</TableCell>
                <TableCell className="text-right font-mono tabular-nums">{u.credits.toLocaleString()}</TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="sm" onClick={() => setPwOpen(u)}>
                    <KeyRound className="mr-1 h-3.5 w-3.5" />重置密码
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setCreditOpen(u)}>
                    <Coins className="mr-1 h-3.5 w-3.5" />控制余额
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Reset password */}
      <Dialog open={!!pwOpen} onOpenChange={(v) => !v && setPwOpen(null)}>
        <DialogContent className="max-w-sm border-border/70 bg-card/80 backdrop-blur-2xl">
          <DialogHeader><DialogTitle>重置密码 · {pwOpen?.email}</DialogTitle></DialogHeader>
          <ResetPwForm
            onSubmit={async (pw) => {
              if (!pwOpen) return;
              try { await resetPw({ data: { userId: pwOpen.id, newPassword: pw } }); toast.success("密码已重置"); setPwOpen(null); }
              catch (e: any) { toast.error(e.message); }
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Adjust credits */}
      <Dialog open={!!creditOpen} onOpenChange={(v) => !v && setCreditOpen(null)}>
        <DialogContent className="max-w-sm border-border/70 bg-card/80 backdrop-blur-2xl">
          <DialogHeader><DialogTitle>控制余额 · {creditOpen?.email}</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground">当前余额：<span className="font-mono">{creditOpen?.credits.toLocaleString()}</span></p>
          <AdjustForm
            onSubmit={async (delta) => {
              if (!creditOpen) return;
              try {
                const r = await adjust({ data: { userId: creditOpen.id, delta } });
                toast.success(`更新成功，新余额 ${r.credits}`);
                setCreditOpen(null);
                load();
              } catch (e: any) { toast.error(e.message); }
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ResetPwForm({ onSubmit }: { onSubmit: (pw: string) => Promise<void> }) {
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="space-y-3 pt-2">
      <Input type="text" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="新密码（至少 6 位）" />
      <Button
        className="w-full" disabled={busy || pw.length < 6}
        onClick={async () => { setBusy(true); await onSubmit(pw); setBusy(false); }}
      >确认重置</Button>
    </div>
  );
}

function AdjustForm({ onSubmit }: { onSubmit: (delta: number) => Promise<void> }) {
  const [val, setVal] = useState("100");
  const [busy, setBusy] = useState(false);
  const submit = async (sign: 1 | -1) => {
    const n = parseInt(val, 10);
    if (!Number.isFinite(n) || n <= 0) return toast.error("请输入正整数");
    setBusy(true); await onSubmit(sign * n); setBusy(false);
  };
  return (
    <div className="space-y-3 pt-2">
      <Input type="number" value={val} onChange={(e) => setVal(e.target.value)} placeholder="点数" />
      <div className="flex gap-2">
        <Button className="flex-1" disabled={busy} onClick={() => submit(1)}>+ 增加</Button>
        <Button className="flex-1" variant="destructive" disabled={busy} onClick={() => submit(-1)}>− 扣除</Button>
      </div>
    </div>
  );
}

function CouponsPanel() {
  const list = useServerFn(adminListCoupons);
  const gen = useServerFn(adminGenerateCoupons);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [count, setCount] = useState("10");
  const [amount, setAmount] = useState("200");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try { setCoupons((await list({})) as Coupon[]); } catch (e: any) { toast.error(e.message); }
  };
  useEffect(() => { load(); }, []);

  const generate = async () => {
    const c = parseInt(count, 10); const a = parseInt(amount, 10);
    if (!c || !a) return toast.error("请填写数量与面额");
    setBusy(true);
    try { await gen({ data: { count: c, amount: a } }); toast.success(`已生成 ${c} 张卡密`); load(); }
    catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  };

  const copyAll = () => {
    const unused = coupons.filter(c => !c.is_used).map(c => c.code).join("\n");
    navigator.clipboard.writeText(unused);
    toast.success("已复制全部未使用卡密");
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2 rounded-lg border border-border/60 bg-white/[0.03] p-3">
        <div className="space-y-1">
          <label className="text-[11px] text-muted-foreground">生成数量</label>
          <Input type="number" value={count} onChange={(e) => setCount(e.target.value)} className="h-9 w-28" />
        </div>
        <div className="space-y-1">
          <label className="text-[11px] text-muted-foreground">每张面额（点）</label>
          <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="h-9 w-28" />
        </div>
        <Button onClick={generate} disabled={busy} className="bg-gradient-aurora text-primary-foreground">
          <Plus className="mr-1 h-3.5 w-3.5" />生成
        </Button>
        <div className="flex-1" />
        <Button variant="outline" size="sm" onClick={copyAll}><Copy className="mr-1.5 h-3.5 w-3.5" />复制未使用</Button>
        <Button variant="outline" size="sm" onClick={load}><RefreshCw className="mr-1.5 h-3.5 w-3.5" />刷新</Button>
      </div>

      <div className="max-h-[50vh] overflow-auto rounded-lg border border-border/60">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>卡密</TableHead>
              <TableHead className="text-right">面额</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>使用者</TableHead>
              <TableHead>使用时间</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {coupons.map(c => (
              <TableRow key={c.id}>
                <TableCell className="font-mono text-xs">{c.code}</TableCell>
                <TableCell className="text-right font-mono tabular-nums">{c.amount}</TableCell>
                <TableCell>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] ${c.is_used ? "bg-destructive/15 text-destructive" : "bg-primary/15 text-primary"}`}>
                    {c.is_used ? "已使用" : "未使用"}
                  </span>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{c.used_by_email ?? "—"}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{c.used_at ? new Date(c.used_at).toLocaleString() : "—"}</TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="sm" onClick={() => { navigator.clipboard.writeText(c.code); toast.success("已复制"); }}>
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
