import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { listModelsConfig, adminUpdateModelPrice } from "@/lib/admin.functions";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Pencil, RefreshCw, Sparkles } from "lucide-react";
import { toast } from "sonner";

type ModelCfg = {
  id: string; model_key: string; name: string; description: string | null;
  cost: number; updated_at: string;
};

export function ModelsPanel() {
  const list = useServerFn(listModelsConfig);
  const update = useServerFn(adminUpdateModelPrice);
  const [rows, setRows] = useState<ModelCfg[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<ModelCfg | null>(null);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try { setRows(((await list({})) ?? []) as ModelCfg[]); }
    catch (e: any) { toast.error(e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const openEdit = (r: ModelCfg) => { setEditing(r); setValue(String(r.cost)); };

  const save = async () => {
    if (!editing) return;
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) return toast.error("请输入有效的点数");
    setBusy(true);
    try {
      await update({ data: { id: editing.id, cost: n } });
      toast.success("模型费率更新成功");
      setEditing(null);
      load();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">控制每个模型单次生成消耗的算力点数</p>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" />刷新
        </Button>
      </div>
      <div className="max-h-[55vh] overflow-auto rounded-lg border border-border/60">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>模型名称</TableHead>
              <TableHead>Key</TableHead>
              <TableHead className="text-right">当前扣点费率</TableHead>
              <TableHead>最后修改时间</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(r => (
              <TableRow key={r.id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-md bg-white/5 text-primary">
                      <Sparkles className="h-3.5 w-3.5" />
                    </div>
                    <div>
                      <div className="text-sm font-medium">{r.name}</div>
                      {r.description && <div className="text-[10px] text-muted-foreground">{r.description}</div>}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="font-mono text-[11px] text-muted-foreground">{r.model_key}</TableCell>
                <TableCell className="text-right font-mono tabular-nums text-primary">{Number(r.cost)} 点</TableCell>
                <TableCell className="text-xs text-muted-foreground">{new Date(r.updated_at).toLocaleString()}</TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="sm" onClick={() => openEdit(r)}>
                    <Pencil className="mr-1 h-3.5 w-3.5" />修改
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && !loading && (
              <TableRow><TableCell colSpan={5} className="text-center text-xs text-muted-foreground">暂无模型</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent className="max-w-sm border-border/70 bg-card/80 backdrop-blur-2xl">
          <DialogHeader><DialogTitle>修改费率 · {editing?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <label className="text-[11px] text-muted-foreground">单次出图消耗点数</label>
            <Input
              type="number" min={0} step="0.1"
              value={value} onChange={(e) => setValue(e.target.value)}
              placeholder="例如 2"
            />
            <Button className="w-full" onClick={save} disabled={busy}>保存</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
