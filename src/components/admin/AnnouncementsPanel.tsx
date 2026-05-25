import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  adminListAnnouncements,
  adminUpsertAnnouncement,
  adminDeleteAnnouncement,
} from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, RefreshCw, Trash2, Pencil, Pin, Megaphone, Sparkles, AlertTriangle, CheckCircle2, Upload, X as XIcon, Loader2 } from "lucide-react";
import { toast } from "sonner";

type Announcement = {
  id: string;
  title: string;
  content: string;
  type: "info" | "success" | "warning" | "promo";
  image_url: string | null;
  link_url: string | null;
  link_label: string | null;
  is_pinned: boolean;
  is_published: boolean;
  created_at: string;
};

const TYPE_OPTIONS: { value: Announcement["type"]; label: string; icon: typeof Megaphone; color: string }[] = [
  { value: "info", label: "公告", icon: Megaphone, color: "text-primary" },
  { value: "success", label: "新功能", icon: CheckCircle2, color: "text-emerald-300" },
  { value: "warning", label: "提醒", icon: AlertTriangle, color: "text-amber-300" },
  { value: "promo", label: "活动", icon: Sparkles, color: "text-fuchsia-300" },
];

export function AnnouncementsPanel() {
  const list = useServerFn(adminListAnnouncements);
  const upsert = useServerFn(adminUpsertAnnouncement);
  const del = useServerFn(adminDeleteAnnouncement);
  const [items, setItems] = useState<Announcement[]>([]);
  const [editing, setEditing] = useState<Partial<Announcement> | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (file: File) => {
    if (!file.type.startsWith("image/")) return toast.error("请选择图片文件");
    if (file.size > 10 * 1024 * 1024) return toast.error("图片需小于 10MB");
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "png";
      const path = `announcements/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await supabase.storage.from("admin-assets").upload(path, file, {
        cacheControl: "3600",
        upsert: false,
      });
      if (error) throw error;
      const { data } = supabase.storage.from("admin-assets").getPublicUrl(path);
      setEditing((prev) => (prev ? { ...prev, image_url: data.publicUrl } : prev));
      toast.success("图片已上传");
    } catch (e: any) {
      toast.error(e.message || "上传失败");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const load = async () => {
    try {
      setItems((await list({})) as Announcement[]);
    } catch (e: any) {
      toast.error(e.message);
    }
  };
  useEffect(() => {
    load();
  }, []);

  const save = async (a: Partial<Announcement>) => {
    if (!a.title?.trim()) return toast.error("请填写通知标题");
    try {
      await upsert({
        data: {
          id: a.id,
          title: a.title.trim(),
          content: (a.content ?? "").trim(),
          type: (a.type ?? "info") as Announcement["type"],
          image_url: a.image_url?.trim() || null,
          link_url: a.link_url?.trim() || null,
          link_label: a.link_label?.trim() || null,
          is_pinned: a.is_pinned ?? false,
          is_published: a.is_published ?? true,
        },
      });
      toast.success("已保存");
      setEditing(null);
      load();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const togglePublished = async (a: Announcement) => {
    try {
      await upsert({
        data: {
          id: a.id,
          title: a.title,
          content: a.content,
          type: a.type,
          image_url: a.image_url,
          link_url: a.link_url,
          link_label: a.link_label,
          is_pinned: a.is_pinned,
          is_published: !a.is_published,
        },
      });
      load();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          共 {items.length} 条 · 启用 {items.filter((a) => a.is_published).length} 条 · 置顶{" "}
          {items.filter((a) => a.is_pinned).length} 条 · 用户登录后会自动弹出最新一条
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            刷新
          </Button>
          <Button
            size="sm"
            className="bg-gradient-aurora text-primary-foreground"
            onClick={() =>
              setEditing({
                title: "",
                content: "",
                type: "info",
                image_url: "",
                link_url: "",
                link_label: "",
                is_pinned: false,
                is_published: true,
              })
            }
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            新建通知
          </Button>
        </div>
      </div>

      <div className="max-h-[55vh] overflow-auto rounded-lg border border-border/60">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>类型</TableHead>
              <TableHead>标题</TableHead>
              <TableHead>置顶</TableHead>
              <TableHead>启用</TableHead>
              <TableHead>创建时间</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((a) => {
              const meta = TYPE_OPTIONS.find((t) => t.value === a.type) ?? TYPE_OPTIONS[0];
              const Icon = meta.icon;
              return (
                <TableRow key={a.id}>
                  <TableCell>
                    <span className={`inline-flex items-center gap-1 text-xs ${meta.color}`}>
                      <Icon className="h-3 w-3" />
                      {meta.label}
                    </span>
                  </TableCell>
                  <TableCell className="font-medium">{a.title}</TableCell>
                  <TableCell>
                    {a.is_pinned ? (
                      <Pin className="h-3.5 w-3.5 text-primary" fill="currentColor" />
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Switch checked={a.is_published} onCheckedChange={() => togglePublished(a)} />
                  </TableCell>
                  <TableCell className="font-mono text-[10px] text-muted-foreground">
                    {new Date(a.created_at).toLocaleString("zh-CN")}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => setEditing(a)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={async () => {
                        if (!confirm(`确认删除通知“${a.title}”?`)) return;
                        try {
                          await del({ data: { id: a.id } });
                          toast.success("已删除");
                          load();
                        } catch (e: any) {
                          toast.error(e.message);
                        }
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
            {items.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-xs text-muted-foreground">
                  暂无通知，点击右上"新建通知"添加
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent className="max-w-lg border-border/70 bg-card/80 backdrop-blur-2xl">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "编辑通知" : "新建通知"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3 pt-2">
              <div className="space-y-1">
                <label className="text-[11px] text-muted-foreground">类型</label>
                <div className="flex flex-wrap gap-1.5">
                  {TYPE_OPTIONS.map((t) => {
                    const Icon = t.icon;
                    const active = (editing.type ?? "info") === t.value;
                    return (
                      <button
                        key={t.value}
                        type="button"
                        onClick={() => setEditing({ ...editing, type: t.value })}
                        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] transition-colors ${
                          active
                            ? "border-primary/50 bg-primary/15 text-foreground"
                            : "border-border bg-white/[0.03] text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        <Icon className={`h-3 w-3 ${t.color}`} />
                        {t.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] text-muted-foreground">标题 *</label>
                <Input
                  value={editing.title ?? ""}
                  onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                  placeholder="例如：Grok Imagine 已上线，限时 5 折体验"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] text-muted-foreground">正文内容（支持换行）</label>
                <Textarea
                  rows={5}
                  value={editing.content ?? ""}
                  onChange={(e) => setEditing({ ...editing, content: e.target.value })}
                  placeholder="详细介绍这条通知，会显示在弹窗主体..."
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] text-muted-foreground">封面图（可选，建议 16:9 或 4:3，&lt;10MB）</label>
                {editing.image_url ? (
                  <div className="relative overflow-hidden rounded-lg border border-border/60">
                    <img src={editing.image_url} alt="封面预览" className="max-h-56 w-full object-contain bg-black/30" />
                    <button
                      type="button"
                      onClick={() => setEditing({ ...editing, image_url: "" })}
                      className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
                      aria-label="移除图片"
                    >
                      <XIcon className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="flex h-28 w-full flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-border/70 bg-white/[0.02] text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/[0.04] hover:text-foreground disabled:opacity-50"
                  >
                    {uploading ? (
                      <>
                        <Loader2 className="h-5 w-5 animate-spin" />
                        上传中...
                      </>
                    ) : (
                      <>
                        <Upload className="h-5 w-5" />
                        点击上传封面图
                      </>
                    )}
                  </button>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])}
                />
                <Input
                  value={editing.image_url ?? ""}
                  onChange={(e) => setEditing({ ...editing, image_url: e.target.value })}
                  placeholder="或粘贴图片 URL: https://..."
                  className="text-[11px]"
                />
              </div>

              <div className="flex gap-2">
                <div className="flex-[2] space-y-1">
                  <label className="text-[11px] text-muted-foreground">行动链接（可选）</label>
                  <Input
                    value={editing.link_url ?? ""}
                    onChange={(e) => setEditing({ ...editing, link_url: e.target.value })}
                    placeholder="https://..."
                  />
                </div>
                <div className="flex-1 space-y-1">
                  <label className="text-[11px] text-muted-foreground">按钮文案</label>
                  <Input
                    value={editing.link_label ?? ""}
                    onChange={(e) => setEditing({ ...editing, link_label: e.target.value })}
                    placeholder="立即体验"
                  />
                </div>
              </div>

              <div className="flex gap-4 pt-1">
                <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <Switch
                    checked={editing.is_pinned ?? false}
                    onCheckedChange={(v) => setEditing({ ...editing, is_pinned: v })}
                  />
                  置顶
                </label>
                <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <Switch
                    checked={editing.is_published ?? true}
                    onCheckedChange={(v) => setEditing({ ...editing, is_published: v })}
                  />
                  立即发布
                </label>
              </div>

              <Button className="w-full bg-gradient-aurora text-primary-foreground" onClick={() => save(editing)}>
                保存并发布
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
