import { useState } from "react";
import {
  Wand2, Eraser, Sparkles, Upload, Square, RectangleHorizontal,
  RectangleVertical, Monitor, Zap, Plus, Dices, MinusCircle,
} from "lucide-react";
import { Slider } from "@/components/ui/slider";

const MODELS = [
  { id: "flux", name: "Flux.1 Pro", tag: "HOT", desc: "Photoreal · Cinematic" },
  { id: "mj6", name: "Midjourney V6", tag: "VIP", desc: "Artistic · Stylized" },
  { id: "sdxl", name: "SDXL Turbo", tag: "Fast", desc: "Realtime · 1s" },
  { id: "nano", name: "Nano Banana", tag: null, desc: "Lite · Drafts" },
];
const RATIOS = [
  { id: "1:1", icon: Square }, { id: "16:9", icon: RectangleHorizontal },
  { id: "9:16", icon: RectangleVertical }, { id: "3:4", icon: RectangleVertical },
  { id: "4:3", icon: Monitor },
];
const QUALITIES = [
  { id: "1k", label: "1K", sub: "Preview" },
  { id: "2k", label: "2K", sub: "Standard" },
  { id: "4k", label: "4K", sub: "Ultra" },
];

type Props = { credits: number; onGenerate: () => void; generating: boolean };

