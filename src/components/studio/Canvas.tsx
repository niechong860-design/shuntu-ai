import { useState } from "react";
import { Download, Copy, Maximize2, Sparkles, ArrowUpRight, X, Clock, ImageIcon } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import img1 from "@/assets/gen-1.jpg";
import img2 from "@/assets/gen-2.jpg";
import img3 from "@/assets/gen-3.jpg";
import img4 from "@/assets/gen-4.jpg";
import img5 from "@/assets/gen-5.jpg";
import img6 from "@/assets/gen-6.jpg";

const IMAGES = [img1, img2, img3, img4, img5, img6];
const META = [
  { model: "Flux.1 Pro", prompt: "黑暗山脉上空的超现实极光，缥缈薄雾", time: "刚刚" },
  { model: "MJ V6", prompt: "戴全息绿色护目镜的赛博朋克人像", time: "6 分钟前" },
  { model: "Flux.1 Pro", prompt: "粗野主义混凝土建筑，风暴天空", time: "14 分钟前" },
  { model: "SDXL Turbo", prompt: "液态金属雕塑，虹彩铬合金", time: "1 小时前" },
  { model: "MJ V6", prompt: "生物荧光水母，深海翠绿", time: "2 小时前" },
  { model: "Nano Banana", prompt: "复古模拟合成器，暗调摄影", time: "3 小时前" },
];

type Props = {
  generating: boolean;
  heroIndex: number;
  generatedUrl?: string | null;
  historyOpen: boolean;
  onHistoryOpenChange: (v: boolean) => void;
  onSelectHistory: (i: number) => void;
};

export function Canvas({ generating, heroIndex, generatedUrl, historyOpen, onHistoryOpenChange, onSelectHistory }: Props) {
  const [lightbox, setLightbox] = useState<number | null>(null);
  const hero = IMAGES[heroIndex];
  const heroMeta = META[heroIndex];

  return (
    <main className="flex h-full min-h-0 flex-col overflow-hidden bg-background p-3">
      {/* Main canvas — pure, full height */}
      <div className="relative flex-1 min-h-0 overflow-hidden rounded-2xl border border-border bg-card">
        {generating ? (
          <SkeletonShimmer />
        ) : generatedUrl ? (
          <img src={generatedUrl} alt="生成结果" className="h-full w-full object-contain bg-black" />
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
                  <button
                    key={i}
                    onClick={() => {
                      onSelectHistory(idx);
                      onHistoryOpenChange(false);
                    }}
                    className="group relative aspect-square overflow-hidden rounded-xl border border-border bg-card transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-glow"
                  >
                    <img src={src} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110" />
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/0 opacity-0 transition-opacity group-hover:opacity-100" />
                    <div className="absolute left-2 top-2 opacity-0 transition-opacity group-hover:opacity-100">
                      <span className="glass rounded-full px-1.5 py-0.5 text-[8px] font-semibold uppercase text-primary">{meta.model.split(" ")[0]}</span>
                    </div>
                    <div className="absolute inset-x-2 bottom-2 flex items-end justify-between opacity-0 transition-opacity group-hover:opacity-100">
                      <span className="font-mono text-[9px] text-foreground/70">{meta.time}</span>
                      <span
                        role="button"
                        onClick={(e) => { e.stopPropagation(); setLightbox(idx); }}
                        className="glass flex h-6 w-6 cursor-pointer items-center justify-center rounded-md text-foreground/90 hover:bg-primary/20 hover:text-primary"
                      >
                        <Maximize2 className="h-2.5 w-2.5" />
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {lightbox !== null && <Lightbox idx={lightbox} onClose={() => setLightbox(null)} />}
    </main>
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
        <div className="text-sm font-medium text-foreground/90">正在渲染你的灵感…</div>
        <div className="text-[11px] font-light text-muted-foreground">扩散模型正在全力工作</div>
        <div className="mt-1 h-1 w-48 overflow-hidden rounded-full bg-white/5">
          <div className="h-full w-1/2 animate-[shimmer_2s_infinite] rounded-full bg-gradient-aurora shadow-glow" />
        </div>
      </div>
    </div>
  );
}

function Lightbox({ idx, onClose }: { idx: number; onClose: () => void }) {
  const meta = META[idx];
  return (
    <div onClick={onClose} className="fixed inset-0 z-[60] flex items-center justify-center bg-background/80 p-6 backdrop-blur-xl animate-[fade-in_0.2s_ease-out]">
      <div onClick={(e) => e.stopPropagation()} className="glass-elevated relative flex max-h-[90vh] w-full max-w-5xl gap-4 overflow-hidden rounded-2xl p-2">
        <div className="flex-1 overflow-hidden rounded-xl bg-black">
          <img src={IMAGES[idx]} alt={meta.prompt} className="h-full w-full object-contain" />
        </div>
        <div className="flex w-72 flex-col p-4">
          <span className="self-start rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-semibold tracking-wider text-primary">{meta.model}</span>
          <div className="mt-4 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">提示词</div>
          <p className="mt-2 text-sm font-light leading-relaxed">{meta.prompt}</p>
          <div className="mt-auto flex flex-col gap-2 pt-4">
            <button className="flex items-center justify-center gap-2 rounded-lg bg-gradient-aurora px-3 py-2.5 text-xs font-semibold text-primary-foreground shadow-glow">
              <Download className="h-3.5 w-3.5" /> 下载
            </button>
            <button className="flex items-center justify-center gap-2 rounded-lg border border-border bg-white/[0.03] px-3 py-2.5 text-xs font-medium hover:bg-white/[0.06]">
              <Copy className="h-3.5 w-3.5" /> 复制提示词
            </button>
            <button className="flex items-center justify-center gap-2 rounded-lg border border-border bg-white/[0.03] px-3 py-2.5 text-xs font-medium hover:bg-white/[0.06]">
              <ArrowUpRight className="h-3.5 w-3.5" /> 放大重绘
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
