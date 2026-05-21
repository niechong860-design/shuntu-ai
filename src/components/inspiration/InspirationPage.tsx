import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import {
  Heart, Bookmark, Eye, Search, Sparkles, X, Copy, Wand2,
  MessageSquare, Send, Plus, Upload, Image as ImageIcon, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  listCases, listCaseFacets, getCaseDetail, incrementCaseView,
  toggleCaseLike, toggleCaseFavorite, addCaseComment, publishCase,
  type CaseRow,
} from "@/lib/inspiration.functions";
import { listStyleTemplates, listModelsConfig } from "@/lib/admin.functions";
import { setStudioPrefill } from "@/lib/studio-prefill";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";

type StyleTpl = { id: string; name: string; image_url: string | null };
type CaseItem = CaseRow;

export function InspirationPage() {
  const { session } = useAuth();
  const fetchList = useServerFn(listCases);
  const fetchFacets = useServerFn(listCaseFacets);
  const fetchStyles = useServerFn(listStyleTemplates);

  const fetchModels = useServerFn(listModelsConfig);

  const [items, setItems] = useState<CaseItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [searchDraft, setSearchDraft] = useState("");
  const [styleId, setStyleId] = useState("");
  const [tag, setTag] = useState("");
  const [modelKey, setModelKey] = useState("");
  const [sort, setSort] = useState<"latest" | "hot" | "views">("latest");
  const [styles, setStyles] = useState<StyleTpl[]>([]);
  const [allModels, setAllModels] = useState<{ key: string; name: string }[]>([]);
  const [facets, setFacets] = useState<{ hotTags: { name: string; count: number }[]; models: { key: string; name: string }[] }>({ hotTags: [], models: [] });
  const [openId, setOpenId] = useState<string | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);

  useEffect(() => {
    if (!session) return;
    fetchStyles({}).then((d) => setStyles((d ?? []) as StyleTpl[])).catch(() => {});
    fetchFacets({}).then((d) => setFacets(d as any)).catch(() => {});
    fetchModels({}).then((d) => {
      const list = (d ?? []) as { model_key: string; name: string }[];
      setAllModels(list.map((m) => ({ key: m.model_key, name: m.name })));
    }).catch(() => {});
  }, [session]);

  useEffect(() => {
    if (!session) return;
    setLoading(true);
    fetchList({
      data: {
        search: search || undefined,
        styleId: styleId || undefined,
        tag: tag || undefined,
        modelKey: modelKey || undefined,
        sort,
        limit: 40,
      },
    })
      .then((d) => setItems((d ?? []) as CaseItem[]))
      .catch((e) => toast.error(e?.message ?? "加载失败"))
      .finally(() => setLoading(false));
  }, [session, search, styleId, tag, modelKey, sort]);

  const updateItem = (id: string, patch: Partial<CaseItem>) =>
    setItems((arr) => arr.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Top filter bar */}
      <div className="sticky top-14 z-30 border-b border-border/60 bg-background/85 backdrop-blur-2xl">
        <div className="mx-auto max-w-[1600px] px-5 py-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <h1 className="font-display text-lg font-semibold tracking-tight">灵感广场</h1>
              <span className="rounded-full bg-white/[0.04] px-2 py-0.5 text-[10px] text-muted-foreground">
                {items.length} 个案例
              </span>
            </div>

            <div className="relative ml-auto flex-1 max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={searchDraft}
                onChange={(e) => setSearchDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") setSearch(searchDraft.trim()); }}
                placeholder="搜索 prompt、标题…"
                className="w-full rounded-xl border border-border bg-input/40 py-2 pl-9 pr-3 text-sm focus:border-primary/50 focus:outline-none focus:shadow-glow"
              />
            </div>

            <div className="flex items-center gap-1 rounded-xl border border-border bg-white/[0.03] p-1">
              {([
                ["latest", "最新"],
                ["hot", "最热"],
                ["views", "最多浏览"],
              ] as const).map(([k, label]) => (
                <button
                  key={k}
                  onClick={() => setSort(k)}
                  className={`rounded-lg px-3 py-1.5 text-[11px] font-medium transition-colors ${
                    sort === k ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <button
              onClick={() => setPublishOpen(true)}
              className="flex items-center gap-1.5 rounded-xl bg-gradient-aurora px-3 py-2 text-xs font-semibold text-primary-foreground shadow-glow transition-transform hover:scale-[1.03]"
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={3} /> 发布案例
            </button>
          </div>

          {/* Style chips */}
          <ChipRow
            label="风格"
            items={[{ id: "", name: "全部" }, ...styles.map((s) => ({ id: s.id, name: s.name }))]}
            value={styleId}
            onChange={setStyleId}
          />
          {/* Model chips */}
          {facets.models.length > 0 && (
            <ChipRow
              label="模型"
              items={[{ id: "", name: "全部" }, ...facets.models.map((m) => ({ id: m.key, name: m.name }))]}
              value={modelKey}
              onChange={setModelKey}
            />
          )}
          {/* Tag chips */}
          {facets.hotTags.length > 0 && (
            <ChipRow
              label="热门标签"
              items={[{ id: "", name: "全部" }, ...facets.hotTags.map((t) => ({ id: t.name, name: `#${t.name}` }))]}
              value={tag}
              onChange={setTag}
            />
          )}
        </div>
      </div>

      {/* Masonry */}
      <div className="mx-auto max-w-[1600px] px-5 py-6">
        {loading && items.length === 0 ? (
          <div className="grid place-items-center py-24 text-sm text-muted-foreground">加载中…</div>
        ) : items.length === 0 ? (
          <div className="grid place-items-center py-24 text-sm text-muted-foreground">
            还没有案例，第一个分享你的灵感吧 ✨
          </div>
        ) : (
          <div className="[column-fill:_balance] columns-2 gap-4 sm:columns-3 lg:columns-4 xl:columns-5">
            {items.map((c) => (
              <CaseCard key={c.id} item={c} onOpen={() => setOpenId(c.id)} />
            ))}
          </div>
        )}
      </div>

      <CaseDetailDialog
        caseId={openId}
        onClose={() => setOpenId(null)}
        onMutate={updateItem}
      />
      <PublishDialog
        open={publishOpen}
        onOpenChange={setPublishOpen}
        styles={styles}
        models={facets.models}
        onPublished={() => {
          // refresh
          setSearch((v) => v);
          fetchList({ data: { sort, limit: 40 } }).then((d) => setItems((d ?? []) as CaseItem[])).catch(() => {});
        }}
      />
    </div>
  );
}

function ChipRow({
  label, items, value, onChange,
}: {
  label: string;
  items: { id: string; name: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="mt-3 flex items-center gap-2 overflow-x-auto pb-1 scrollbar-light">
      <span className="shrink-0 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </span>
      {items.map((it) => {
        const active = value === it.id;
        return (
          <button
            key={it.id || "__all"}
            onClick={() => onChange(it.id)}
            className={`shrink-0 rounded-full border px-3 py-1 text-[11px] font-medium transition-all ${
              active
                ? "border-primary/60 bg-primary/15 text-primary shadow-glow"
                : "border-border bg-white/[0.02] text-muted-foreground hover:border-primary/40 hover:text-foreground"
            }`}
          >
            {it.name}
          </button>
        );
      })}
    </div>
  );
}

function CaseCard({ item, onOpen }: { item: CaseItem; onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      className="group mb-4 block w-full overflow-hidden rounded-2xl border border-border bg-card/50 text-left transition-all hover:border-primary/50 hover:shadow-glow"
    >
      <div className="relative">
        <img
          src={item.image_url}
          alt={item.title || "case"}
          loading="lazy"
          className="block w-full transition-transform duration-500 group-hover:scale-[1.03]"
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
      </div>
      <div className="space-y-2 p-3">
        {item.title && (
          <div className="line-clamp-1 text-sm font-medium">{item.title}</div>
        )}
        <div className="flex flex-wrap gap-1">
          {item.style_id && (
            <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">{item.style_id}</span>
          )}
          {item.model_name && (
            <span className="rounded bg-white/[0.05] px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {item.model_name}
            </span>
          )}
          {(item.tags ?? []).slice(0, 2).map((t) => (
            <span key={t} className="rounded bg-white/[0.04] px-1.5 py-0.5 text-[10px] text-muted-foreground">
              #{t}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1"><Heart className={`h-3 w-3 ${item.liked ? "fill-primary text-primary" : ""}`} />{item.likes_count}</span>
          <span className="flex items-center gap-1"><Bookmark className={`h-3 w-3 ${item.favorited ? "fill-primary text-primary" : ""}`} />{item.favorites_count}</span>
          <span className="flex items-center gap-1"><Eye className="h-3 w-3" />{item.views}</span>
        </div>
      </div>
    </button>
  );
}

function CaseDetailDialog({
  caseId, onClose, onMutate,
}: {
  caseId: string | null;
  onClose: () => void;
  onMutate: (id: string, patch: Partial<CaseItem>) => void;
}) {
  const navigate = useNavigate();
  const getDetail = useServerFn(getCaseDetail);
  const incView = useServerFn(incrementCaseView);
  const toggleLike = useServerFn(toggleCaseLike);
  const toggleFav = useServerFn(toggleCaseFavorite);
  const addComment = useServerFn(addCaseComment);
  const [detail, setDetail] = useState<any | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!caseId) { setDetail(null); return; }
    getDetail({ data: { caseId } })
      .then((d) => setDetail(d))
      .catch((e) => toast.error(e?.message ?? "加载失败"));
    incView({ data: { caseId } }).catch(() => {});
  }, [caseId]);

  const handleLike = async () => {
    if (!caseId || !detail) return;
    const optimistic = !detail.liked;
    setDetail({ ...detail, liked: optimistic, likes_count: detail.likes_count + (optimistic ? 1 : -1) });
    try {
      const r = await toggleLike({ data: { caseId } });
      onMutate(caseId, { liked: r.liked, likes_count: detail.likes_count + (r.liked ? 1 : -1) });
    } catch (e: any) {
      toast.error(e?.message ?? "操作失败");
    }
  };
  const handleFav = async () => {
    if (!caseId || !detail) return;
    const optimistic = !detail.favorited;
    setDetail({ ...detail, favorited: optimistic, favorites_count: detail.favorites_count + (optimistic ? 1 : -1) });
    try {
      const r = await toggleFav({ data: { caseId } });
      onMutate(caseId, { favorited: r.favorited, favorites_count: detail.favorites_count + (r.favorited ? 1 : -1) });
    } catch (e: any) {
      toast.error(e?.message ?? "操作失败");
    }
  };

  const handleReuse = () => {
    if (!detail) return;
    setStudioPrefill({
      prompt: detail.prompt || "",
      modelKey: detail.model_key || undefined,
      aspectRatio: detail.aspect_ratio || undefined,
      size: (detail.size as any) || undefined,
      styleId: detail.style_id || undefined,
    });
    toast.success("已复用案例参数");
    navigate({ to: "/" });
  };

  const handleCopyPrompt = async () => {
    if (!detail?.prompt) return;
    await navigator.clipboard.writeText(detail.prompt);
    toast.success("Prompt 已复制");
  };

  const handleSubmitComment = async () => {
    if (!caseId || !commentDraft.trim()) return;
    setSubmitting(true);
    try {
      await addComment({ data: { caseId, content: commentDraft.trim() } });
      const d = await getDetail({ data: { caseId } });
      setDetail(d);
      setCommentDraft("");
    } catch (e: any) {
      toast.error(e?.message ?? "评论失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={!!caseId} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-5xl border-border bg-card/95 p-0 backdrop-blur-2xl">
        <DialogTitle className="sr-only">案例详情</DialogTitle>
        <DialogDescription className="sr-only">查看案例详情、生成参数并一键复用</DialogDescription>
        {!detail ? (
          <div className="grid h-[60vh] place-items-center text-sm text-muted-foreground">加载中…</div>
        ) : (
          <div className="grid max-h-[88vh] grid-cols-1 overflow-hidden md:grid-cols-[1.2fr_1fr]">
            <div className="relative max-h-[88vh] overflow-auto bg-black/40">
              <img src={detail.image_url} alt={detail.title} className="block w-full" />
            </div>
            <div className="flex max-h-[88vh] flex-col overflow-hidden">
              <div className="flex-1 space-y-4 overflow-y-auto p-5 scrollbar-thin">
                <div>
                  <div className="text-base font-semibold">{detail.title || "未命名案例"}</div>
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    {detail.author_name ?? "匿名作者"} · {new Date(detail.created_at).toLocaleString()}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <ActionBtn onClick={handleLike} active={detail.liked} icon={<Heart className="h-3.5 w-3.5" />}>{detail.likes_count}</ActionBtn>
                  <ActionBtn onClick={handleFav} active={detail.favorited} icon={<Bookmark className="h-3.5 w-3.5" />}>{detail.favorites_count}</ActionBtn>
                  <span className="flex items-center gap-1 rounded-full border border-border px-3 py-1 text-[11px] text-muted-foreground">
                    <Eye className="h-3.5 w-3.5" /> {detail.views}
                  </span>
                  <button
                    onClick={handleReuse}
                    className="ml-auto flex items-center gap-1.5 rounded-full bg-gradient-aurora px-3 py-1.5 text-[11px] font-semibold text-primary-foreground shadow-glow transition-transform hover:scale-[1.03]"
                  >
                    <Wand2 className="h-3.5 w-3.5" /> 一键复用
                  </button>
                </div>

                <section>
                  <div className="mb-1.5 flex items-center justify-between text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                    Prompt
                    <button onClick={handleCopyPrompt} className="flex items-center gap-1 rounded px-1.5 py-0.5 text-muted-foreground hover:bg-white/5 hover:text-foreground">
                      <Copy className="h-3 w-3" /> 复制
                    </button>
                  </div>
                  <div className="whitespace-pre-wrap rounded-xl border border-border bg-input/40 p-3 text-xs leading-relaxed">
                    {detail.prompt || <span className="text-muted-foreground">（无）</span>}
                  </div>
                </section>

                <section className="grid grid-cols-2 gap-2 text-[11px]">
                  <Param k="模型" v={detail.model_name || detail.model_key || "—"} />
                  <Param k="比例" v={detail.aspect_ratio || "—"} />
                  <Param k="清晰度" v={detail.size || "—"} />
                  <Param k="风格模板" v={detail.style_id || "—"} />
                </section>

                {(detail.tags ?? []).length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {detail.tags.map((t: string) => (
                      <span key={t} className="rounded-full bg-white/[0.04] px-2 py-0.5 text-[10px] text-muted-foreground">#{t}</span>
                    ))}
                  </div>
                )}

                <section>
                  <div className="mb-2 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                    <MessageSquare className="h-3 w-3" /> 评论 ({detail.comments?.length ?? 0})
                  </div>
                  <div className="space-y-2">
                    {(detail.comments ?? []).map((c: any) => (
                      <div key={c.id} className="rounded-lg border border-border/60 bg-white/[0.02] p-2">
                        <div className="text-[10px] text-muted-foreground">
                          {c.author_name ?? "匿名"} · {new Date(c.created_at).toLocaleString()}
                        </div>
                        <div className="mt-1 text-xs">{c.content}</div>
                      </div>
                    ))}
                    {(detail.comments ?? []).length === 0 && (
                      <div className="text-[11px] text-muted-foreground">还没有评论，来抢沙发 ~</div>
                    )}
                  </div>
                </section>
              </div>
              <div className="border-t border-border/60 p-3">
                <div className="flex items-center gap-2">
                  <input
                    value={commentDraft}
                    onChange={(e) => setCommentDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleSubmitComment(); }}
                    placeholder="写下你的看法…"
                    className="flex-1 rounded-lg border border-border bg-input/40 px-3 py-2 text-xs focus:border-primary/50 focus:outline-none"
                  />
                  <button
                    onClick={handleSubmitComment}
                    disabled={submitting || !commentDraft.trim()}
                    className="flex items-center gap-1 rounded-lg bg-primary/15 px-3 py-2 text-xs font-medium text-primary transition-colors hover:bg-primary/25 disabled:opacity-50"
                  >
                    <Send className="h-3 w-3" /> 发送
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ActionBtn({ children, icon, onClick, active }: { children: React.ReactNode; icon: React.ReactNode; onClick: () => void; active?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1 rounded-full border px-3 py-1 text-[11px] transition-colors ${
        active ? "border-primary/60 bg-primary/15 text-primary" : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
      }`}
    >
      {icon}{children}
    </button>
  );
}

function Param({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-white/[0.02] px-2.5 py-1.5">
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{k}</div>
      <div className="mt-0.5 truncate text-[11px] font-medium">{v}</div>
    </div>
  );
}

function PublishDialog({
  open, onOpenChange, styles, models, onPublished,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  styles: StyleTpl[];
  models: { key: string; name: string }[];
  onPublished: () => void;
}) {
  const { session } = useAuth();
  const publish = useServerFn(publishCase);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [title, setTitle] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [prompt, setPrompt] = useState("");
  const [modelKey, setModelKey] = useState("");
  const [aspectRatio, setAspectRatio] = useState("");
  const [size, setSize] = useState("");
  const [styleId, setStyleId] = useState("");
  const [tagsRaw, setTagsRaw] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);

  const tags = useMemo(
    () => tagsRaw.split(/[,，\s]+/).map((t) => t.trim()).filter(Boolean).slice(0, 8),
    [tagsRaw]
  );

  const handleFile = async (f: File | null | undefined) => {
    if (!f) return;
    const uid = session?.user?.id;
    if (!uid) { toast.error("请先登录"); return; }
    if (!/^image\//i.test(f.type)) { toast.error("仅支持图片文件"); return; }
    if (f.size > 10 * 1024 * 1024) { toast.error("图片需小于 10MB"); return; }
    setUploading(true);
    try {
      const ext = (f.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
      const path = `${uid}/cases/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("reference-images")
        .upload(path, f, { cacheControl: "3600", contentType: f.type, upsert: false });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("reference-images").getPublicUrl(path);
      setImageUrl(pub.publicUrl);
      if (!title.trim()) {
        setTitle(f.name.replace(/\.[a-z0-9]+$/i, "").slice(0, 60));
      }
      toast.success("图片已上传");
    } catch (e: any) {
      toast.error(e?.message ?? "上传失败");
    } finally {
      setUploading(false);
    }
  };

  const submit = async () => {
    if (!title.trim() || !imageUrl.trim()) {
      toast.error("请填写标题并上传示例图");
      return;
    }
    setSubmitting(true);
    try {
      const modelName = models.find((m) => m.key === modelKey)?.name;
      await publish({
        data: {
          title: title.trim(),
          imageUrl: imageUrl.trim(),
          prompt: prompt.trim() || undefined,
          modelKey: modelKey || undefined,
          modelName,
          aspectRatio: aspectRatio || undefined,
          size: size || undefined,
          styleId: styleId || undefined,
          tags,
        },
      });
      toast.success("发布成功");
      onOpenChange(false);
      setTitle(""); setImageUrl(""); setPrompt(""); setModelKey("");
      setAspectRatio(""); setSize(""); setStyleId(""); setTagsRaw("");
      onPublished();
    } catch (e: any) {
      toast.error(e?.message ?? "发布失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl border-border bg-card/95 backdrop-blur-2xl max-h-[88vh] overflow-y-auto scrollbar-light">
        <DialogTitle>发布灵感案例</DialogTitle>
        <DialogDescription>上传图片即可自动生成链接，几秒钟分享你的作品。</DialogDescription>

        <div className="space-y-4">
          {/* Upload zone */}
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => { handleFile(e.target.files?.[0]); e.currentTarget.value = ""; }}
            />
            {imageUrl ? (
              <div className="relative overflow-hidden rounded-xl border border-border bg-black/30">
                <img src={imageUrl} alt="preview" className="max-h-64 w-full object-contain" />
                <div className="flex items-center justify-between gap-2 border-t border-border/60 bg-background/60 px-3 py-2">
                  <span className="truncate text-[10px] text-muted-foreground">{imageUrl}</span>
                  <div className="flex shrink-0 gap-1">
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="rounded-md border border-border px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground"
                    >
                      重新上传
                    </button>
                    <button
                      onClick={() => setImageUrl("")}
                      className="rounded-md border border-border px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground"
                    >
                      移除
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="group flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-white/[0.02] py-10 text-muted-foreground transition-colors hover:border-primary/60 hover:text-foreground"
              >
                {uploading ? (
                  <Loader2 className="h-7 w-7 animate-spin text-primary" />
                ) : (
                  <Upload className="h-7 w-7" />
                )}
                <div className="text-sm font-medium">
                  {uploading ? "上传中…" : "点击上传示例图"}
                </div>
                <div className="text-[10px]">支持 JPG / PNG / WebP · 最大 10MB · 自动生成链接</div>
              </button>
            )}
          </div>

          <Field label="标题">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-lg border border-border bg-input/40 px-3 py-2 text-sm focus:outline-none focus:border-primary/50"
              placeholder="给作品起个名字"
              maxLength={80}
            />
          </Field>

          <Field label="Prompt">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={3}
              className="w-full resize-none rounded-lg border border-border bg-input/40 px-3 py-2 text-xs focus:outline-none focus:border-primary/50"
              placeholder="该作品使用的提示词（可选）"
            />
          </Field>

          {/* Pill pickers — directly visible */}
          <PillGroup
            label="模型"
            value={modelKey}
            onChange={setModelKey}
            options={[{ id: "", name: "不指定" }, ...models.map((m) => ({ id: m.key, name: m.name }))]}
          />
          <PillGroup
            label="风格"
            value={styleId}
            onChange={setStyleId}
            options={[{ id: "", name: "不指定" }, ...styles.map((s) => ({ id: s.id, name: s.name }))]}
          />
          <PillGroup
            label="比例"
            value={aspectRatio}
            onChange={setAspectRatio}
            options={[
              { id: "", name: "不指定" },
              ...["1:1","16:9","9:16","4:3","3:4","21:9","3:2","2:3","5:4","4:5"].map((r) => ({ id: r, name: r })),
            ]}
          />
          <PillGroup
            label="清晰度"
            value={size}
            onChange={setSize}
            options={[
              { id: "", name: "不指定" },
              ...["1K","2K","4K"].map((r) => ({ id: r, name: r })),
            ]}
          />

          <Field label="标签（空格或逗号分隔，最多 8 个）">
            <input
              value={tagsRaw}
              onChange={(e) => setTagsRaw(e.target.value)}
              className="w-full rounded-lg border border-border bg-input/40 px-3 py-2 text-xs"
              placeholder="例如：电商 极简 复古"
            />
            {tags.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {tags.map((t) => (
                  <span key={t} className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary">#{t}</span>
                ))}
              </div>
            )}
          </Field>

          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={() => onOpenChange(false)}
              className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <X className="mr-1 inline h-3 w-3" />取消
            </button>
            <button
              onClick={submit}
              disabled={submitting || uploading || !imageUrl || !title.trim()}
              className="rounded-lg bg-gradient-aurora px-4 py-1.5 text-xs font-semibold text-primary-foreground shadow-glow disabled:opacity-50"
            >
              {submitting ? "提交中…" : "发布"}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PillGroup({
  label, value, onChange, options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { id: string; name: string }[];
}) {
  return (
    <div>
      <div className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const active = value === o.id;
          return (
            <button
              key={o.id || "__none"}
              type="button"
              onClick={() => onChange(o.id)}
              className={`rounded-full border px-3 py-1 text-[11px] font-medium transition-all ${
                active
                  ? "border-primary/70 bg-primary/15 text-primary shadow-glow"
                  : "border-border bg-white/[0.02] text-muted-foreground hover:border-primary/40 hover:text-foreground"
              }`}
            >
              {o.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
      {children}
    </label>
  );
}
