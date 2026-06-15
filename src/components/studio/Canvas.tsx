import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Download, Copy, Maximize2, Sparkles, ArrowUpRight, X, Clock, ImageIcon, ListOrdered, Loader2, CheckCircle2 } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { getMyGenerationHistory } from "@/lib/admin.functions";
import type { GenProgress } from "./ControlPanel";

const FALLBACK_THUMB = "/style-previews/default.webp";
const PAGE_SIZE = 20;
const HISTORY_RESET_CACHE_MS = 60_000;

type HistoryItem = {
  id: string;
  userId?: string | null;
  model: string;
  prompt: string | null;
  finalPrompt: string | null;
  styleName: string | null;
  aspectRatio: string | null;
  createdAt: string;
  thumbnailUrl: string | null;
  originalImageUrl: string;
  generationTaskId?: string | null;
  cost: number;
  authorName?: string | null;
  authorEmail?: string | null;
  // legacy
  image_url: string;
  created_at: string;
};

function getHistoryIdentityKey(item: HistoryItem) {
  return item.generationTaskId || item.id;
}

function timeAgo(iso: string) {
  const t = new Date(iso).getTime();
  const diff = Math.max(0, Date.now() - t);
  const m = Math.floor(diff / 60000);
  if (m < 1) return "刚刚";
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  const d = Math.floor(h / 24);
  return `${d} 天前`;
}


type Props = {
  userId?: string | null;
  generating: boolean;
  heroIndex?: number;
  generatedUrl?: string | null;
  currentPrompt?: string;
  currentModel?: string;
  progress?: GenProgress | null;
  historyOpen: boolean;
  onHistoryOpenChange: (v: boolean) => void;
  onSelectHistory: (url: string, prompt: string, model: string) => void;
};


async function downloadImage(url: string, filename: string) {
  try {
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) throw new Error(String(res.status));
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    toast.success("已开始下载");
  } catch {
    // 跨域失败时退回到新标签页打开，让用户右键保存
    window.open(url, "_blank", "noopener,noreferrer");
    toast.message("已在新标签打开，请右键图片另存为");
  }
}

async function copyToClipboard(text: string) {
  if (!text) return toast.error("没有可复制的提示词");
  try {
    await navigator.clipboard.writeText(text);
    toast.success("提示词已复制");
  } catch {
    toast.error("复制失败，请手动选择文本");
  }
}

