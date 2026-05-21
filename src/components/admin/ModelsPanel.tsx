import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  adminListModelsConfig,
  adminUpdateModel,
  adminCreateModel,
  adminDeleteModel,
  adminGetGlobalConfig,
  adminUpdateGlobalConfig,
} from "@/lib/admin.functions";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Pencil, RefreshCw, Sparkles, Plus, Trash2, KeyRound, Link as LinkIcon, Globe, Save } from "lucide-react";
import { toast } from "sonner";

type ModelCfg = {
  id: string; model_key: string; name: string; description: string | null;
  cost: number; api_url: string | null; api_key: string | null;
  request_format: "async_id" | "sync_url" | null;
  prompt_key: string | null;
  fetch_url: string | null;
  sort_order?: number; updated_at: string;
};

type EditState = {
  id: string;
  name: string;
  model_key: string;
  description: string;
  cost: string;
  api_url: string;
  api_key: string;
  request_format: "async_id" | "sync_url";
  prompt_key: string;
  fetch_url: string;
};

const empty = (): EditState => ({
  id: "", name: "", model_key: "", description: "", cost: "1",
  api_url: "", api_key: "", request_format: "async_id", prompt_key: "prompt", fetch_url: "",
});

const maskKey = (k: string | null) => {
  if (!k) return "";
  if (k.length <= 8) return "•".repeat(k.length);
  return `${k.slice(0, 4)}••••${k.slice(-4)}`;
};

