import { useState } from "react";
import { Download, Copy, Maximize2, Sparkles, ArrowUpRight, Heart, ZoomIn, RefreshCw, Image as ImageIcon } from "lucide-react";
import img1 from "@/assets/gen-1.jpg";
import img2 from "@/assets/gen-2.jpg";
import img3 from "@/assets/gen-3.jpg";
import img4 from "@/assets/gen-4.jpg";
import img5 from "@/assets/gen-5.jpg";
import img6 from "@/assets/gen-6.jpg";

const IMAGES = [img1, img2, img3, img4, img5, img6];
const META = [
  { model: "Flux.1 Pro", prompt: "Surreal aurora over dark mountains, ethereal mist", time: "now" },
  { model: "MJ V6", prompt: "Cyberpunk portrait with holographic green visor", time: "6m ago" },
  { model: "Flux.1 Pro", prompt: "Brutalist concrete architecture, stormy sky", time: "14m ago" },
  { model: "SDXL Turbo", prompt: "Liquid metal sculpture, iridescent chrome", time: "1h ago" },
  { model: "MJ V6", prompt: "Bioluminescent jellyfish, deep ocean emerald", time: "2h ago" },
  { model: "Nano Banana", prompt: "Vintage analog synthesizer, dark photography", time: "3h ago" },
];

type Props = { generating: boolean; heroIndex: number };