export function ControlPanel({ credits, onGenerate, generating }: Props) {
  const [model, setModel] = useState("flux");
  const [ratio, setRatio] = useState("1:1");
  const [quality, setQuality] = useState("2k");
  const [cfg, setCfg] = useState([7.5]);
  const [steps, setSteps] = useState([32]);
  const [prompt, setPrompt] = useState(
    "Surreal cyberpunk garden at dusk, bioluminescent plants pulsing with emerald light, cinematic wide angle, ultra detailed, 8k",
  );
  const [neg, setNeg] = useState("blurry, lowres, watermark, text, deformed");

  return (
    <aside className="scrollbar-thin glass flex h-screen flex-col overflow-y-auto border-r border-border/60">
      {/* Header */}
      <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border/60 bg-background/70 px-5 py-3.5 backdrop-blur-xl">
        <div className="flex items-center gap-2.5">
          <div className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-aurora shadow-glow">
            <Sparkles className="h-4 w-4 text-primary-foreground" strokeWidth={2.5} />
          </div>
          <div className="font-display text-base font-semibold tracking-tight">
            Lumen<span className="text-gradient-aurora">.</span>Studio
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-full border border-border bg-white/[0.03] px-2.5 py-1">
            <Zap className="h-3 w-3 text-primary" fill="currentColor" />
            <span className="font-mono text-xs font-semibold tabular-nums">{credits}</span>
            <span className="text-[10px] text-muted-foreground">pts</span>
          </div>
          <button className="flex items-center gap-1 rounded-full bg-gradient-aurora px-2.5 py-1 text-[11px] font-semibold text-primary-foreground shadow-glow transition-transform hover:scale-[1.04]">
            <Plus className="h-3 w-3" strokeWidth={3} /> Top up
          </button>
        </div>
      </header>

      <div className="flex flex-col gap-5 p-5 pb-3">
        {/* Models */}
        <section>
          <Label>Model</Label>
          <div className="grid grid-cols-2 gap-2">
            {MODELS.map((m) => {
              const active = model === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => setModel(m.id)}
                  className={`relative rounded-xl border p-2.5 text-left transition-all ${
                    active
                      ? "border-primary/50 bg-primary/[0.07] shadow-glow"
                      : "border-border bg-white/[0.02] hover:bg-white/[0.05]"
                  }`}
                >
                  {active && (
                    <span className="absolute -top-1 -right-1 flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                    </span>
                  )}
                  <div className="flex items-center justify-between">
                    <span className={`text-xs font-semibold ${active ? "text-primary" : ""}`}>{m.name}</span>
                    {m.tag && (
                      <span className={`rounded px-1 py-px text-[8px] font-bold uppercase tracking-wider ${
                        m.tag === "VIP" ? "bg-gradient-aurora text-primary-foreground"
                        : m.tag === "HOT" ? "bg-destructive/80 text-white"
                        : "bg-white/10 text-foreground/70"
                      }`}>{m.tag}</span>
                    )}
                  </div>
                  <div className="mt-0.5 text-[10px] text-muted-foreground">{m.desc}</div>
                </button>
              );
            })}
          </div>
        </section>

        {/* Prompt */}
        <section>
          <Label>Prompt</Label>
          <div className="rounded-xl border border-border bg-input/30 transition-colors focus-within:border-primary/50">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={4}
              placeholder="Describe what you want to create…"
              className="block w-full resize-none rounded-xl bg-transparent px-3.5 py-3 text-sm leading-relaxed placeholder:text-muted-foreground/60 focus:outline-none"
            />
            <div className="flex items-center justify-between border-t border-border/60 px-2.5 py-1.5">
              <span className="px-1 font-mono text-[10px] text-muted-foreground">{prompt.length}/2000</span>
              <div className="flex items-center gap-1">
                <IconBtn onClick={() => setPrompt("")} title="Clear"><Eraser className="h-3.5 w-3.5" /></IconBtn>
                <IconBtn title="Inspire"><Dices className="h-3.5 w-3.5 text-primary" /></IconBtn>
              </div>
            </div>
          </div>
        </section>

        {/* Negative prompt */}
        <section>
          <Label>
            <span className="flex items-center gap-1.5"><MinusCircle className="h-3 w-3" /> Negative prompt</span>
          </Label>
          <textarea
            value={neg}
            onChange={(e) => setNeg(e.target.value)}
            rows={2}
            placeholder="What to avoid…"
            className="block w-full resize-none rounded-xl border border-border bg-input/30 px-3.5 py-2.5 text-xs leading-relaxed placeholder:text-muted-foreground/60 focus:border-primary/50 focus:outline-none"
          />
        </section>

        {/* Aspect ratio */}
        <section>
          <Label>Aspect ratio</Label>
          <div className="grid grid-cols-5 gap-1.5">
            {RATIOS.map((r) => {
              const Icon = r.icon;
              const active = ratio === r.id;
              return (
                <button
                  key={r.id}
                  onClick={() => setRatio(r.id)}
                  className={`flex flex-col items-center justify-center gap-1 rounded-lg border py-2 transition-all ${
                    active ? "border-primary/50 bg-primary/10 text-primary"
                    : "border-border bg-white/[0.02] text-muted-foreground hover:bg-white/[0.05] hover:text-foreground"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
                  <span className="font-mono text-[9px]">{r.id}</span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Quality */}
        <section>
          <Label>Resolution &amp; quality</Label>
          <div className="flex gap-1.5 rounded-xl border border-border bg-white/[0.02] p-1">
            {QUALITIES.map((q) => {
              const active = quality === q.id;
              return (
                <button
                  key={q.id}
                  onClick={() => setQuality(q.id)}
                  className={`flex flex-1 flex-col items-center rounded-lg py-2 transition-all ${
                    active ? "bg-gradient-aurora font-semibold text-primary-foreground shadow-glow"
                    : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                  }`}
                >
                  <span className="font-mono text-xs font-bold">{q.label}</span>
                  <span className="text-[9px] opacity-80">{q.sub}</span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Advanced sliders */}
        <section className="space-y-3.5">
          <Label>Advanced</Label>
          <SliderRow label="CFG Scale" value={cfg[0]} onChange={setCfg} min={1} max={20} step={0.5} hint="Prompt adherence" />
          <SliderRow label="Steps" value={steps[0]} onChange={setSteps} min={10} max={80} step={1} hint="Render quality" />
        </section>

        {/* Reference */}
        <section>
          <Label>Reference image (img2img)</Label>
          <label className="group flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-white/[0.015] px-4 py-5 transition-all hover:border-primary/40 hover:bg-primary/[0.03]">
            <div className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-white/5 group-hover:border-primary/40 group-hover:bg-primary/10">
              <Upload className="h-4 w-4 text-muted-foreground group-hover:text-primary" strokeWidth={1.75} />
            </div>
            <div className="text-center">
              <div className="text-xs font-medium">Drop image or click to upload</div>
              <div className="mt-0.5 text-[10px] text-muted-foreground">PNG · JPG · WebP — up to 10MB</div>
            </div>
            <input type="file" accept="image/*" className="hidden" />
          </label>
        </section>
      </div>

      {/* Generate button - sticky bottom */}
      <div className="sticky bottom-0 mt-auto border-t border-border/60 bg-background/80 p-4 backdrop-blur-xl">
        <button
          onClick={onGenerate}
          disabled={generating}
          className="group relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-aurora px-4 py-3.5 text-sm font-bold text-primary-foreground shadow-glow transition-all hover:brightness-110 active:scale-[0.99] disabled:opacity-70"
        >
          {generating ? (
            <>
              <Sparkles className="h-4 w-4 animate-spin" />
              Generating…
            </>
          ) : (
            <>
              <Wand2 className="h-4 w-4" strokeWidth={2.5} />
              Generate now
              <span className="flex items-center gap-1 rounded-md bg-black/25 px-2 py-0.5 font-mono text-[10px]">
                <Zap className="h-2.5 w-2.5" fill="currentColor" /> −2 pts
              </span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
      {children}
    </div>
  );
}
function IconBtn({ children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button {...rest} className="rounded-md p-1.5 text-muted-foreground transition-all hover:bg-white/5 hover:text-foreground">
      {children}
    </button>
  );
}
function SliderRow({ label, value, onChange, min, max, step, hint }: {
  label: string; value: number; onChange: (v: number[]) => void;
  min: number; max: number; step: number; hint: string;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <div>
          <span className="text-xs font-medium">{label}</span>
          <span className="ml-2 text-[10px] text-muted-foreground">{hint}</span>
        </div>
        <span className="font-mono text-xs font-semibold text-primary">{value}</span>
      </div>
      <Slider value={[value]} onValueChange={onChange} min={min} max={max} step={step} />
    </div>
  );
}
