import { useState } from "react";
import {
  Wand2, Eraser, Sparkles, Plus, X, Dices, Zap,
  ChevronDown, Square, RectangleHorizontal, RectangleVertical, Monitor,
  Check, Image as ImageIcon,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";

const MODELS = [
  { id: "flux", name: "Flux.1 Pro", desc: "Photoreal · Cinematic", tag: "HOT" },
  { id: "mj6", name: "Midjourney V6", desc: "Artistic · Stylized", tag: "VIP" },
  { id: "sdxl", name: "SDXL Turbo", desc: "Realtime · 1s", tag: "Fast" },
  { id: "nano", name: "Nano Banana", desc: "Lite drafts", tag: null },
];
const RATIOS = [
  { id: "1:1", icon: Square, label: "Square" },
  { id: "16:9", icon: RectangleHorizontal, label: "Landscape" },
  { id: "9:16", icon: RectangleVertical, label: "Portrait" },
  { id: "3:4", icon: RectangleVertical, label: "Photo" },
  { id: "4:3", icon: Monitor, label: "Classic" },
];

type Props = { onGenerate: () => void; generating: boolean };

export function ControlPanel({ onGenerate, generating }: Props) {
  const [model, setModel] = useState("flux");
  const [ratio, setRatio] = useState("1:1");
  const [refs, setRefs] = useState<(string | null)[]>([null, null, null, null, null]);
  const [prompt, setPrompt] = useState(
    "Surreal cyberpunk garden at dusk, bioluminescent flora pulsing with emerald light, cinematic wide angle, ultra-detailed",
  );
  const [cfg, setCfg] = useState([7.5]);
  const [steps, setSteps] = useState([32]);

  const activeModel = MODELS.find((m) => m.id === model)!;
  const activeRatio = RATIOS.find((r) => r.id === ratio)!;
  const ActiveRatioIcon = activeRatio.icon;

  const setRef = (i: number, url: string | null) => {
    setRefs((arr) => arr.map((v, idx) => (idx === i ? url : v)));
  };
  const onPick = (i: number) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) setRef(i, URL.createObjectURL(f));
  };

  return (
    <aside className="scrollbar-thin flex h-screen flex-col overflow-y-auto border-r border-border/60 bg-card/40">
      <div className="flex flex-col gap-5 p-5 pt-6">

        {/* Reference images — top */}
        <section>
          <div className="mb-2 flex items-center justify-between">
            <Label>References · img2img</Label>
            <span className="text-[10px] font-light text-muted-foreground">
              {refs.filter(Boolean).length}/5
            </span>
          </div>
          <div className="grid grid-cols-5 gap-2">
            {refs.map((url, i) => (
              <RefSlot key={i} url={url} onPick={onPick(i)} onClear={() => setRef(i, null)} />
            ))}
          </div>
        </section>

        {/* Prompt core */}
        <section>
          <Label>Prompt</Label>
          <div className="group rounded-2xl border border-border bg-input/40 transition-all focus-within:border-primary/50 focus-within:shadow-glow">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={5}
              placeholder="Describe the image you want to create…"
              className="block w-full resize-none rounded-2xl bg-transparent px-4 py-3.5 text-sm font-light leading-relaxed placeholder:text-muted-foreground/50 focus:outline-none"
            />
            <div className="flex items-center justify-between gap-2 border-t border-border/50 px-2.5 py-2">
              <div className="flex items-center gap-1">
                {/* Model popover */}
                <Popover>
                  <PopoverTrigger asChild>
                    <button className="flex items-center gap-1.5 rounded-lg border border-border bg-white/[0.03] px-2.5 py-1.5 text-[11px] font-medium transition-colors hover:border-primary/40 hover:bg-primary/[0.05]">
                      <Sparkles className="h-3 w-3 text-primary" />
                      {activeModel.name}
                      <ChevronDown className="h-3 w-3 text-muted-foreground" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-64 border-border bg-popover/95 p-1.5 backdrop-blur-xl">
                    <div className="px-2 py-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                      Choose model
                    </div>
                    {MODELS.map((m) => {
                      const active = m.id === model;
                      return (
                        <button
                          key={m.id}
                          onClick={() => setModel(m.id)}
                          className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors ${
                            active ? "bg-primary/10" : "hover:bg-white/5"
                          }`}
                        >
                          <div className={`flex h-7 w-7 items-center justify-center rounded-md ${
                            active ? "bg-gradient-aurora text-primary-foreground" : "bg-white/5 text-muted-foreground"
                          }`}>
                            <Sparkles className="h-3.5 w-3.5" />
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className={`text-xs font-medium ${active ? "text-primary" : ""}`}>{m.name}</span>
                              {m.tag && (
                                <span className={`rounded px-1 py-px text-[8px] font-bold uppercase ${
                                  m.tag === "VIP" ? "bg-gradient-aurora text-primary-foreground"
                                  : m.tag === "HOT" ? "bg-destructive/80 text-white"
                                  : "bg-white/10 text-foreground/70"
                                }`}>{m.tag}</span>
                              )}
                            </div>
                            <div className="text-[10px] font-light text-muted-foreground">{m.desc}</div>
                          </div>
                          {active && <Check className="h-3.5 w-3.5 text-primary" />}
                        </button>
                      );
                    })}
                  </PopoverContent>
                </Popover>

                {/* Ratio popover */}
                <Popover>
                  <PopoverTrigger asChild>
                    <button className="flex items-center gap-1.5 rounded-lg border border-border bg-white/[0.03] px-2.5 py-1.5 text-[11px] font-medium transition-colors hover:border-primary/40 hover:bg-primary/[0.05]">
                      <ActiveRatioIcon className="h-3 w-3" />
                      {ratio}
                      <ChevronDown className="h-3 w-3 text-muted-foreground" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-auto border-border bg-popover/95 p-2 backdrop-blur-xl">
                    <div className="mb-1.5 px-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                      Aspect ratio
                    </div>
                    <div className="grid grid-cols-5 gap-1.5">
                      {RATIOS.map((r) => {
                        const Icon = r.icon;
                        const active = ratio === r.id;
                        return (
                          <button
                            key={r.id}
                            onClick={() => setRatio(r.id)}
                            className={`flex flex-col items-center gap-1 rounded-lg border px-2.5 py-2 transition-all ${
                              active ? "border-primary/50 bg-primary/10 text-primary"
                              : "border-border bg-white/[0.02] text-muted-foreground hover:bg-white/5"
                            }`}
                          >
                            <Icon className="h-3.5 w-3.5" strokeWidth={1.5} />
                            <span className="font-mono text-[9px]">{r.id}</span>
                          </button>
                        );
                      })}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>

              <div className="flex items-center gap-1">
                <span className="px-1 font-mono text-[10px] font-light text-muted-foreground">
                  {prompt.length}
                </span>
                <IconBtn onClick={() => setPrompt("")} title="Clear"><Eraser className="h-3.5 w-3.5" /></IconBtn>
                <IconBtn title="Inspire"><Dices className="h-3.5 w-3.5 text-primary" /></IconBtn>
              </div>
            </div>
          </div>
        </section>

        {/* Advanced sliders */}
        <section className="space-y-3.5">
          <Label>Advanced</Label>
          <SliderRow label="CFG Scale" value={cfg[0]} onChange={setCfg} min={1} max={20} step={0.5} hint="Prompt adherence" />
          <SliderRow label="Steps" value={steps[0]} onChange={setSteps} min={10} max={80} step={1} hint="Render quality" />
        </section>
      </div>

      {/* Generate */}
      <div className="sticky bottom-0 mt-auto border-t border-border/60 bg-background/85 p-4 backdrop-blur-xl">
        <button
          onClick={onGenerate}
          disabled={generating}
          className="group relative flex w-full items-center justify-between gap-2 overflow-hidden rounded-2xl bg-gradient-aurora px-5 py-3.5 text-sm font-bold text-primary-foreground shadow-glow transition-all hover:brightness-110 active:scale-[0.99] disabled:opacity-70"
        >
          <div className="flex items-center gap-2">
            {generating ? (
              <>
                <Sparkles className="h-4 w-4 animate-spin" />
                Generating…
              </>
            ) : (
              <>
                <Wand2 className="h-4 w-4" strokeWidth={2.5} />
                Generate now
              </>
            )}
          </div>
          <span className="flex items-center gap-1 rounded-lg bg-black/25 px-2 py-1 font-mono text-[10px]">
            <Zap className="h-2.5 w-2.5" fill="currentColor" /> 2 pts
          </span>
        </button>
      </div>
    </aside>
  );
}

function RefSlot({ url, onPick, onClear }: {
  url: string | null; onPick: (e: React.ChangeEvent<HTMLInputElement>) => void; onClear: () => void;
}) {
  if (url) {
    return (
      <div className="group relative aspect-square overflow-hidden rounded-xl border border-border bg-surface">
        <img src={url} alt="ref" className="h-full w-full object-cover" />
        <button
          onClick={onClear}
          className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-white opacity-0 backdrop-blur transition-opacity group-hover:opacity-100 hover:bg-destructive"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    );
  }
  return (
    <label className="group flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border bg-white/[0.015] transition-all hover:border-primary/50 hover:bg-primary/[0.04] hover:shadow-glow">
      <Plus className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-primary" strokeWidth={1.5} />
      <ImageIcon className="hidden h-2.5 w-2.5 text-muted-foreground" />
      <input type="file" accept="image/*" className="hidden" onChange={onPick} />
    </label>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
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
          <span className="ml-2 text-[10px] font-light text-muted-foreground">{hint}</span>
        </div>
        <span className="font-mono text-xs font-semibold text-primary">{value}</span>
      </div>
      <Slider value={[value]} onValueChange={onChange} min={min} max={max} step={step} />
    </div>
  );
}
