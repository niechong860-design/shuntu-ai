import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { founderListAdmins, founderAddAdmin, founderRemoveAdmin } from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Crown, Plus, RefreshCw, Trash2, Shield } from "lucide-react";
import { toast } from "sonner";

type Row = {
  user_id: string; role: "admin" | "founder";
  email: string | null; display_name: string | null; created_at: string;
};

export function AdminsPanel() {
  const list = useServerFn(founderListAdmins);
  const add = useServerFn(founderAddAdmin);
  const remove = useServerFn(founderRemoveAdmin);
  const [rows, setRows] = useState<Row[]>([]);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try { setRows((await list({})) as Row[]); } catch (e: any) { toast.error(e.message); }
  };
  useEffect(() => { load(); }, []);

  const onAdd = async () => {
    const v = email.trim();
    if (!v) return toast.error("请输入邮箱");
    setBusy(true);
    try { await add({ data: { email: v } }); toast.success("已添加管理员"); setEmail(""); load(); }
    catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-end gap-2 rounded-lg border border-border/60 bg-white/[0.03] p-3">
        <div className="flex-1 space-y-1">
          <label className="text-[11px] text-muted-foreground">通过邮箱添加管理员（用户需已注册）</label>
          <Input value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="user@example.com" onKeyDown={(e) => e.key === "Enter" && onAdd()} />
        </div>
        <Button onClick={onAdd} disabled={busy} className="bg-gradient-aurora text-primary-foreground">
          <Plus className="mr-1 h-3.5 w-3.5" />添加
        </Button>
        <Button variant="outline" size="sm" onClick={load}>
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" />刷新
        </Button>
      </div>

      <div className="max-h-[55vh] overflow-auto rounded-lg border border-border/60">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>角色</TableHead>
              <TableHead>邮箱</TableHead>
              <TableHead>昵称</TableHead>
              <TableHead>授予时间</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(r => (
              <TableRow key={`${r.user_id}-${r.role}`}>
                <TableCell>
                  {r.role === "founder" ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">
                      <Crown className="h-3 w-3" />创始人
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] text-foreground/80">
                      <Shield className="h-3 w-3" />管理员
                    </span>
                  )}
                </TableCell>
                <TableCell className="font-medium">{r.email ?? "—"}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{r.display_name ?? "—"}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</TableCell>
                <TableCell className="text-right">
                  {r.role === "admin" ? (
                    <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={async () => {
                        if (!confirm(`确认移除管理员 ${r.email}?`)) return;
                        try { await remove({ data: { userId: r.user_id } }); toast.success("已移除"); load(); }
                        catch (e: any) { toast.error(e.message); }
                      }}>
                      <Trash2 className="mr-1 h-3.5 w-3.5" />移除
                    </Button>
                  ) : (
                    <span className="text-[10px] text-muted-foreground">不可移除</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow><TableCell colSpan={5} className="text-center text-xs text-muted-foreground">暂无数据</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