export function Canvas({ userId, generating, generatedUrl, currentPrompt, currentModel, progress, historyOpen, onHistoryOpenChange, onSelectHistory }: Props) {
  const [lightbox, setLightbox] = useState<HistoryItem | null>(null);
  const [heroLightbox, setHeroLightbox] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [maxKeep, setMaxKeep] = useState(100);
  const [maxDays, setMaxDays] = useState(15);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const fetchHistory = useServerFn(getMyGenerationHistory);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const inFlightRef = useRef(false);
  const historyRef = useRef<HistoryItem[]>([]);
  const totalRef = useRef(0);
  const rawLoadedCountRef = useRef(0);
  const hasMoreRef = useRef(true);
  const userIdRef = useRef<string | null | undefined>(userId);
  const lastHistoryResetAtRef = useRef(0);
  useEffect(() => { historyRef.current = history; }, [history]);
  useEffect(() => { totalRef.current = total; }, [total]);
  useEffect(() => { hasMoreRef.current = hasMore; }, [hasMore]);
  useEffect(() => { userIdRef.current = userId; }, [userId]);

  useEffect(() => {
    inFlightRef.current = false;
    historyRef.current = [];
    totalRef.current = 0;
    rawLoadedCountRef.current = 0;
    hasMoreRef.current = true;
    lastHistoryResetAtRef.current = 0;
    setHistory([]);
    setTotal(0);
    setMaxKeep(100);
    setMaxDays(15);
    setIsAdmin(false);
    setHistoryError(null);
    setHasMore(true);
    setLoadingHistory(false);
    setLoadingMore(false);
    setLightbox(null);
    setHeroLightbox(false);
  }, [userId]);

  const loadHistory = useCallback(async (mode: "reset" | "append" = "reset") => {
    const requestUserId = userIdRef.current;
    if (!requestUserId) return;
    if (inFlightRef.current) return;
    if (mode === "append") {
      if (!hasMoreRef.current) return;
      if (totalRef.current > 0 && rawLoadedCountRef.current >= totalRef.current) return;
    }
    inFlightRef.current = true;
    if (mode === "reset") {
      setLoadingHistory(true);
      setHistoryError(null);
      setHasMore(true);
      hasMoreRef.current = true;
      rawLoadedCountRef.current = 0;
    } else {
      setLoadingMore(true);
    }
    try {
      const offset = mode === "append" ? rawLoadedCountRef.current : 0;
      const res = (await fetchHistory({ data: { limit: PAGE_SIZE, offset } })) as {
        items: HistoryItem[]; total?: number; limit: number; offset: number; maxKeep?: number; maxDays?: number; isAdmin?: boolean;
      };
      if (userIdRef.current !== requestUserId) return;
      const items = res.items ?? [];
      const returnedTotal = Number(res.total ?? 0);
      const nextRawLoadedCount = offset + items.length;
      const nextHasMore = returnedTotal > 0
        ? nextRawLoadedCount < returnedTotal
        : items.length >= PAGE_SIZE;
      rawLoadedCountRef.current = nextRawLoadedCount;
      setTotal(returnedTotal);
      setHasMore(nextHasMore);
      hasMoreRef.current = nextHasMore;
      if (res.maxKeep) setMaxKeep(res.maxKeep);
      if (res.maxDays) setMaxDays(res.maxDays);
      if (typeof res.isAdmin === "boolean") setIsAdmin(res.isAdmin);
      setHistory((prev) => {
        const base = mode === "append" ? prev : [];
        // Merge paged results by stable history/task identity.
        const seen = new Set(base.map(getHistoryIdentityKey));
        const merged = [...base];
        for (const it of items) {
          const key = getHistoryIdentityKey(it);
          if (seen.has(key)) continue;
          seen.add(key);
          merged.push(it);
        }
        return merged;
      });
      if (mode === "reset") lastHistoryResetAtRef.current = Date.now();
    } catch (e: any) {
      console.warn("[history] load failed", e);
      if (mode === "reset") setHistoryError(e?.message ?? "加载失败，请稍后再试");
    } finally {
      setLoadingHistory(false);
      setLoadingMore(false);
      inFlightRef.current = false;
    }
  }, [fetchHistory]);

  useEffect(() => {
    if (!historyOpen) return;
    if (Date.now() - lastHistoryResetAtRef.current <= HISTORY_RESET_CACHE_MS) return;
    loadHistory("reset");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyOpen, userId]);

  // 当主画布出现新图（生成完成）时，自动刷新历史，确保下次打开抽屉是最新的
  useEffect(() => {
    if (generatedUrl) loadHistory("reset");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generatedUrl]);

  // 无限滚动：接近滚动容器底部时加载下一页
  const handleHistoryScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    if (loadingHistory || loadingMore || historyError) return;
    if (!hasMore) return;
    if (totalRef.current > 0 && rawLoadedCountRef.current >= totalRef.current) return;
    const el = e.currentTarget;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 300) {
      loadHistory("append");
    }
  }, [loadingHistory, loadingMore, historyError, hasMore, loadHistory]);

  const heroPrompt = currentPrompt ?? "";
  const heroModel = currentModel ?? "当前模型";
  const isLightboxOpen = !!lightbox || heroLightbox;

  return (
    <main className="flex min-h-[70dvh] flex-col overflow-visible bg-background p-3 lg:h-full lg:min-h-0 lg:overflow-hidden">
      {/* Main canvas — pure, full height */}
      <div className="group relative min-h-[62dvh] overflow-hidden rounded-2xl border border-border bg-card lg:flex-1 lg:min-h-0">
        {generating ? (
          <QueueProgress progress={progress ?? null} />
        ) : generatedUrl ? (
          <>
            <img src={generatedUrl} alt="生成结果" className="h-full w-full object-contain bg-black" />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/30 opacity-0 transition-opacity group-hover:opacity-100" />
            <div className="absolute left-3 top-3 z-20 flex items-center gap-1.5 opacity-70 transition-opacity group-hover:opacity-100">
              <HeroAction label="查看大图" onClick={() => setHeroLightbox(true)}>
                <Maximize2 className="h-3.5 w-3.5" />
              </HeroAction>
              <HeroAction label="复制提示词" onClick={() => copyToClipboard(heroPrompt)}>
                <Copy className="h-3.5 w-3.5" />
              </HeroAction>
              <HeroAction label="下载" onClick={() => downloadImage(generatedUrl, `lovable-${Date.now()}.png`)}>
                <Download className="h-3.5 w-3.5" />
              </HeroAction>
            </div>
            {heroPrompt && (
              <div className="absolute inset-x-3 bottom-3 opacity-0 transition-opacity group-hover:opacity-100">
                <div className="glass max-w-2xl rounded-xl px-3 py-2">
                  <p className="line-clamp-2 text-[11px] leading-snug text-foreground/90">{heroPrompt}</p>
                </div>
              </div>
            )}
          </>
        ) : (
          <EmptyPlaceholder />
        )}
      </div>

      {/* History drawer */}
      <Sheet open={historyOpen} onOpenChange={onHistoryOpenChange}>
        <SheetContent
          side="right"
          onPointerDownOutside={(event) => {
            if (isLightboxOpen) event.preventDefault();
          }}
          onInteractOutside={(event) => {
            if (isLightboxOpen) event.preventDefault();
          }}
          onEscapeKeyDown={(event) => {
            if (isLightboxOpen) event.preventDefault();
          }}
          className="w-[420px] border-l border-border bg-card/95 p-0 backdrop-blur-2xl sm:max-w-none"
        >
          <div className="border-b border-border/60 px-5 py-4">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" />
              <h2 className="font-display text-base font-semibold tracking-tight">历史记录</h2>
            </div>
            <p className="mt-0.5 text-[11px] font-light text-muted-foreground">
              {isAdmin
                ? `管理员历史记录 · 全站最近 ${maxKeep} 张 · 重复图片已合并展示`
                : `最近历史记录 · 重复图片已合并展示 · 最多显示 ${maxKeep} 张`}
            </p>
          </div>
          <div ref={scrollContainerRef} onScroll={handleHistoryScroll} className="scrollbar-thin h-[calc(100vh-72px)] overflow-y-auto p-4">
            {loadingHistory ? (
              <div className="py-20 text-center text-xs text-muted-foreground">正在加载历史记录…</div>
            ) : historyError ? (
              <div className="py-20 text-center text-xs text-muted-foreground">
                <div className="mb-3">{historyError}</div>
                <button
                  onClick={() => loadHistory("reset")}
                  className="rounded-md border border-border px-3 py-1.5 text-[11px] hover:border-primary/60 hover:text-primary"
                >重试</button>
              </div>
            ) : history.length === 0 ? (
              <div className="py-20 text-center text-xs text-muted-foreground">还没有历史作品，去生成第一张吧</div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  {history.map((item) => {
                    const thumb = item.thumbnailUrl || FALLBACK_THUMB;
                    return (
                      <div
                        key={item.id}
                        className="group relative aspect-square overflow-hidden rounded-xl border border-border bg-card transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-glow"
                      >
                        <button
                          onClick={() => {
                            onSelectHistory(item.originalImageUrl, item.prompt ?? "", item.model);
                            onHistoryOpenChange(false);
                          }}
                          className="absolute inset-0"
                        >
                          <img
                            src={thumb}
                            alt=""
                            width={480}
                            height={480}
                            loading="lazy"
                            decoding="async"
                            onError={(e) => {
                              const img = e.currentTarget as HTMLImageElement;
                              if (!img.src.endsWith(FALLBACK_THUMB)) img.src = FALLBACK_THUMB;
                            }}
                            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                          />
                        </button>
                        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/0 opacity-0 transition-opacity group-hover:opacity-100" />
                        {isAdmin && (
                          <div className="pointer-events-none absolute inset-x-0 top-0 bg-gradient-to-b from-black/70 to-transparent px-2 py-1">
                            <span className="line-clamp-1 text-[9px] font-medium text-white/90" title={item.authorEmail ?? item.userId ?? ""}>
                              {item.authorEmail || item.userId?.slice(0, 8) || "-"}
                            </span>
                          </div>
                        )}
                        <div className="absolute left-2 top-2 opacity-0 transition-opacity group-hover:opacity-100">
                          <span className="glass rounded-full px-1.5 py-0.5 text-[8px] font-semibold uppercase text-primary">{item.model.split(" ")[0]}</span>
                        </div>
                        <div className="absolute inset-x-2 bottom-2 flex items-end justify-between gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                          <span className="font-mono text-[9px] text-foreground/70">{timeAgo(item.createdAt)}</span>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={(e) => { e.stopPropagation(); copyToClipboard(item.prompt ?? ""); }}
                              title="复制提示词"
                              className="glass flex h-6 w-6 items-center justify-center rounded-md text-foreground/90 hover:bg-primary/20 hover:text-primary"
                            >
                              <Copy className="h-2.5 w-2.5" />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); downloadImage(item.originalImageUrl, `lovable-${item.model}-${item.id}.png`); }}
                              title="下载原图"
                              className="glass flex h-6 w-6 items-center justify-center rounded-md text-foreground/90 hover:bg-primary/20 hover:text-primary"
                            >
                              <Download className="h-2.5 w-2.5" />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); setLightbox(item); }}
                              title="查看大图"
                              className="glass flex h-6 w-6 items-center justify-center rounded-md text-foreground/90 hover:bg-primary/20 hover:text-primary"
                            >
                              <Maximize2 className="h-2.5 w-2.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="h-8" />
                {loadingMore && (
                  <div className="py-3 text-center text-[11px] text-muted-foreground">正在加载更多…</div>
                )}
                {!loadingMore && !hasMore && history.length > 0 && (
                  <div className="py-3 text-center text-[10px] text-muted-foreground/70">没有更多历史记录了</div>
                )}
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {lightbox && (
        <Lightbox
          src={lightbox.originalImageUrl}
          prompt={lightbox.prompt ?? ""}
          model={lightbox.model}
          filename={`lovable-${lightbox.model}-${lightbox.id}.png`}
          onClose={() => setLightbox(null)}
        />
      )}
      {heroLightbox && generatedUrl && (
        <Lightbox
          src={generatedUrl}
          prompt={heroPrompt}
          model={heroModel}
          filename={`lovable-${Date.now()}.png`}
          onClose={() => setHeroLightbox(false)}
        />
      )}
    </main>
  );
}