export function ModelsPanel() {
  const list = useServerFn(adminListModelsConfig);
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
    api_url: r.api_url ?? "", api_key: r.api_key ?? "",
    request_format: (r.request_format ?? "async_id") as "async_id" | "sync_url",
    prompt_key: r.prompt_key ?? "prompt",
    fetch_url: r.fetch_url ?? "",
  });

  const save = async () => {
    if (!editing) return;
    const n = Number(editing.cost);
    if (!editing.name.trim() || !editing.model_key.trim()) return toast.error("名称和 Key 不能为空");
    if (!Number.isFinite(n) || n < 0) return toast.error("请输入有效的点数");
    if (editing.api_url && !/^https?:\/\//i.test(editing.api_url)) return toast.error("API 接口地址必须是 http(s) URL");
    setBusy(true);
    try {
      await update({ data: {
        id: editing.id,
        name: editing.name.trim(),
        model_key: editing.model_key.trim(),
        description: editing.description.trim() || null,
        cost: n,
        api_url: editing.api_url.trim() || null,
        api_key: editing.api_key.trim() || null,
        request_format: editing.request_format,
        prompt_key: editing.prompt_key.trim() || "prompt",
        fetch_url: editing.fetch_url.trim() || null,
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
    if (creating.api_url && !/^https?:\/\//i.test(creating.api_url)) return toast.error("API 接口地址必须是 http(s) URL");
    setBusy(true);
    try {
      await create({ data: {
        name: creating.name.trim(),
        model_key: creating.model_key.trim(),
        description: creating.description.trim() || undefined,
        cost: n,
        api_url: creating.api_url.trim() || undefined,
        api_key: creating.api_key.trim() || undefined,
        request_format: creating.request_format,
        prompt_key: creating.prompt_key.trim() || "prompt",
        fetch_url: creating.fetch_url.trim() || undefined,
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
      <GlobalConfigCard />
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">每个模型可配置独立的 API 接口地址、密钥与扣点费率（留空则使用全局 API Key）</p>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => setCreating(empty())} className="bg-gradient-aurora text-primary-foreground">
            <Plus className="mr-1.5 h-3.5 w-3.5" />添加模型
          </Button>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />刷新
          </Button>
        </div>
      </div>
      <div className="max-h-[60vh] overflow-auto rounded-lg border border-border/60">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>模型</TableHead>
              <TableHead>Key</TableHead>
              <TableHead>模式</TableHead>
              <TableHead>API 接口地址</TableHead>
              <TableHead>API Key</TableHead>
              <TableHead className="text-right">费率</TableHead>
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
                <TableCell>
                  <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium ${
                    r.request_format === "sync_url"
                      ? "bg-emerald-500/10 text-emerald-400"
                      : "bg-primary/10 text-primary"
                  }`}>
                    {r.request_format === "sync_url" ? "同步直出" : "异步轮询"}
                  </span>
                </TableCell>
                <TableCell className="max-w-[240px] truncate font-mono text-[11px] text-muted-foreground" title={r.api_url ?? ""}>
                  {r.api_url ? (
                    <span className="inline-flex items-center gap-1"><LinkIcon className="h-3 w-3 text-primary/80" />{r.api_url}</span>
                  ) : <span className="text-destructive/80">未配置</span>}
                </TableCell>
                <TableCell className="font-mono text-[11px] text-muted-foreground">
                  {r.api_key ? (
                    <span className="inline-flex items-center gap-1"><KeyRound className="h-3 w-3 text-primary/80" />{maskKey(r.api_key)}</span>
                  ) : <span className="text-muted-foreground/60">—</span>}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums text-primary">{Number(r.cost)} 点</TableCell>
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
              <TableRow><TableCell colSpan={7} className="text-center text-xs text-muted-foreground">暂无模型</TableCell></TableRow>
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
      <DialogContent className="max-w-md border-border/70 bg-card/80 backdrop-blur-2xl">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        {state && (
          <div className="space-y-3 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[11px] text-muted-foreground">显示名称</label>
                <Input value={state.name} onChange={(e) => setState({ ...state, name: e.target.value })} placeholder="GPT-Image-2" />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] text-muted-foreground">Model Key</label>
                <Input value={state.model_key} onChange={(e) => setState({ ...state, model_key: e.target.value })} placeholder="gpt-image-2" />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-[11px] text-muted-foreground">描述（选填）</label>
              <Input value={state.description} onChange={(e) => setState({ ...state, description: e.target.value })} placeholder="OpenAI · 新一代图像生成" />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] text-muted-foreground inline-flex items-center gap-1"><LinkIcon className="h-3 w-3" />API 接口地址（该模型专属）</label>
              <Input value={state.api_url} onChange={(e) => setState({ ...state, api_url: e.target.value })} placeholder="https://api.example.com/v1/images/generations" />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] text-muted-foreground inline-flex items-center gap-1"><KeyRound className="h-3 w-3" />API Key（Bearer Token）</label>
              <Input value={state.api_key} onChange={(e) => setState({ ...state, api_key: e.target.value })} placeholder="sk-..." />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] text-muted-foreground">单次出图消耗点数</label>
              <Input type="number" min={0} step="0.1" value={state.cost} onChange={(e) => setState({ ...state, cost: e.target.value })} placeholder="2" />
            </div>

            <div className="border-t border-border/40 pt-3">
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">动态接口适配</div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] text-muted-foreground">返回格式</label>
                  <select
                    value={state.request_format}
                    onChange={(e) => setState({ ...state, request_format: e.target.value as "async_id" | "sync_url" })}
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs"
                  >
                    <option value="async_id">异步轮询（返回任务ID）</option>
                    <option value="sync_url">同步直出（直接返回URL）</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] text-muted-foreground">提示词参数名</label>
                  <Input value={state.prompt_key} onChange={(e) => setState({ ...state, prompt_key: e.target.value })} placeholder="prompt" />
                </div>
              </div>
              {state.request_format === "async_id" && (
                <div className="mt-3 space-y-1">
                  <label className="text-[11px] text-muted-foreground">查询结果接口（选填，留空将自动派生 /fetch_result）</label>
                  <Input value={state.fetch_url} onChange={(e) => setState({ ...state, fetch_url: e.target.value })} placeholder="https://api.example.com/api/async/fetch_result" />
                </div>
              )}
            </div>

            <Button className="w-full" onClick={onSubmit} disabled={busy}>保存</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
