import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useServerFn } from "@tanstack/react-start";
import {
  adminListUsers, adminResetPassword, adminAdjustCredits,
  adminBanUser, adminDeleteUser,
  adminGetUserCreditUsageLogs,
  adminListCoupons, adminGenerateCoupons, adminDeleteCoupon,
} from "@/lib/admin.functions";
import { toast } from "sonner";
import { Shield, KeyRound, Coins, Copy, Plus, RefreshCw, Users, Ticket, LayoutDashboard, Trash2, Sparkles, Megaphone, Crown, Lock, Palette, Ban, CircleCheck, Bell, ShoppingBag } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { AnalyticsPanel } from "./AnalyticsPanel";
import { ModelsPanel } from "./ModelsPanel";
import { AdsPanel } from "./AdsPanel";
import { AnnouncementsPanel } from "./AnnouncementsPanel";
import { AdminsPanel } from "./AdminsPanel";
import { AccessGate } from "./AccessGate";
import { AccessPasswordPanel } from "./AccessPasswordPanel";
import { StyleTemplatesPanel } from "./StyleTemplatesPanel";
import { RechargePackagesPanel } from "./RechargePackagesPanel";

type UserRow = { id: string; email: string | null; display_name: string | null; credits: number; created_at: string; total_spent: number; is_banned?: boolean };
type CreditUsageLog = {
  id: string;
  user_id: string;
  amount: number | string;
  source: string;
  model_key: string | null;
  model_name: string | null;
  generation_history_id: string | null;
  generation_task_id: string | null;
  image_url?: string | null;
  idempotency_key: string;
  created_at: string;
  metadata?: unknown;
};
type Coupon = {
  id: string; code: string; amount: number; is_used: boolean;
  used_by_email: string | null; used_at: string | null; created_at: string;
};