function HeroAction({ children, label, onClick }: { children: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={label}
      className="glass flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium text-foreground/90 transition-colors hover:bg-primary/20 hover:text-primary"
    >
      {children}
      <span>{label}</span>
    </button>
  );
}

function EmptyPlaceholder() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-gradient-to-br from-surface to-surface-elevated">
      <div className="flex h-20 w-20 items-center justify-center rounded-2xl border border-border/60 bg-white/[0.02]">
        <ImageIcon className="h-8 w-8 text-muted-foreground/60" strokeWidth={1.5} />
      </div>
      <div className="text-center">
        <div className="text-sm font-medium text-foreground/80">生成的图片将在这里显示</div>
        <div className="mt-1.5 text-xs font-light text-muted-foreground">在左侧输入提示词，点击按钮开始体验</div>
      </div>
    </div>
  );
}

const TERMINAL_LINES_POOL = [
  "[boot] initializing inference pipeline...",
  "[cuda] detected 8x NVIDIA H100 80GB HBM3",
  "[alloc] reserving 73.4 GiB VRAM on node-07",
  "[model] loading GPT-Image-2 weights (12.7B params)",
  "[model] mmap shards: 0001/0042 ... 0042/0042 OK",
  "[vae] warming latent decoder (f8, ch=4)",
  "[clip] tokenizing prompt → 87 tokens",
  "[clip] encoding text embeddings [1, 77, 768]",
  "[ref] parsing reference image features...",
  "[ref] extracting style codes via DINOv2-L/14",
  "[ref] semantic similarity = 0.913",
  "[sched] dispatching to GPU cluster (region: ap-east-1)",
  "[queue] task accepted, priority=high",
  "[diffuse] sampler=DPM++ 2M Karras, steps=28",
  "[diffuse] cfg=7.5, seed=0x8f3a1c92",
  "[diffuse] step 04/28 σ=14.61 loss=0.0823",
  "[diffuse] step 12/28 σ=6.42  loss=0.0411",
  "[diffuse] step 20/28 σ=2.18  loss=0.0192",
  "[refine] high-frequency detail denoising...",
  "[refine] edge-aware sharpening kernel applied",
  "[refine] color tone calibration ΔE=1.23",
  "[upscale] ESRGAN x2 → 2048×2048",
  "[safety] NSFW classifier: clean (0.002)",
  "[safety] watermark embedded (invisible)",
  "[encode] PNG quality=95, optimizing palette",
  "[upload] streaming to CDN edge node...",
  "[done] artifact ready, finalizing handoff",
];

