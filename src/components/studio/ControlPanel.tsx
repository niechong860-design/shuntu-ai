import { useState } from "react";
import {
  Wand2,
  Eraser,
  Sparkles,
  Upload,
  Square,
  RectangleHorizontal,
  RectangleVertical,
  Monitor,
  ChevronRight,
} from "lucide-react";

const MODELS = [
  { id: "nano", name: "Nano Banana", tag: "Fast" },
  { id: "gpt2", name: "GPT Image 2", tag: "VIP" },
  { id: "flux", name: "Flux Pro Ultra", tag: "New" },
  { id: "sd35", name: "SD 3.5 Turbo", tag: null },
];

const RATIOS = [
  { id: "1:1", icon: Square, label: "1:1" },
  { id: "16:9", icon: RectangleHorizontal, label: "16:9" },
  { id: "9:16", icon: RectangleVertical, label: "9:16" },
  { id: "4:3", icon: Monitor, label: "4:3" },
];

const RESOLUTIONS = [
  { id: "1k", label: "1K", sub: "Fast" },
  { id: "2k", label: "2K", sub: "Recommended" },
  { id: "4k", label: "4K", sub: "HD" },
];

export function ControlPanel() {
  const [model, setModel] = useState("gpt2");
  const [ratio, setRatio] = useState("1:1");
  const [res, setRes] = useState("2k");
  const [prompt, setPrompt] = useState(
    "A surreal cyberpunk garden at dusk, bioluminescent plants pulsing with emerald light, cinematic wide angle, ultra detailed",
  );

  return (
    <aside className="glass scrollbar-thin flex h-[calc(100vh-3.5rem)] w-[340px] shrink-0 flex-col gap-6 overflow-y-auto border-r border-border/60 p-5">
      {/* Model */}
      <section>
        <SectionLabel>Model</SectionLabel>
        <div className="flex flex-wrap gap-1.5">
          {MODELS.map((m) => {
            const active = model === m.id;
            return (
              <button
                key={m.id}
                onClick={() => setModel(m.id)}
                className={`group flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${
                  active
                    ? "border-primary/40 bg-primary/10 text-primary shadow-glow"
                    : "border-border bg-white/[0.02] text-muted-foreground hover:border-border hover:bg-white/[0.04] hover:text-foreground"
                }`}
              >
                {m.name}
                {m.tag && (
                  <span
                    className={`rounded-sm px-1 py-[1px] text-[9px] font-bold uppercase tracking-wider ${
                      m.tag === "VIP"
                        ? "bg-gradient-aurora text-primary-foreground"
                        : "bg-white/10 text-foreground/70"
                    }`}
                  >
                    {m.tag}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </section>

      {/* Prompt */}
      <section>
        <SectionLabel>Prompt</SectionLabel>
        <div className="group relative rounded-xl border border-border bg-input/30 transition-colors focus-within:border-primary/50">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={6}
            placeholder="Describe what you want to create…"
            className="block w-full resize-none rounded-xl bg-transparent px-3.5 py-3 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
          />
          <div className="flex items-center justify-between border-t border-border/60 px-2.5 py-2">
            <span className="px-1 font-mono text-[10px] text-muted-foreground">
              {prompt.length} / 2000
            </span>
            <div className="flex items-center gap-1">
              <IconAction onClick={() => setPrompt("")} aria-label="Clear">
                <Eraser className="h-3.5 w-3.5" />
              </IconAction>
              <IconAction aria-label="Inspire">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
              </IconAction>
            </div>
          </div>
        </div>
      </section>

      {/* Aspect ratio */}
      <section>
        <SectionLabel>Aspect ratio</SectionLabel>
        <div className="grid grid-cols-4 gap-1.5">
          {RATIOS.map((r) => {
            const Icon = r.icon;
            const active = ratio === r.id;
            return (
              <button
                key={r.id}
                onClick={() => setRatio(r.id)}
                className={`flex flex-col items-center justify-center gap-1.5 rounded-lg border py-2.5 transition-all ${
                  active
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border bg-white/[0.02] text-muted-foreground hover:bg-white/[0.05] hover:text-foreground"
                }`}
              >
                <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
                <span className="font-mono text-[10px]">{r.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Resolution */}
      <section>
        <SectionLabel>Resolution</SectionLabel>
        <div className="flex gap-1.5 rounded-xl border border-border bg-white/[0.02] p-1">
          {RESOLUTIONS.map((r) => {
            const active = res === r.id;
            return (
              <button
                key={r.id}
                onClick={() => setRes(r.id)}
                className={`flex flex-1 flex-col items-center rounded-lg py-2 text-xs transition-all ${
                  active
                    ? "bg-gradient-aurora font-semibold text-primary-foreground shadow-glow"
                    : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                }`}
              >
                <span className="font-mono font-bold">{r.label}</span>
                <span className="text-[9px] opacity-80">{r.sub}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Reference */}
      <section>
        <SectionLabel>Reference image</SectionLabel>
        <label className="group flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-white/[0.015] px-4 py-7 transition-all hover:border-primary/40 hover:bg-primary/[0.03]">
          <div className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-white/5 transition-all group-hover:border-primary/40 group-hover:bg-primary/10">
            <Upload className="h-4 w-4 text-muted-foreground group-hover:text-primary" strokeWidth={1.75} />
          </div>
          <div className="text-center">
            <div className="text-xs font-medium">Drop image or click</div>
            <div className="mt-0.5 text-[10px] text-muted-foreground">PNG, JPG, WebP · up to 10MB</div>
          </div>
          <input type="file" accept="image/*" className="hidden" />
        </label>
      </section>

      {/* Generate */}
      <div className="mt-auto pt-2">
        <button className="group flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-aurora px-4 py-3.5 text-sm font-semibold text-primary-foreground shadow-glow transition-all hover:brightness-110 active:scale-[0.98]">
          <Wand2 className="h-4 w-4" strokeWidth={2.5} />
          Generate
          <span className="ml-1 flex items-center gap-1 rounded-md bg-black/20 px-1.5 py-0.5 font-mono text-[10px]">
            <Sparkles className="h-2.5 w-2.5" /> 4
          </span>
          <ChevronRight className="ml-auto h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </button>
      </div>
    </aside>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2.5 flex items-center justify-between text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
      <span>{children}</span>
    </div>
  );
}

function IconAction({
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className="rounded-md p-1.5 text-muted-foreground transition-all hover:bg-white/5 hover:text-foreground"
    >
      {children}
    </button>
  );
}
