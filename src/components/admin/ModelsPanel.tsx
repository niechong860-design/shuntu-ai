import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  listModelsConfig,
  adminUpdateModel,
  adminCreateModel,
  adminDeleteModel,
} from "@/lib/admin.functions";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Pencil, RefreshCw, Sparkles, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

type ModelCfg = {
  id: string; model_key: string; name: string; description: string | null;
  cost: number; sort_order?: number; updated_at: string;
};

type EditState = {
  id: string;
  name: string;
  model_key: string;
  description: string;
  cost: string;
};

const empty = (): EditState => ({ id: "", name: "", model_key: "", description: "", cost: "1" });

export function ModelsPanel() {
  const list = useServerFn(listModelsConfig);
  const update = useServerFn(adminUpdateModel);
  const create = useServerFn(adminCreateModel);
  const del = useServerFn(adminDeleteModel);
  const [rows, setRows] = useState<ModelCfg[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<EditState | null>(null);
  const [creating, setCreating] = useState<EditState | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try { setRows(((await list({})) ?? []) as ModelCfg[]); }
    catch (e: any) { toast.error(e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const openEdit = (r: ModelCfg) => setEditing({
    id: r.id, name: r.name, model_key: r.model_key,
    description: r.description ?? "", cost: String(r.cost),
  });

  const save = async () => {
    if (!editing) return;
    const n = Number(editing.cost);
    if (!editing.name.trim() || !editing.model_key.trim()) return toast.error("名称和 Key 不能为空");
    if (!Number.isFinite(n) || n < 0) return toast.error("请输入有效的点数");
    setBusy(true);
    try {
      await update({ data: {
        id: editing.id,
        name: editing.name.trim(),
        model_key: editing.model_key.trim(),
        description: editing.description.trim() || null,
        cost: n,
      }});
      toast.success("模型已更新");
      setEditing(null);
      load();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  };

  const submitCreate = async () => {
    if (!creating) return;
    const n = Number(creating.cost);
    if (!creating.name.trim() || !creating.model_key.trim()) return toast.error("名称和 Key 不能为空");
    if (!Number.isFinite(n) || n < 0) return toast.error("请输入有效的点数");
    setBusy(true);
    try {
      await create({ data: {
        name: creating.name.trim(),
        model_key: creating.model_key.trim(),
        description: creating.description.trim() || undefined,
        cost: n,
      }});
      toast.success("模型添加成功");
      setCreating(null);
      load();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  };

  const handleDelete = async (r: ModelCfg) => {
    setRows(prev => prev.filter(x => x.id !== r.id));
    try {
      await del({ data: { id: r.id } });
      toast.success("模型已删除");
    } catch (e: any) { toast.error(e.message); load(); }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">控制每个模型单次生成消耗的算力点数</p>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => setCreating(empty())} className="bg-gradient-aurora text-primary-foreground">
            <Plus className="mr-1.5 h-3.5 w-3.5" />添加模型
          </Button>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />刷新
          </Button>
        </div>
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
                  <div className="flex items-center justify-end gap-1">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(r)}>
                      <Pencil className="mr-1 h-3.5 w-3.5" />修改
                    </Button>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10 hover:text-destructive">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent align="end" className="w-64 border-border/70 bg-card/90 backdrop-blur-xl">
                        <p className="text-xs text-foreground">确定要删除该模型吗？</p>
                        <p className="mt-1 text-[11px] text-muted-foreground">删除后用户将无法选择该模型生成图片。</p>
                        <div className="mt-3 flex justify-end">
                          <Button size="sm" variant="destructive" onClick={() => handleDelete(r)}>确认删除</Button>
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && !loading && (
              <TableRow><TableCell colSpan={5} className="text-center text-xs text-muted-foreground">暂无模型</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <ModelFormDialog
        title={editing ? `修改模型 · ${editing.name}` : ""}
        state={editing} setState={setEditing} onSubmit={save} busy={busy}
      />
      <ModelFormDialog
        title="添加新模型"
        state={creating} setState={setCreating} onSubmit={submitCreate} busy={busy}
      />
    </div>
  );
}

function ModelFormDialog({
  title, state, setState, onSubmit, busy,
}: {
  title: string;
  state: EditState | null;
  setState: (s: EditState | null) => void;
  onSubmit: () => void;
  busy: boolean;
}) {
  return (
    <Dialog open={!!state} onOpenChange={(v) => !v && setState(null)}>
      <DialogContent className="max-w-sm border-border/70 bg-card/80 backdrop-blur-2xl">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        {state && (
          <div className="space-y-3 pt-2">
            <div className="space-y-1">
              <label className="text-[11px] text-muted-foreground">模型显示名称</label>
              <Input value={state.name} onChange={(e) => setState({ ...state, name: e.target.value })} placeholder="例如 GPT-Image-2" />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] text-muted-foreground">Model Key（英文/数字/_-.）</label>
              <Input value={state.model_key} onChange={(e) => setState({ ...state, model_key: e.target.value })} placeholder="例如 gpt-image-2" />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] text-muted-foreground">描述（选填）</label>
              <Input value={state.description} onChange={(e) => setState({ ...state, description: e.target.value })} placeholder="例如 OpenAI · 新一代图像生成" />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] text-muted-foreground">单次出图消耗点数</label>
              <Input type="number" min={0} step="0.1" value={state.cost} onChange={(e) => setState({ ...state, cost: e.target.value })} placeholder="例如 2" />
            </div>
            <Button className="w-full" onClick={onSubmit} disabled={busy}>保存</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