export function AdminDashboard({ open, onOpenChange, isFounder = false }: { open: boolean; onOpenChange: (v: boolean) => void; isFounder?: boolean }) {
  const [unlocked, setUnlocked] = useState(false);

  useEffect(() => { if (!open) setUnlocked(false); }, [open]);

  if (open && !unlocked) {
    return (
      <AccessGate
        open={open}
        onCancel={() => onOpenChange(false)}
        onPass={() => setUnlocked(true)}
      />
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl overflow-hidden border-border/70 bg-card/80 p-0 backdrop-blur-2xl">
        <DialogHeader className="border-b border-border/60 px-6 py-4">
          <DialogTitle className="flex items-center gap-2">
            {isFounder ? <Crown className="h-4 w-4 text-primary" /> : <Shield className="h-4 w-4 text-primary" />}
            {isFounder ? "创始人后台" : "系统管理后台"}
          </DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="analytics" className="min-w-0 px-6 pb-6 pt-4">
          <div className="w-full max-w-full overflow-x-auto overflow-y-hidden pb-1">
          <TabsList className="inline-flex w-max min-w-max flex-nowrap bg-white/[0.04]">
            <TabsTrigger value="analytics" className="shrink-0 whitespace-nowrap gap-1.5"><LayoutDashboard className="h-3.5 w-3.5" />数据仪表盘</TabsTrigger>
            <TabsTrigger value="users" className="shrink-0 whitespace-nowrap gap-1.5"><Users className="h-3.5 w-3.5" />用户管理</TabsTrigger>
            <TabsTrigger value="coupons" className="shrink-0 whitespace-nowrap gap-1.5"><Ticket className="h-3.5 w-3.5" />卡密管理</TabsTrigger>
            <TabsTrigger value="recharge" className="shrink-0 whitespace-nowrap gap-1.5"><ShoppingBag className="h-3.5 w-3.5" />充值套餐配置</TabsTrigger>
            <TabsTrigger value="models" className="shrink-0 whitespace-nowrap gap-1.5"><Sparkles className="h-3.5 w-3.5" />模型点数价格控制</TabsTrigger>
            <TabsTrigger value="ads" className="shrink-0 whitespace-nowrap gap-1.5"><Megaphone className="h-3.5 w-3.5" />广告管理</TabsTrigger>
            <TabsTrigger value="announcements" className="shrink-0 whitespace-nowrap gap-1.5"><Bell className="h-3.5 w-3.5" />通知公告</TabsTrigger>
            <TabsTrigger value="styles" className="shrink-0 whitespace-nowrap gap-1.5"><Palette className="h-3.5 w-3.5" />客服 &amp; 系统提示词</TabsTrigger>
            {isFounder && (
              <TabsTrigger value="admins" className="shrink-0 whitespace-nowrap gap-1.5"><Crown className="h-3.5 w-3.5" />管理员管理</TabsTrigger>
            )}
            {isFounder && (
              <TabsTrigger value="access" className="shrink-0 whitespace-nowrap gap-1.5"><Lock className="h-3.5 w-3.5" />访问密码</TabsTrigger>
            )}
          </TabsList>
          </div>
          <TabsContent value="analytics" className="mt-4 max-h-[70vh] overflow-auto pr-1"><AnalyticsPanel /></TabsContent>
          <TabsContent value="users" className="mt-4"><UsersPanel /></TabsContent>
          <TabsContent value="coupons" className="mt-4"><CouponsPanel /></TabsContent>
          <TabsContent value="recharge" className="mt-4"><RechargePackagesPanel /></TabsContent>
          <TabsContent value="models" className="mt-4"><ModelsPanel /></TabsContent>
          <TabsContent value="ads" className="mt-4"><AdsPanel /></TabsContent>
          <TabsContent value="announcements" className="mt-4"><AnnouncementsPanel /></TabsContent>
          <TabsContent value="styles" className="mt-4 max-h-[70vh] overflow-auto pr-1"><StyleTemplatesPanel /></TabsContent>
          {isFounder && <TabsContent value="admins" className="mt-4"><AdminsPanel /></TabsContent>}
          {isFounder && <TabsContent value="access" className="mt-4"><AccessPasswordPanel /></TabsContent>}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function UsersPanel() {
  const list = useServerFn(adminListUsers);
  const usageList = useServerFn(adminGetUserCreditUsageLogs);
  const resetPw = useServerFn(adminResetPassword);
  const adjust = useServerFn(adminAdjustCredits);
  const banFn = useServerFn(adminBanUser);
  const delFn = useServerFn(adminDeleteUser);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [pwOpen, setPwOpen] = useState<UserRow | null>(null);
  const [creditOpen, setCreditOpen] = useState<UserRow | null>(null);
  const [usageOpen, setUsageOpen] = useState<UserRow | null>(null);
  const [usageLogs, setUsageLogs] = useState<CreditUsageLog[]>([]);
  const [usageTotal, setUsageTotal] = useState(0);
  const [usageLoading, setUsageLoading] = useState(false);
  const [search, setSearch] = useState("");
  const usagePageSize = 50;

  const load = async () => {
    setLoading(true);
    try { setUsers((await list({})) as UserRow[]); } catch (e: any) { toast.error(e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const loadUsageLogs = async (user: UserRow, offset = 0, append = false) => {
    setUsageLoading(true);
    try {
      const res = await usageList({ data: { userId: user.id, limit: usagePageSize, offset } }) as {
        items: CreditUsageLog[];
        total: number;
      };
      setUsageLogs((prev) => append ? [...prev, ...(res.items ?? [])] : (res.items ?? []));
      setUsageTotal(Number(res.total ?? 0));
    } catch (e: any) {
      toast.error(e.message ?? "消费明细加载失败");
    } finally {
      setUsageLoading(false);
    }
  };

  const openUsageLogs = (user: UserRow) => {
    setUsageOpen(user);
    setUsageLogs([]);
    setUsageTotal(0);
    void loadUsageLogs(user);
  };

  const q = search.trim().toLowerCase();
  const filtered = q
    ? users.filter(u => (u.email ?? "").toLowerCase().includes(q) || u.id.toLowerCase().includes(q))
    : users;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Input
            placeholder="搜索邮箱 / 用户ID"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 w-64"
          />
          <p className="text-xs text-muted-foreground">共 {filtered.length} / {users.length} 个用户</p>
        </div>
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
              <TableHead className="text-right">累计消耗</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map(u => (
              <TableRow key={u.id} className={u.is_banned ? "opacity-60" : undefined}>
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    <span>{u.email ?? "—"}</span>
                    {u.is_banned && (
                      <span className="rounded-full bg-destructive/15 px-1.5 py-0.5 text-[10px] text-destructive">已封禁</span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="font-mono text-[11px] text-muted-foreground">{u.id.slice(0, 8)}…</TableCell>
                <TableCell className="text-xs text-muted-foreground">{new Date(u.created_at).toLocaleString()}</TableCell>
                <TableCell className="text-right font-mono tabular-nums">{u.credits.toLocaleString()}</TableCell>
                <TableCell className="text-right font-mono tabular-nums text-primary">{Number(u.total_spent ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button variant="ghost" size="sm" onClick={() => setPwOpen(u)}>
                      <KeyRound className="mr-1 h-3.5 w-3.5" />重置密码
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setCreditOpen(u)}>
                      <Coins className="mr-1 h-3.5 w-3.5" />控制余额
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => openUsageLogs(u)}>
                      消耗明细
                    </Button>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className={u.is_banned ? "text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-400" : "text-amber-400 hover:bg-amber-500/10 hover:text-amber-400"}
                        >
                          {u.is_banned ? <CircleCheck className="mr-1 h-3.5 w-3.5" /> : <Ban className="mr-1 h-3.5 w-3.5" />}
                          {u.is_banned ? "解封" : "封禁"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent align="end" className="w-64 border-border/70 bg-card/90 backdrop-blur-xl">
                        <p className="text-xs text-foreground">
                          确定要{u.is_banned ? "解封" : "封禁"}用户 <span className="font-medium">{u.email}</span> 吗？
                        </p>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {u.is_banned ? "解封后用户可以重新登录使用。" : "封禁后用户将无法登录或使用平台。"}
                        </p>
                        <div className="mt-3 flex justify-end">
                          <Button
                            size="sm"
                            variant={u.is_banned ? "default" : "destructive"}
                            onClick={async () => {
                              const next = !u.is_banned;
                              setUsers(prev => prev.map(x => x.id === u.id ? { ...x, is_banned: next } : x));
                              try {
                                await banFn({ data: { userId: u.id, banned: next } });
                                toast.success(next ? "已封禁用户" : "已解封用户");
                              } catch (e: any) { toast.error(e.message); load(); }
                            }}
                          >确认{u.is_banned ? "解封" : "封禁"}</Button>
                        </div>
                      </PopoverContent>
                    </Popover>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10 hover:text-destructive">
                          <Trash2 className="mr-1 h-3.5 w-3.5" />删除
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent align="end" className="w-72 border-border/70 bg-card/90 backdrop-blur-xl">
                        <p className="text-xs text-foreground">
                          确定要彻底删除用户 <span className="font-medium">{u.email}</span> 吗？
                        </p>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          将同时删除该用户的资料、生成记录与登录账号，操作不可恢复。
                        </p>
                        <div className="mt-3 flex justify-end">
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={async () => {
                              setUsers(prev => prev.filter(x => x.id !== u.id));
                              try {
                                await delFn({ data: { userId: u.id } });
                                toast.success("用户已删除");
                              } catch (e: any) { toast.error(e.message); load(); }
                            }}
                          >确认删除</Button>
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center text-xs text-muted-foreground">无匹配用户</TableCell></TableRow>
            )}
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

      {/* Credit usage details */}
      <Dialog
        open={!!usageOpen}
        onOpenChange={(v) => {
          if (!v) {
            setUsageOpen(null);
            setUsageLogs([]);
            setUsageTotal(0);
          }
        }}
      >
        <DialogContent className="max-w-6xl border-border/70 bg-card/90 backdrop-blur-2xl">
          <DialogHeader>
            <DialogTitle>消耗明细 - {usageOpen?.email ?? usageOpen?.id}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>共 {usageTotal} 条记录</span>
              {usageLoading && <span>加载中...</span>}
            </div>
            <div className="max-h-[55vh] overflow-auto rounded-lg border border-border/60">
              <div className="min-w-[1180px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>时间</TableHead>
                      <TableHead className="text-right">点数</TableHead>
                      <TableHead>来源</TableHead>
                      <TableHead>模型</TableHead>
                      <TableHead>model_key</TableHead>
                      <TableHead>history_id</TableHead>
                      <TableHead>task_id</TableHead>
                      <TableHead>image_url</TableHead>
                      <TableHead>幂等键</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {usageLogs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                          {new Date(log.created_at).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums text-primary">
                          {Number(log.amount ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="font-mono text-xs">{log.source}</TableCell>
                        <TableCell className="max-w-[160px] truncate" title={log.model_name ?? ""}>
                          {log.model_name ?? "—"}
                        </TableCell>
                        <TableCell className="font-mono text-xs">{log.model_key ?? "—"}</TableCell>
                        <TableCell className="max-w-[150px] truncate font-mono text-[11px]" title={log.generation_history_id ?? ""}>
                          {log.generation_history_id ?? "—"}
                        </TableCell>
                        <TableCell className="max-w-[150px] truncate font-mono text-[11px]" title={log.generation_task_id ?? ""}>
                          {log.generation_task_id ?? "—"}
                        </TableCell>
                        <TableCell className="max-w-[280px]">
                          {log.image_url ? (
                            <div className="flex min-w-0 items-center gap-1.5">
                              <span className="min-w-0 flex-1 truncate font-mono text-[11px]" title={log.image_url}>
                                {log.image_url}
                              </span>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 shrink-0 px-2"
                                onClick={async () => {
                                  try {
                                    await navigator.clipboard.writeText(log.image_url ?? "");
                                    toast.success("链接已复制");
                                  } catch {
                                    toast.error("复制失败");
                                  }
                                }}
                              >
                                <Copy className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="max-w-[220px] truncate font-mono text-[11px]" title={log.idempotency_key}>
                          {log.idempotency_key}
                        </TableCell>
                      </TableRow>
                    ))}
                    {!usageLoading && usageLogs.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={9} className="py-8 text-center text-xs text-muted-foreground">
                          暂无消费记录
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
            <div className="flex justify-end">
              <Button
                variant="outline"
                size="sm"
                disabled={!usageOpen || usageLoading || usageLogs.length >= usageTotal}
                onClick={() => usageOpen && loadUsageLogs(usageOpen, usageLogs.length, true)}
              >
                {usageLoading ? "加载中..." : "加载更多"}
              </Button>
            </div>
          </div>
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
  const del = useServerFn(adminDeleteCoupon);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [count, setCount] = useState("10");
  const [amount, setAmount] = useState("200");
  const [busy, setBusy] = useState(false);
  const [justGenerated, setJustGenerated] = useState<{ code: string; amount: number }[] | null>(null);

  const load = async () => {
    try { setCoupons((await list({})) as Coupon[]); } catch (e: any) { toast.error(e.message); }
  };
  useEffect(() => { load(); }, []);

  const generate = async () => {
    const c = parseInt(count, 10); const a = parseInt(amount, 10);
    if (!c || !a) return toast.error("请填写数量与面额");
    setBusy(true);
    try {
      const inserted = (await gen({ data: { count: c, amount: a } })) as { code: string; amount: number }[];
      toast.success(`已生成 ${c} 张卡密`);
      setJustGenerated(inserted ?? []);
      // Try to auto-copy immediately (works while user gesture context still active)
      try {
        await navigator.clipboard.writeText((inserted ?? []).map(x => x.code).join("\n"));
        toast.success("已自动复制到剪贴板");
      } catch { /* user can click copy in dialog */ }
      load();
    }
    catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  };

  const copyAll = () => {
    const unused = coupons.filter(c => !c.is_used).map(c => c.code).join("\n");
    navigator.clipboard.writeText(unused);
    toast.success("已复制全部未使用卡密");
  };

  const copyJustGenerated = async () => {
    if (!justGenerated?.length) return;
    try {
      await navigator.clipboard.writeText(justGenerated.map(x => x.code).join("\n"));
      toast.success(`已复制 ${justGenerated.length} 张卡密`);
    } catch {
      toast.error("复制失败，请手动选择文本复制");
    }
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
                  <div className="flex items-center justify-end gap-1">
                    <Button variant="ghost" size="sm" onClick={() => { navigator.clipboard.writeText(c.code); toast.success("已复制"); }}>
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={c.is_used}
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive disabled:opacity-30"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent align="end" className="w-64 border-border/70 bg-card/90 backdrop-blur-xl">
                        <p className="text-xs text-foreground">确定要彻底删除该卡密吗？</p>
                        <p className="mt-1 text-[11px] text-muted-foreground">删除后用户将无法兑换。</p>
                        <div className="mt-3 flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={async () => {
                              setCoupons(prev => prev.filter(x => x.id !== c.id));
                              try {
                                await del({ data: { couponId: c.id } });
                                toast.success("卡密删除成功");
                              } catch (e: any) {
                                toast.error(e.message);
                                load();
                              }
                            }}
                          >
                            确认删除
                          </Button>
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!justGenerated} onOpenChange={(v) => !v && setJustGenerated(null)}>
        <DialogContent className="max-w-lg border-border/70 bg-card/90 backdrop-blur-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Ticket className="h-4 w-4 text-primary" />
              本次生成的卡密（{justGenerated?.length ?? 0} 张 · 每张 {justGenerated?.[0]?.amount ?? 0} 点）
            </DialogTitle>
          </DialogHeader>
          <textarea
            readOnly
            value={(justGenerated ?? []).map(x => x.code).join("\n")}
            className="h-64 w-full resize-none rounded-md border border-border/60 bg-black/40 p-3 font-mono text-xs text-foreground focus:outline-none"
            onFocus={(e) => e.currentTarget.select()}
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setJustGenerated(null)}>关闭</Button>
            <Button size="sm" className="bg-gradient-aurora text-primary-foreground" onClick={copyJustGenerated}>
              <Copy className="mr-1.5 h-3.5 w-3.5" />一键复制全部
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