export function Canvas({ generating, heroIndex }: Props) {
  const [selected, setSelected] = useState<number | null>(null);
  const hero = IMAGES[heroIndex];
  const heroMeta = META[heroIndex];
  // duplicate for richer horizontal scroll
  const history = [...IMAGES, ...IMAGES].map((src, i) => ({ src, meta: META[i % META.length] }));

  return (
    <main className="flex h-screen flex-col gap-3 overflow-hidden bg-background p-4">
      {/* Top status */}
      <div className="flex items-center justify-between px-1">
        <div>
          <h1 className="font-display text-lg font-semibold tracking-tight">Canvas</h1>
          <p className="text-[11px] font-light text-muted-foreground">
            <ImageIcon className="mr-1 inline h-3 w-3" /> 248 creations · session #042
          </p>
        </div>
        <span className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-medium ${
          generating ? "border-primary/40 bg-primary/10 text-primary"
          : "border-border bg-white/[0.03] text-muted-foreground"
        }`}>
          <span className={`h-1.5 w-1.5 rounded-full ${generating ? "animate-pulse bg-primary" : "bg-muted-foreground"}`} />
          {generating ? "Rendering" : "Idle"}
        </span>
      </div>

      {/* Hero canvas — 75% */}
      <div className="relative flex-[3] min-h-0 overflow-hidden rounded-2xl border border-border bg-card">
        {generating ? (
          <SkeletonShimmer />
        ) : (
          <>
            <img src={hero} alt={heroMeta.prompt} className="h-full w-full object-cover animate-[fade-in_0.6s_ease-out]" />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-black/30" />

            {/* top-left meta */}
            <div className="absolute left-4 top-4 flex items-center gap-2">
              <span className="glass rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-primary">{heroMeta.model}</span>
              <span className="glass rounded-full px-2.5 py-1 font-mono text-[10px] font-light text-foreground/80">2048 × 2048</span>
            </div>

            {/* floating glass control bar */}
            <div className="glass-elevated absolute left-1/2 top-4 flex -translate-x-1/2 items-center gap-0.5 rounded-full p-1 opacity-0 transition-opacity duration-300 [&]:opacity-100">
              <HeroAction title="Like"><Heart className="h-3.5 w-3.5" /></HeroAction>
              <HeroAction title="Zoom"><ZoomIn className="h-3.5 w-3.5" /></HeroAction>
              <HeroAction title="Upscale"><ArrowUpRight className="h-3.5 w-3.5" /></HeroAction>
              <HeroAction title="Regenerate"><RefreshCw className="h-3.5 w-3.5" /></HeroAction>
              <HeroAction title="Copy"><Copy className="h-3.5 w-3.5" /></HeroAction>
              <HeroAction title="Download"><Download className="h-3.5 w-3.5" /></HeroAction>
            </div>

            {/* bottom prompt */}
            <div className="absolute inset-x-4 bottom-4">
              <div className="glass-elevated rounded-xl p-3">
                <div className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">Prompt</div>
                <p className="mt-1 line-clamp-2 text-xs font-light leading-relaxed text-foreground/90">{heroMeta.prompt}</p>
              </div>
            </div>
          </>
        )}
      </div>

      {/* History row — 25% */}
      <div className="flex flex-[1] min-h-0 flex-col">
        <div className="mb-1.5 flex items-center justify-between px-1">
          <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">History</div>
          <button className="text-[10px] font-light text-muted-foreground transition-colors hover:text-foreground">View all →</button>
        </div>
        <div className="scrollbar-thin -mx-1 flex flex-1 min-h-0 gap-2.5 overflow-x-auto overflow-y-hidden px-1 pb-1">
          {history.map((h, i) => (
            <button
              key={i}
              onClick={() => setSelected(i % IMAGES.length)}
              className="group relative aspect-square h-full shrink-0 overflow-hidden rounded-xl border border-border bg-card transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-glow"
            >
              <img src={h.src} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110" />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/0 opacity-0 transition-opacity group-hover:opacity-100" />
              <div className="absolute left-1.5 top-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                <span className="glass rounded-full px-1.5 py-0.5 text-[8px] font-semibold uppercase text-primary">{h.meta.model.split(" ")[0]}</span>
              </div>
              <div className="absolute inset-x-1.5 bottom-1.5 flex items-center justify-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                <Mini title="Open"><Maximize2 className="h-2.5 w-2.5" /></Mini>
                <Mini title="Download"><Download className="h-2.5 w-2.5" /></Mini>
                <Mini title="Copy"><Copy className="h-2.5 w-2.5" /></Mini>
                <Mini title="Upscale"><ArrowUpRight className="h-2.5 w-2.5" /></Mini>
              </div>
            </button>
          ))}
        </div>
      </div>

      {selected !== null && <Lightbox idx={selected} onClose={() => setSelected(null)} />}
    </main>
  );
}

function HeroAction({ children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button {...rest} className="flex h-8 w-8 items-center justify-center rounded-full text-foreground/90 transition-all hover:bg-primary/20 hover:text-primary">
      {children}
    </button>
  );
}
function Mini({ children, ...rest }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span {...rest} className="glass flex h-6 w-6 items-center justify-center rounded-md text-foreground/90 transition-colors hover:bg-primary/20 hover:text-primary">
      {children}
    </span>
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
        <div className="text-sm font-medium text-foreground/90">Rendering your vision…</div>
        <div className="text-[11px] font-light text-muted-foreground">Diffusion model is hard at work</div>
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
    <div onClick={onClose} className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-6 backdrop-blur-xl animate-[fade-in_0.2s_ease-out]">
      <div onClick={(e) => e.stopPropagation()} className="glass-elevated relative flex max-h-[90vh] w-full max-w-5xl gap-4 overflow-hidden rounded-2xl p-2">
        <div className="flex-1 overflow-hidden rounded-xl bg-black">
          <img src={IMAGES[idx]} alt={meta.prompt} className="h-full w-full object-contain" />
        </div>
        <div className="flex w-72 flex-col p-4">
          <span className="self-start rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-primary">{meta.model}</span>
          <div className="mt-4 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Prompt</div>
          <p className="mt-2 text-sm font-light leading-relaxed">{meta.prompt}</p>
          <div className="mt-auto flex flex-col gap-2 pt-4">
            <button className="flex items-center justify-center gap-2 rounded-lg bg-gradient-aurora px-3 py-2.5 text-xs font-semibold text-primary-foreground shadow-glow">
              <Download className="h-3.5 w-3.5" /> Download
            </button>
            <button className="flex items-center justify-center gap-2 rounded-lg border border-border bg-white/[0.03] px-3 py-2.5 text-xs font-medium hover:bg-white/[0.06]">
              <Copy className="h-3.5 w-3.5" /> Copy prompt
            </button>
            <button className="flex items-center justify-center gap-2 rounded-lg border border-border bg-white/[0.03] px-3 py-2.5 text-xs font-medium hover:bg-white/[0.06]">
              <ArrowUpRight className="h-3.5 w-3.5" /> Upscale
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