function QueueProgress({ progress }: { progress: GenProgress | null }) {
  const stage = progress?.stage ?? "submitting";
  const elapsed = progress?.elapsedSec ?? 0;

  // initialPos / renderBudget 优先从 progress 中读取（已在 ControlPanel 持久化），
  // 这样刷新页面恢复任务时，UI 显示的"第 N 位"和渲染百分比保持一致。
  const [fallbackPos] = useState(() => 18 + Math.floor(Math.random() * 25));
  const [fallbackBudget] = useState(() => 12 + Math.floor(Math.random() * 10));
  const initialPos = progress?.initialPos ?? fallbackPos;
  const renderBudget = progress?.renderBudget ?? fallbackBudget;

  const SEC_PER_TICK = 1.6; // 每 1.6 秒前进一位
  const queuePos = useMemo(() => {
    if (stage === "rendering") return 0;
    const advanced = Math.floor(elapsed / SEC_PER_TICK);
    return Math.max(1, initialPos - advanced);
  }, [stage, elapsed, initialPos]);

  // 终端滚动日志：每 ~450ms 追加一行
  const [logs, setLogs] = useState<string[]>(() => [TERMINAL_LINES_POOL[0]]);
  useEffect(() => {
    let i = 1;
    const id = setInterval(() => {
      setLogs((prev) => {
        const line = TERMINAL_LINES_POOL[i % TERMINAL_LINES_POOL.length];
        i++;
        const next = [...prev, line];
        return next.length > 60 ? next.slice(next.length - 60) : next;
      });
    }, 420);
    return () => clearInterval(id);
  }, []);
  const logEndRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [logs]);

  // 记录进入"渲染中"那一刻的已用秒，避免渲染百分比受排队时长影响

  const renderStartRef = useRef<number | null>(null);
  useEffect(() => {
    if (stage === "rendering" && renderStartRef.current === null) {
      renderStartRef.current = elapsed;
    }
    if (stage !== "rendering") renderStartRef.current = null;
  }, [stage, elapsed]);

  // 总进度百分比
  let pct = 8;
  if (stage === "submitting") pct = 8;
  else if (stage === "queued" || stage === "polling") {
    const queueProgress = 1 - queuePos / initialPos; // 0 → 1
    pct = Math.min(60, 15 + queueProgress * 45);
  } else if (stage === "rendering") {
    const rStart = renderStartRef.current ?? elapsed;
    const renderElapsed = Math.max(0, elapsed - rStart);
    // 60% → 99%，使用对数避免到 100% 卡住
    const rp = Math.min(1, renderElapsed / renderBudget);
    pct = 60 + rp * 39;
  }

  // 友好提示文案（轮播，不显示具体耗时）
  const FRIENDLY_TIPS = [
    "AI 正在创作中，请稍候",
    "正在优化画面细节",
    "正在渲染高清图像",
    "正在处理光影与质感",
    "正在润色构图与色彩",
    "即将完成，请保持页面打开",
  ];
  const LONG_WAIT_TIP = "复杂画面生成需要一点时间，请保持页面打开";
  const [tipIdx, setTipIdx] = useState(0);
  useEffect(() => {
    const id = setInterval(() => {
      setTipIdx((i) => (i + 1 + Math.floor(Math.random() * (FRIENDLY_TIPS.length - 1))) % FRIENDLY_TIPS.length);
    }, 3500 + Math.floor(Math.random() * 1500));
    return () => clearInterval(id);
  }, []);
  const currentTip = elapsed > 45 ? LONG_WAIT_TIP : FRIENDLY_TIPS[tipIdx];

  const stageLabel =
    stage === "rendering" ? "生成中" : stage === "polling" ? "网络重试" : stage === "submitting" ? "提交中" : "排队中";

  const steps: Array<{ key: GenProgress["stage"]; label: string }> = [
    { key: "submitting", label: "提交" },
    { key: "queued", label: "排队" },
    { key: "rendering", label: "渲染" },
  ];
  const stageIndex = stage === "polling" ? 1 : steps.findIndex((s) => s.key === stage);

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#03110c]">
      {/* 背景：网格 + 径向光晕 + 扫描线 */}
      <div
        className="absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(74,222,128,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(74,222,128,0.08) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 50% 40%, rgba(34,197,94,0.18), transparent 60%), radial-gradient(ellipse at 80% 90%, rgba(16,185,129,0.12), transparent 55%)",
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 mix-blend-overlay opacity-30"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, rgba(255,255,255,0.04) 0 1px, transparent 1px 3px)",
        }}
      />
      {/* 终端日志滚动 */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="scrollbar-thin absolute inset-x-0 bottom-0 top-0 overflow-hidden px-6 py-4 font-mono text-[10.5px] leading-relaxed text-emerald-300/55">
          <div className="flex flex-col">
            {logs.map((line, idx) => {
              const isLast = idx === logs.length - 1;
              const dim = idx < logs.length - 8;
              return (
                <div
                  key={idx}
                  className={`whitespace-pre tracking-tight ${dim ? "opacity-30" : "opacity-90"} ${isLast ? "text-emerald-200" : ""}`}
                >
                  <span className="text-emerald-500/60">{String(idx).padStart(4, "0")}</span>
                  <span className="mx-2 text-emerald-500/40">│</span>
                  <span>{line}</span>
                  {isLast && <span className="ml-1 inline-block h-3 w-1.5 -mb-[2px] animate-pulse bg-emerald-300/80" />}
                </div>
              );
            })}
            <div ref={logEndRef} />
          </div>
          {/* 顶部渐隐遮罩 */}
          <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-[#03110c] to-transparent" />
        </div>
      </div>
      {/* 中心信息卡 */}
      <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-emerald-400/10 to-transparent" />
      <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-5 px-6">
        <div className="glass-elevated flex w-full max-w-md flex-col items-center gap-5 rounded-2xl border border-emerald-400/20 bg-black/40 px-6 py-6 shadow-glow backdrop-blur-xl">
        <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-aurora shadow-glow">
          <Sparkles className="h-7 w-7 animate-pulse text-primary-foreground" />
        </div>

        {/* Stage badge */}
        <div className="flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1">
          <ListOrdered className="h-3.5 w-3.5 text-primary" />
          <span className="text-[11px] font-semibold tracking-wide text-primary">{stageLabel}</span>
          <Loader2 className="h-3 w-3 animate-spin text-primary" />
        </div>

        {/* 主信息：排队位次 / 生成百分比 */}
        {stage === "rendering" ? (
          <div className="text-center">
            <div className="font-display text-3xl font-semibold tracking-tight text-foreground">{Math.round(pct)}%</div>
            <div className="mt-1 text-xs font-light text-muted-foreground transition-opacity duration-500">{currentTip}</div>
          </div>
        ) : (
          <div className="text-center">
            <div className="font-display text-3xl font-semibold tracking-tight text-foreground">
              正在排队 · 第 <span className="text-primary">{queuePos}</span> 位
            </div>
            <div className="mt-1 text-xs font-light text-muted-foreground transition-opacity duration-500">
              {currentTip}
            </div>
          </div>
        )}

        {/* 进度条 */}
        <div className="h-2 w-full max-w-md overflow-hidden rounded-full bg-white/5">
          <div
            className="h-full rounded-full bg-gradient-aurora shadow-glow transition-all duration-700 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>

        {/* Steps tracker */}
        <div className="flex w-full max-w-md items-center justify-between gap-2">
          {steps.map((s, i) => {
            const done = i < stageIndex;
            const active = i === stageIndex;
            return (
              <div key={s.key} className="flex flex-1 items-center gap-2">
                <div className={`flex h-6 w-6 items-center justify-center rounded-full border text-[10px] font-semibold transition-colors ${done ? "border-primary bg-primary text-primary-foreground" : active ? "border-primary bg-primary/20 text-primary" : "border-border bg-white/[0.03] text-muted-foreground"}`}>
                  {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : i + 1}
                </div>
                <span className={`text-[11px] ${active ? "text-foreground" : done ? "text-foreground/80" : "text-muted-foreground"}`}>{s.label}</span>
                {i < steps.length - 1 && <div className={`mx-1 h-px flex-1 ${done ? "bg-primary" : "bg-border"}`} />}
              </div>
            );
          })}
        </div>

        {/* Meta line（不显示具体耗时，仅保留任务编号供排查） */}
        <div className="flex items-center gap-3 font-mono text-[10px] text-muted-foreground">
          {progress?.taskId ? <span>任务 {progress.taskId.slice(0, 8)}…</span> : <span>正在与生成节点通信…</span>}
        </div>
        <div className="text-[10px] font-light text-emerald-200/50">您可以继续浏览历史记录，结果会在这里自动显示</div>
        </div>
      </div>
    </div>
  );
}

