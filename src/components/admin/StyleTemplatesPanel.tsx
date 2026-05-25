import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useServerFn } from "@tanstack/react-start";
import {
  adminListStyleTemplates,
  adminUpdateStyleTemplate,
  adminCreateStyleTemplate,
  adminDeleteStyleTemplate,
  adminGetSystemPrompt,
  adminSetSystemPrompt,
  adminGetContactInfo,
  adminSetContactInfo,
} from "@/lib/admin.functions";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { Save, Upload, RefreshCw, ImageIcon, FileText, Palette, Headphones, Plus, Trash2 } from "lucide-react";
import { thumbUrl } from "@/lib/image-url";

type Tpl = {
  id: string;
  name: string;
  prompt: string;
  image_url: string | null;
  sort_order: number;
};

export function StyleTemplatesPanel() {
  return (
    <div className="space-y-6">
      <ContactInfoCard />
      <SystemPromptCard />
      <TemplatesGrid />
    </div>
  );
}

function ContactInfoCard() {
  const getFn = useServerFn(adminGetContactInfo);
  const setFn = useServerFn(adminSetContactInfo);
  const [wechat, setWechat] = useState("");
  const [qq, setQq] = useState("");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const r: any = await getFn({});
      setWechat(r.wechat ?? "");
      setQq(r.qq ?? "");
      setUpdatedAt(r.updated_at ?? null);
    } catch (e: any) { toast.error(e.message); }
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    setBusy(true);
    try {
      await setFn({ data: { wechat, qq } });
      toast.success("已保存联系方式");
      load();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="rounded-lg border border-border/60 bg-white/[0.03] p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Headphones className="h-4 w-4 text-primary" />
        客服联系方式
      </div>
      <p className="text-xs text-muted-foreground">
        用户点击顶部「联系客服」时展示。留空则该项不显示。
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label className="text-[11px] text-muted-foreground">微信 (WX)</label>
          <Input value={wechat} onChange={(e) => setWechat(e.target.value)} placeholder="例如：shuntu_service" />
        </div>
        <div className="space-y-1">
          <label className="text-[11px] text-muted-foreground">QQ</label>
          <Input value={qq} onChange={(e) => setQq(e.target.value)} placeholder="例如：123456789" />
        </div>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground">
          {updatedAt ? `最后更新：${new Date(updatedAt).toLocaleString()}` : ""}
        </span>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />刷新
          </Button>
          <Button size="sm" onClick={save} disabled={busy}>
            <Save className="mr-1.5 h-3.5 w-3.5" />保存
          </Button>
        </div>
      </div>
    </div>
  );
}

function SystemPromptCard() {
  const getFn = useServerFn(adminGetSystemPrompt);
  const setFn = useServerFn(adminSetSystemPrompt);
  const [val, setVal] = useState("");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const r: any = await getFn({});
      setVal(r.system_prompt ?? "");
      setUpdatedAt(r.updated_at ?? null);
    } catch (e: any) { toast.error(e.message); }
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    setBusy(true);
    try {
      await setFn({ data: { system_prompt: val } });
      toast.success("已保存固定提示词");
      load();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="rounded-lg border border-border/60 bg-white/[0.03] p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <FileText className="h-4 w-4 text-primary" />
        后台固定提示词
      </div>
      <p className="text-xs text-muted-foreground">
        所有生成请求将自动在用户原始提示词后追加此内容。<strong>不会修改用户的提示词</strong>，仅在请求上游模型时拼接。可用于全局画质增强、负面词或安全约束。
      </p>
      <Textarea
        value={val}
        onChange={(e) => setVal(e.target.value)}
        rows={5}
        placeholder="例如：ultra high detail, 8k, professional studio photography, no watermark, no text"
        className="font-mono text-xs"
      />
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground">
          {updatedAt ? `最后更新：${new Date(updatedAt).toLocaleString()}` : ""}
        </span>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />刷新
          </Button>
          <Button size="sm" onClick={save} disabled={busy}>
            <Save className="mr-1.5 h-3.5 w-3.5" />保存
          </Button>
        </div>
      </div>
    </div>
  );
}

