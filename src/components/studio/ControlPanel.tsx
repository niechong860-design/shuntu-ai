import { useEffect, useState } from "react";
import {
  Wand2, Eraser, Sparkles, Plus, X, Dices, Zap,
  ChevronDown, Square, RectangleHorizontal, RectangleVertical, Monitor,
  Check,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { useServerFn } from "@tanstack/react-start";
import { listModelsConfig, generateImage } from "@/lib/admin.functions";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

type ModelCfg = {
  id: string; model_key: string; name: string; description: string | null; cost: number;
};

const RATIOS = [
  { id: "1:1", icon: Square, label: "方形" },
  { id: "16:9", icon: RectangleHorizontal, label: "横屏" },
  { id: "9:16", icon: RectangleVertical, label: "竖屏" },
  { id: "3:4", icon: RectangleVertical, label: "照片" },
  { id: "4:3", icon: Monitor, label: "经典" },
];

type Props = {
  onGenerateStart: () => void;
  onGenerateDone: (imageUrl: string | null) => void;
  generating: boolean;
};

export function ControlPanel({ onGenerateStart, onGenerateDone, generating }: Props) {
  const fetchModels = useServerFn(listModelsConfig);
  const generate = useServerFn(generateImage);
  const { refreshProfile, session } = useAuth();

  const [models, setModels] = useState<ModelCfg[]>([]);
  const [modelKey, setModelKey] = useState<string>("");
  const [ratio, setRatio] = useState("1:1");
  const [refs, setRefs] = useState<string[]>([]);
  const [prompt, setPrompt] = useState(
    "黄昏时分的超现实赛博朋克花园，生物荧光植物散发翠绿光芒，电影级广角，超精细细节",
  );
  const [cfg, setCfg] = useState([7.5]);
  const [steps, setSteps] = useState([32]);

  useEffect(() => {
    if (!session) return;
    fetchModels({}).then((data) => {
      const list = (data ?? []) as ModelCfg[];
      setModels(list);
      if (list[0] && !modelKey) setModelKey(list[0].model_key);
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  const activeModel = models.find((m) => m.model_key === modelKey);
  const activeRatio = RATIOS.find((r) => r.id === ratio)!;
  const ActiveRatioIcon = activeRatio.icon;
  const activeCost = Number(activeModel?.cost ?? 0);

  const addRef = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f && refs.length < 5) setRefs((arr) => [...arr, URL.createObjectURL(f)]);
    e.target.value = "";
  };
  const removeRef = (i: number) => setRefs((arr) => arr.filter((_, idx) => idx !== i));

  const handleGenerate = async () => {
    if (generating || !activeModel) return;
    onGenerateStart();
    try {
      const httpRefs = refs.filter((u) => /^https?:\/\//i.test(u));
      const r = await generate({ data: {
        modelKey: activeModel.model_key,
        prompt,
        aspectRatio: ratio,
        referenceImages: httpRefs.length ? httpRefs : undefined,
      }});
      toast.success(`生成成功 · 扣除 ${r.cost} 点，剩余 ${r.credits}`);
      await refreshProfile();
      onGenerateDone(r.imageUrl);
    } catch (e: any) {
      toast.error(e.message ?? "生成失败");
      onGenerateDone(null);
    }
  };

  return (
    <aside className="flex h-full min-h-0 flex-col overflow-hidden border-r border-border/60 bg-card/40">
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 scrollbar-thin">

        {/* Reference images — top */}
        <section>
          <div className="mb-2 flex items-center justify-between">
            <Label>参考图 · 图生图</Label>
            <span className="text-[10px] font-light text-muted-foreground">
              {refs.length}/5
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {refs.map((url, i) => (
              <div key={i} className="group relative h-20 w-20 overflow-hidden rounded-xl border border-border bg-surface">
                <img src={url} alt="ref" className="h-full w-full object-cover" />
                <button
                  onClick={() => removeRef(i)}
                  className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-white opacity-0 backdrop-blur transition-opacity group-hover:opacity-100 hover:bg-destructive"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
            {refs.length < 5 && (
              <label className="group flex h-20 w-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border bg-white/[0.015] transition-all hover:border-primary/50 hover:bg-primary/[0.04] hover:shadow-glow">
                <Plus className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-primary" strokeWidth={1.5} />
                <input type="file" accept="image/*" className="hidden" onChange={addRef} />
              </label>
            )}
          </div>
        </section>

        {/* Prompt core */}
        <section>
          <Label>提示词</Label>
          <div className="group rounded-2xl border border-border bg-input/40 transition-all focus-within:border-primary/50 focus-within:shadow-glow">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={3}
              placeholder="描述你想要生成的画面…"
              className="block w-full resize-none rounded-2xl bg-transparent px-4 py-3.5 text-sm font-light leading-relaxed placeholder:text-muted-foreground/50 focus:outline-none"
            />
            <div className="flex items-center justify-between gap-2 border-t border-border/50 px-2.5 py-2">
              <div className="flex items-center gap-1">
                {/* Model popover */}
                <Popover>
                  <PopoverTrigger asChild>
                    <button className="flex items-center gap-1.5 rounded-lg border border-border bg-white/[0.03] px-2.5 py-1.5 text-[11px] font-medium transition-colors hover:border-primary/40 hover:bg-primary/[0.05]">
                      <Sparkles className="h-3 w-3 text-primary" />
                      {activeModel?.name ?? "选择模型"}
                      <ChevronDown className="h-3 w-3 text-muted-foreground" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-72 border-border bg-popover/95 p-1.5 backdrop-blur-xl">
                    <div className="px-2 py-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                      选择模型
                    </div>
                    {models.length === 0 && (
                      <div className="px-2 py-3 text-center text-[11px] text-muted-foreground">加载中…</div>
                    )}
                    {models.map((m) => {
                      const active = m.model_key === modelKey;
                      return (
                        <button
                          key={m.id}
                          onClick={() => setModelKey(m.model_key)}
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
                              <span className="ml-auto rounded bg-white/5 px-1.5 py-px font-mono text-[9px] text-primary">
                                {Number(m.cost)} 点
                              </span>
                            </div>
                            {m.description && (
                              <div className="text-[10px] font-light text-muted-foreground">{m.description}</div>
                            )}
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
                      画面比例
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
                <IconBtn onClick={() => setPrompt("")} title="清空"><Eraser className="h-3.5 w-3.5" /></IconBtn>
                <IconBtn title="灵感"><Dices className="h-3.5 w-3.5 text-primary" /></IconBtn>
              </div>
            </div>
          </div>
        </section>

        {/* Advanced sliders */}
        <section className="space-y-3.5">
          <Label>高级参数</Label>
          <SliderRow label="CFG 引导强度" value={cfg[0]} onChange={setCfg} min={1} max={20} step={0.5} hint="提示词贴合度" />
          <SliderRow label="采样步数" value={steps[0]} onChange={setSteps} min={10} max={80} step={1} hint="渲染质量" />
        </section>
      </div>

      {/* Generate */}
      <div className="sticky bottom-0 mt-auto border-t border-border/60 bg-background/85 p-4 backdrop-blur-xl">
        <button
          onClick={handleGenerate}
          disabled={generating || !activeModel}
          className="group relative flex w-full items-center justify-between gap-2 overflow-hidden rounded-2xl bg-gradient-aurora px-5 py-3.5 text-sm font-bold text-primary-foreground shadow-glow transition-all hover:brightness-110 active:scale-[0.99] disabled:opacity-70"
        >
          <div className="flex items-center gap-2">
            {generating ? (
              <>
                <Sparkles className="h-4 w-4 animate-spin" />
                生成中…
              </>
            ) : (
              <>
                <Wand2 className="h-4 w-4" strokeWidth={2.5} />
                立即生成
              </>
            )}
          </div>
          <span className="flex items-center gap-1 rounded-lg bg-black/25 px-2 py-1 font-mono text-[10px]">
            <Zap className="h-2.5 w-2.5" fill="currentColor" /> 消耗 {activeCost} 点
          </span>
        </button>
      </div>
    </aside>
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