function Lightbox({ src, prompt, model, filename, onClose }: { src: string; prompt: string; model: string; filename: string; onClose: () => void }) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      data-lightbox-root
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-background/80 p-6 backdrop-blur-xl animate-[fade-in_0.2s_ease-out]"
    >
      <div onClick={(e) => e.stopPropagation()} className="glass-elevated relative flex max-h-[90vh] w-full max-w-5xl gap-4 overflow-hidden rounded-2xl p-2">
        <div className="flex-1 overflow-hidden rounded-xl bg-black">
          <img src={src} alt={prompt} className="h-full w-full object-contain" />
        </div>
        <div className="flex w-72 flex-col p-4">
          <div className="flex items-center justify-between">
            <span className="self-start rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-semibold tracking-wider text-primary">{model}</span>
            <button
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onClose();
              }}
              className="pointer-events-auto relative z-[1001] rounded-md p-1.5 text-muted-foreground hover:bg-white/5 hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-4 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">提示词</div>
          <p className="mt-2 max-h-60 overflow-y-auto text-sm font-light leading-relaxed">{prompt || "（无提示词）"}</p>
          <div className="mt-auto flex flex-col gap-2 pt-4">
            <button
              onClick={() => downloadImage(src, filename)}
              className="flex items-center justify-center gap-2 rounded-lg bg-gradient-aurora px-3 py-2.5 text-xs font-semibold text-primary-foreground shadow-glow"
            >
              <Download className="h-3.5 w-3.5" /> 下载
            </button>
            <button
              onClick={() => copyToClipboard(prompt)}
              className="flex items-center justify-center gap-2 rounded-lg border border-border bg-white/[0.03] px-3 py-2.5 text-xs font-medium hover:bg-white/[0.06]"
            >
              <Copy className="h-3.5 w-3.5" /> 复制提示词
            </button>
            <button
              onClick={() => window.open(src, "_blank", "noopener,noreferrer")}
              className="flex items-center justify-center gap-2 rounded-lg border border-border bg-white/[0.03] px-3 py-2.5 text-xs font-medium hover:bg-white/[0.06]"
            >
              <ArrowUpRight className="h-3.5 w-3.5" /> 新标签打开
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
