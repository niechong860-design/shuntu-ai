import { useEffect, useState } from "react";
import { Download, Copy, Maximize2, Sparkles, ArrowUpRight, X, Clock, ImageIcon } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { getMyGenerationHistory } from "@/lib/admin.functions";

type HistoryItem = {
  id: string;
  model: string;
  prompt: string | null;
  image_url: string;
  created_at: string;
  cost: number;
};

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
  generating: boolean;
  heroIndex: number;
  generatedUrl?: string | null;
  currentPrompt?: string;
  currentModel?: string;
  historyOpen: boolean;
  onHistoryOpenChange: (v: boolean) => void;
  onSelectHistory: (i: number) => void;
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

export function Canvas({ generating, heroIndex, generatedUrl, currentPrompt, currentModel, historyOpen, onHistoryOpenChange, onSelectHistory }: Props) {
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [heroLightbox, setHeroLightbox] = useState(false);

  const heroPrompt = currentPrompt ?? "";
  const heroModel = currentModel ?? "当前模型";

  return (
    <main className="flex h-full min-h-0 flex-col overflow-hidden bg-background p-3">
      {/* Main canvas — pure, full height */}
      <div className="group relative flex-1 min-h-0 overflow-hidden rounded-2xl border border-border bg-card">
        {generating ? (
          <SkeletonShimmer />
        ) : generatedUrl ? (
          <>
            <img src={generatedUrl} alt="生成结果" className="h-full w-full object-contain bg-black" />
            {/* Hover overlay actions */}
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/30 opacity-0 transition-opacity group-hover:opacity-100" />
            <div className="absolute right-3 top-3 flex items-center gap-1.5 opacity-0 transition-opacity group-hover:opacity-100">
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
          className="w-[420px] border-l border-border bg-card/95 p-0 backdrop-blur-2xl sm:max-w-none"
        >
          <div className="flex items-center justify-between border-b border-border/60 px-5 py-4">
            <div>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-primary" />
                <h2 className="font-display text-base font-semibold tracking-tight">历史记录</h2>
              </div>
              <p className="mt-0.5 text-[11px] font-light text-muted-foreground">
                共 248 张作品 · 会话 #042
              </p>
            </div>
            <button
              onClick={() => onHistoryOpenChange(false)}
              className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="scrollbar-thin h-[calc(100vh-72px)] overflow-y-auto p-4">
            <div className="grid grid-cols-2 gap-3">
              {[...IMAGES, ...IMAGES].map((src, i) => {
                const meta = META[i % META.length];
                const idx = i % IMAGES.length;
                return (
                  <div
                    key={i}
                    className="group relative aspect-square overflow-hidden rounded-xl border border-border bg-card transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-glow"
                  >
                    <button
                      onClick={() => {
                        onSelectHistory(idx);
                        onHistoryOpenChange(false);
                      }}
                      className="absolute inset-0"
                    >
                      <img src={src} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110" />
                    </button>
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/0 opacity-0 transition-opacity group-hover:opacity-100" />
                    <div className="absolute left-2 top-2 opacity-0 transition-opacity group-hover:opacity-100">
                      <span className="glass rounded-full px-1.5 py-0.5 text-[8px] font-semibold uppercase text-primary">{meta.model.split(" ")[0]}</span>
                    </div>
                    <div className="absolute inset-x-2 bottom-2 flex items-end justify-between gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <span className="font-mono text-[9px] text-foreground/70">{meta.time}</span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={(e) => { e.stopPropagation(); copyToClipboard(meta.prompt); }}
                          title="复制提示词"
                          className="glass flex h-6 w-6 items-center justify-center rounded-md text-foreground/90 hover:bg-primary/20 hover:text-primary"
                        >
                          <Copy className="h-2.5 w-2.5" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); downloadImage(src, `lovable-${meta.model}-${idx}.jpg`); }}
                          title="下载"
                          className="glass flex h-6 w-6 items-center justify-center rounded-md text-foreground/90 hover:bg-primary/20 hover:text-primary"
                        >
                          <Download className="h-2.5 w-2.5" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setLightbox(idx); }}
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
          </div>
        </SheetContent>
      </Sheet>

      {lightbox !== null && (
        <Lightbox
          src={IMAGES[lightbox]}
          prompt={META[lightbox].prompt}
          model={META[lightbox].model}
          filename={`lovable-${META[lightbox].model}-${lightbox}.jpg`}
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

function SkeletonShimmer() {
  return (
    <div className="relative h-full w-full overflow-hidden bg-gradient-to-br from-surface to-surface-elevated">
      <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-primary/15 to-transparent" />
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
        <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-aurora shadow-glow">
          <Sparkles className="h-7 w-7 animate-pulse text-primary-foreground" />
        </div>
        <div className="text-sm font-medium text-foreground/90">AI 正在拼命绘制中，请稍候…</div>
        <div className="text-[11px] font-light text-muted-foreground">异步任务轮询中 · 最长 60 秒</div>
        <div className="mt-1 h-1 w-48 overflow-hidden rounded-full bg-white/5">
          <div className="h-full w-1/2 animate-[shimmer_2s_infinite] rounded-full bg-gradient-aurora shadow-glow" />
        </div>
      </div>
    </div>
  );
}

function Lightbox({ src, prompt, model, filename, onClose }: { src: string; prompt: string; model: string; filename: string; onClose: () => void }) {
  return (
    <div onClick={onClose} className="fixed inset-0 z-[60] flex items-center justify-center bg-background/80 p-6 backdrop-blur-xl animate-[fade-in_0.2s_ease-out]">
      <div onClick={(e) => e.stopPropagation()} className="glass-elevated relative flex max-h-[90vh] w-full max-w-5xl gap-4 overflow-hidden rounded-2xl p-2">
        <div className="flex-1 overflow-hidden rounded-xl bg-black">
          <img src={src} alt={prompt} className="h-full w-full object-contain" />
        </div>
        <div className="flex w-72 flex-col p-4">
          <div className="flex items-center justify-between">
            <span className="self-start rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-semibold tracking-wider text-primary">{model}</span>
            <button onClick={onClose} className="rounded-md p-1.5 text-muted-foreground hover:bg-white/5 hover:text-foreground">
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
    </div>
  );
}