function TemplatesGrid() {
  const listFn = useServerFn(adminListStyleTemplates);
  const createFn = useServerFn(adminCreateStyleTemplate);
  const [items, setItems] = useState<Tpl[]>([]);
  const [loading, setLoading] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  const load = async () => {
    setLoading(true);
    try { setItems((await listFn({})) as Tpl[]); }
    catch (e: any) { toast.error(e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const create = async () => {
    const name = newName.trim();
    if (!name) return toast.error("请先填写模板名称");
    setCreating(true);
    try {
      await createFn({ data: { name } });
      toast.success(`已新增模板：${name}`);
      setNewName("");
      load();
    } catch (e: any) { toast.error(e.message); }
    finally { setCreating(false); }
  };

  return (
    <div className="rounded-lg border border-border/60 bg-white/[0.03] p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Palette className="h-4 w-4 text-primary" />
          风格模板管理
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" />刷新
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        每个模板可单独修改名称、示例图（9:16）和风格 Prompt。Prompt 仅控制视觉风格（灯光/背景/氛围/色调等），不要写比例或分辨率。
      </p>
      <div className="flex gap-2 rounded-lg border border-dashed border-primary/30 bg-primary/[0.04] p-3">
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="新模板名称，例如：赛博朋克"
          className="h-9"
          onKeyDown={(e) => { if (e.key === "Enter") create(); }}
        />
        <Button size="sm" onClick={create} disabled={creating}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          {creating ? "新增中…" : "新增模板"}
        </Button>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((t) => (
          <TemplateCard key={t.id} tpl={t} onSaved={load} />
        ))}
      </div>
    </div>
  );
}

function TemplateCard({ tpl, onSaved }: { tpl: Tpl; onSaved: () => void }) {
  const updateFn = useServerFn(adminUpdateStyleTemplate);
  const deleteFn = useServerFn(adminDeleteStyleTemplate);
  const { session } = useAuth();
  const [name, setName] = useState(tpl.name ?? "");
  const [imageUrl, setImageUrl] = useState(tpl.image_url ?? "");
  const [prompt, setPrompt] = useState(tpl.prompt ?? "");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const dirty =
    name !== (tpl.name ?? "") ||
    (imageUrl || "") !== (tpl.image_url ?? "") ||
    prompt !== (tpl.prompt ?? "");

  const save = async () => {
    if (!name.trim()) return toast.error("模板名称不能为空");
    setBusy(true);
    try {
      await updateFn({ data: { id: tpl.id, name: name.trim(), image_url: imageUrl || null, prompt } });
      toast.success(`已保存：${name}`);
      onSaved();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  };

  const remove = async () => {
    if (!confirm(`确定删除模板「${tpl.name}」？此操作不可恢复。`)) return;
    setDeleting(true);
    try {
      await deleteFn({ data: { id: tpl.id } });
      toast.success(`已删除：${tpl.name}`);
      onSaved();
    } catch (e: any) { toast.error(e.message); }
    finally { setDeleting(false); }
  };

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const uid = session?.user?.id;
    if (!uid) return toast.error("请先登录");
    if (!/^image\//i.test(f.type)) return toast.error("仅支持图片文件");
    if (f.size > 5 * 1024 * 1024) return toast.error("图片大小请小于 5MB");
    setUploading(true);
    try {
      const ext = (f.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
      const path = `style-templates/${tpl.id}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage
        .from("admin-assets")
        .upload(path, f, { cacheControl: "3600", contentType: f.type, upsert: true });
      if (error) throw error;
      const { data: pub } = supabase.storage.from("admin-assets").getPublicUrl(path);
      setImageUrl(pub.publicUrl);
      toast.success("图片已上传，记得点保存");
    } catch (err: any) {
      toast.error(err.message ?? "上传失败");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-white/[0.02] p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="模板名称"
          className="h-8 text-sm font-medium"
        />
        <span className="font-mono text-[10px] text-muted-foreground shrink-0">{tpl.id.slice(0, 12)}</span>
      </div>

      <div className="flex gap-3">
        <div className="relative aspect-[9/16] w-[90px] shrink-0 overflow-hidden rounded-lg border border-border bg-black/30">
          {imageUrl ? (
            <img src={thumbUrl(imageUrl, { quality: 65 })} alt={tpl.name} loading="lazy" decoding="async" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-muted-foreground">
              <ImageIcon className="h-5 w-5" strokeWidth={1.5} />
            </div>
          )}
        </div>

        <div className="flex-1 space-y-2">
          <Input
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="图片 URL"
            className="h-8 font-mono text-[11px]"
          />
          <input type="file" accept="image/*" ref={fileRef} className="hidden" onChange={onPickFile} />
          <Button
            variant="outline" size="sm" disabled={uploading}
            onClick={() => fileRef.current?.click()}
            className="w-full"
          >
            <Upload className="mr-1.5 h-3.5 w-3.5" />
            {uploading ? "上传中…" : "上传 9:16 图片"}
          </Button>
        </div>
      </div>

      <Textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={3}
        placeholder="风格 Prompt（仅视觉风格）"
        className="font-mono text-[11px]"
      />

      <div className="flex gap-2">
        <Button size="sm" className="flex-1" onClick={save} disabled={busy || !dirty}>
          <Save className="mr-1.5 h-3.5 w-3.5" />保存
        </Button>
        <Button size="sm" variant="outline" onClick={remove} disabled={deleting}
          className="text-destructive hover:bg-destructive/10 hover:text-destructive">
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
