import { useEffect, useState } from "react";
import {
  Wand2, Eraser, Sparkles, Plus, X, Dices, Zap,
  ChevronDown, Square, RectangleHorizontal, RectangleVertical, Monitor,
  Check, ImageIcon, Crown, Flame, Star,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { useServerFn } from "@tanstack/react-start";
import { listModelsConfig, generateImage, checkImageStatus, generateRandomPrompt } from "@/lib/admin.functions";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { consumeStudioPrefill } from "@/lib/studio-prefill";
import { processImage, validateImageFile } from "@/lib/image-processing";
import { thumbUrl } from "@/lib/image-url";
import { checkPromptSafety, SAFETY_BLOCK_MESSAGE } from "@/lib/promptSafety";
import { STYLE_TEMPLATES, applyStyleSuffix, type StyleTemplate } from "@/lib/style-templates";
import { toast } from "sonner";


type ModelCfg = {
  id: string; model_key: string; name: string; description: string | null; cost: number;
};

const RATIOS = [
  { id: "auto", icon: Sparkles, label: "自适应" },
  { id: "1:1", icon: Square, label: "方形" },
  { id: "16:9", icon: RectangleHorizontal, label: "横版" },
  { id: "9:16", icon: RectangleVertical, label: "竖版" },
  { id: "4:3", icon: RectangleHorizontal, label: "横版" },
  { id: "3:4", icon: RectangleVertical, label: "竖版" },
  { id: "21:9", icon: RectangleHorizontal, label: "影院" },
  { id: "3:2", icon: RectangleHorizontal, label: "横版" },
  { id: "2:3", icon: RectangleVertical, label: "竖版" },
  { id: "5:4", icon: RectangleHorizontal, label: "横版" },
  { id: "4:5", icon: RectangleVertical, label: "竖版" },
];

type StyleTpl = StyleTemplate;

export type GenProgress = {
  stage: "submitting" | "queued" | "rendering" | "polling";
  attempt: number;
  elapsedSec: number;
  taskId?: string;
  message?: string;
  /** 任务初始排队位置（在 storage 中持久化，保证刷新后 UI 一致） */
  initialPos?: number;
  /** 模拟渲染时长（秒），用于刷新后保持渲染百分比一致 */
  renderBudget?: number;
};

const ACTIVE_GEN_KEY = "lovable-active-gen-v1";

const MODEL_BADGES: Record<string, { label: string; icon: typeof Crown; className: string }> = {
  nanobanana_pro: { label: "最强", icon: Crown, className: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  "gpt-image-2": { label: "最火", icon: Flame, className: "bg-rose-500/15 text-rose-400 border-rose-500/30" },
  nanobanana2: { label: "推荐", icon: Star, className: "bg-primary/15 text-primary border-primary/30" },
};
type ActiveGen = {
  taskId: string;
  modelKey: string;
  modelName: string;
  prompt: string;
  startTs: number;
  initialPos: number;
  renderBudget: number;
};
function loadActive(): ActiveGen | null {
  try {
    const raw = localStorage.getItem(ACTIVE_GEN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ActiveGen;
    if (!parsed?.taskId || !parsed?.startTs) return null;
    // 超过 10 分钟视为过期
    if (Date.now() - parsed.startTs > 10 * 60 * 1000) return null;
    return parsed;
  } catch {
    return null;
  }
}
function saveActive(v: ActiveGen) {
  try { localStorage.setItem(ACTIVE_GEN_KEY, JSON.stringify(v)); } catch {}
}
function clearActive() {
  try { localStorage.removeItem(ACTIVE_GEN_KEY); } catch {}
}


type Props = {
 onGenerateStart: (info: { prompt: string; modelName: string }) => void;
 onGenerateDone: (imageUrl: string | null) => void;
  onProgress?: (p: GenProgress | null) => void;
  generating: boolean;
};

export function ControlPanel({ onGenerateStart, onGenerateDone, onProgress, generating }: Props) {
  const fetchModels = useServerFn(listModelsConfig);
  const generate = useServerFn(generateImage);
  const checkStatus = useServerFn(checkImageStatus);
  const randomPromptFn = useServerFn(generateRandomPrompt);
  const [inspiring, setInspiring] = useState(false);
  const { refreshProfile, session } = useAuth();

  const [models, setModels] = useState<ModelCfg[]>([]);
  const [modelKey, setModelKey] = useState<string>("");
  const [ratio, setRatio] = useState("1:1");
  const [size, setSize] = useState<"1K" | "2K" | "4K">("1K");
  const [modelOpen, setModelOpen] = useState(false);
  const [ratioOpen, setRatioOpen] = useState(false);
  const [sizeOpen, setSizeOpen] = useState(false);
  const [refs, setRefs] = useState<string[]>([]);
  const [prompt, setPrompt] = useState("");
  const [styleId, setStyleId] = useState<string>("");
  const [styles] = useState<StyleTpl[]>(STYLE_TEMPLATES);
  const [inspirationMode, setInspirationMode] = useState(false);
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

  // Apply a one-shot prefill payload coming from the inspiration plaza ("一键复用")
  useEffect(() => {
    const p = consumeStudioPrefill();
    if (!p) return;
    if (typeof p.prompt === "string") setPrompt(p.prompt);
    if (p.aspectRatio) setRatio(p.aspectRatio);
    if (p.size) setSize(p.size);
    if (p.modelKey) setModelKey(p.modelKey);
    if (p.fromInspiration) {
      // 灵感广场优先：清空风格模板，避免提示词冲突
      setStyleId("");
      setInspirationMode(true);
    } else if (p.styleId) {
      setStyleId(p.styleId);
    }
    toast.success("已载入案例参数，可直接生成");
  }, []);


  const activeModel = models.find((m) => m.model_key === modelKey);
  const activeRatio = RATIOS.find((r) => r.id === ratio)!;
  const ActiveRatioIcon = activeRatio.icon;
  const activeCost = Number(activeModel?.cost ?? 0);
  // 仅文生图的模型：禁止参考图（前端隐藏入口 + 提交时不带 refs）
  const TEXT_ONLY_MODELS = new Set(["wan26"]);
  const isTextOnly = activeModel ? TEXT_ONLY_MODELS.has(activeModel.model_key) : false;
  // 切换到仅文生图模型时，自动清空已有参考图，避免残留
  useEffect(() => {
    if (isTextOnly && refs.length > 0) setRefs([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTextOnly]);

  const [uploadingRef, setUploadingRef] = useState(false);

  const addRef = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (refs.length >= 5) {
      toast.error("最多上传 5 张参考图");
      return;
    }
    const uid = session?.user?.id;
    if (!uid) {
      toast.error("请先登录后再上传参考图");
      return;
    }
    const invalid = validateImageFile(f, { preset: "ai-model", maxMB: 15 });
    if (invalid) {
      toast.error(invalid);
      return;
    }

    // Instant local preview — show immediately so the UI never feels blocked.
    const previewUrl = URL.createObjectURL(f);
    const placeholderIdx = refs.length;
    setRefs((arr) => [...arr, previewUrl]);
    setUploadingRef(true);

    // Process + upload async — never blocks the UI thread for long.
    (async () => {
      try {
        const processed = await processImage(f, "ai-model");
        const path = `${uid}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${processed.ext}`;
        const { error: upErr } = await supabase.storage
          .from("reference-images")
          .upload(path, processed.blob, {
            cacheControl: "3600",
            contentType: processed.contentType,
            upsert: false,
          });
        if (upErr) throw upErr;
        const { data: signed, error: signErr } = await supabase.storage
          .from("reference-images")
          .createSignedUrl(path, 60 * 60 * 24 * 7); // 7 days, long enough for generation
        if (signErr) throw signErr;
        const url = signed.signedUrl;
        console.log(
          `[ref upload] ${(processed.originalSize / 1024).toFixed(0)}KB → ${(processed.processedSize / 1024).toFixed(0)}KB →`,
          url,
        );
        setRefs((arr) => {
          const next = [...arr];
          // Replace by index when possible; otherwise append.
          if (next[placeholderIdx] === previewUrl) next[placeholderIdx] = url;
          else {
            const idx = next.indexOf(previewUrl);
            if (idx >= 0) next[idx] = url;
            else next.push(url);
          }
          return next;
        });
      } catch (err) {
        console.error("[ref upload] failed", err);
        toast.error("参考图上传失败，请重试");
        setRefs((arr) => arr.filter((u) => u !== previewUrl));
      } finally {
        URL.revokeObjectURL(previewUrl);
        setUploadingRef(false);
      }
    })();
  };
  const removeRef = (i: number) => setRefs((arr) => arr.filter((_, idx) => idx !== i));

  // 轮询任务到完成。tStart 是任务开始时间戳（毫秒），用于刷新后从持久化时间继续计算 elapsed
  const pollTask = async (args: {
    taskId: string;
    modelName: string;
    tStart: number;
    initialPos: number;
    renderBudget: number;
  }) => {
    const { taskId, modelName, tStart, initialPos, renderBudget } = args;
    const elapsed = () => Math.floor((Date.now() - tStart) / 1000);
    const POLL_INTERVAL = 5000;
    const MAX_DURATION_MS = 5 * 60 * 1000;
    const MAX_TRANSIENT_RETRIES = 3;
    let transientRetries = 0;
    let attempt = 0;
    onProgress?.({
      stage: "queued", attempt: 0, elapsedSec: elapsed(), taskId,
      initialPos, renderBudget,
      message: "已进入队列，等待算力分配…",
    });
    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (Date.now() - tStart > MAX_DURATION_MS) {
        toast.error(`AI 生成任务超时，请检查网络或稍后重新提交（任务 ID: ${taskId}）`, { duration: 8000 });
        clearActive();
        onProgress?.(null);
        onGenerateDone(null);
        return;
      }
      await new Promise((res) => setTimeout(res, POLL_INTERVAL));
      attempt += 1;
      try {
        const s = await checkStatus({ data: { taskId, modelName } });
        if (s.status === "success" && s.imageUrl) {
          clearActive();
          onProgress?.(null);
          onGenerateDone(s.imageUrl);
          return;
        }
        if (s.status === "failed") {
          console.warn("[checkImageStatus failed]", { taskId, reason: (s as any).reason, message: s.message });
          if ((s as any).reason === "ref_url") {
            toast.error(`参考图读取失败，请检查链接是否为公开的 HTTPS 链接${s.message ? ` · ${s.message}` : ""}`, { duration: 8000 });
          } else if ((s as any).reason === "rejected" || (s as any).taskStatus === 3) {
            toast.error(`生成任务失败（任务被拒绝或涉及合规限制，请尝试更换提示词）${s.message ? ` · ${s.message}` : ""}`, { duration: 8000 });
          } else {
            toast.error(`生成失败：${s.message ?? "上游服务异常，请稍后重试"}`, { duration: 6000 });
          }
          clearActive();
          onProgress?.(null);
          onGenerateDone(null);
          return;
        }
        transientRetries = 0;
        onProgress?.({
          stage: "rendering", attempt, elapsedSec: elapsed(), taskId,
          initialPos, renderBudget,
          message: "AI 正在渲染图像，请稍候…",
        });
      } catch (pollErr: any) {
        const msg = pollErr?.message ?? "";
        console.warn("[checkImageStatus network error]", pollErr);
        const isTransient = /network|fetch|timeout|500|502|503|504/i.test(msg) || !msg;
        if (isTransient && transientRetries < MAX_TRANSIENT_RETRIES) {
          transientRetries += 1;
          onProgress?.({
            stage: "polling", attempt, elapsedSec: elapsed(), taskId,
            initialPos, renderBudget,
            message: `网络抖动，自动重试 (${transientRetries}/${MAX_TRANSIENT_RETRIES})…`,
          });
          continue;
        }
        let m = "生成失败，请稍后再试";
        try {
          const raw = pollErr?.message ?? pollErr?.error ?? pollErr?.toString?.() ?? "";
          const text = typeof raw === "string" ? raw : JSON.stringify(raw);
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            m = parsed?.message || parsed?.error || parsed?.msg || text;
          } else if (text) m = text;
        } catch {}
        toast.error(m, { duration: 6000 });
        clearActive();
        onProgress?.(null);
        onGenerateDone(null);
        return;
      }
    }
  };

  // 刷新后自动恢复在途的生成任务
  useEffect(() => {
    if (!session) return;
    const active = loadActive();
    if (!active) return;
    console.log("[resume] restoring in-flight task", active.taskId);
    onGenerateStart({ prompt: active.prompt, modelName: active.modelName });
    onProgress?.({
      stage: "queued",
      attempt: 0,
      elapsedSec: Math.floor((Date.now() - active.startTs) / 1000),
      taskId: active.taskId,
      initialPos: active.initialPos,
      renderBudget: active.renderBudget,
      message: "已恢复正在进行中的任务，继续等待结果…",
    });
    toast.message("已恢复正在进行中的生成任务");
    pollTask({
      taskId: active.taskId,
      modelName: active.modelName,
      tStart: active.startTs,
      initialPos: active.initialPos,
      renderBudget: active.renderBudget,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  const handleGenerate = async () => {
    if (generating || !activeModel) return;
    if (!prompt || !prompt.trim()) {
      toast.error("请输入图片描述后再生成。");
      return;
    }
    // 风格模板只是本地 prompt 预设：在客户端把 promptSuffix 追加到用户原始 prompt 后
    const effectiveStyleId = inspirationMode ? "" : styleId;
    const finalPrompt = applyStyleSuffix(prompt, effectiveStyleId);
    // 前端违规词检测（服务端会再次检查）
    const safety = checkPromptSafety(`${prompt}\n${finalPrompt}`);
    if (!safety.allowed) {
      console.warn("[generate] prompt blocked by safety filter", { category: safety.category });
      toast.error(SAFETY_BLOCK_MESSAGE);
      return;
    }
    onGenerateStart({ prompt: finalPrompt, modelName: activeModel.name ?? activeModel.model_key });
    const tStart = Date.now();
    const initialPos = 18 + Math.floor(Math.random() * 25);
    const renderBudget = 12 + Math.floor(Math.random() * 10);
    onProgress?.({
      stage: "submitting", attempt: 0, elapsedSec: 0,
      initialPos, renderBudget,
      message: "正在提交任务到生成队列…",
    });
    try {
      const httpRefs = isTextOnly ? [] : refs.filter((u) => /^https?:\/\//i.test(u));
      const payload = {
        modelKey: activeModel.model_key,
        prompt: finalPrompt,
        aspectRatio: ratio,
        size,
        referenceImages: httpRefs.length ? httpRefs : undefined,
      };
      console.log("[generate click] payload →", JSON.stringify(payload, null, 2));
      const r = await generate({ data: payload });

      if (!r.success) {
        toast.error(r.message ?? "生成提交失败，请检查模型配置或稍后重试", { duration: 7000 });
        onProgress?.(null);
        onGenerateDone(null);
        return;
      }

      toast.success(`已提交 · 扣除 ${r.cost} 点，剩余 ${r.credits}`);
      await refreshProfile();

      if (r.imageUrl) {
        onProgress?.(null);
        onGenerateDone(r.imageUrl);
        return;
      }

      if (!r.taskId) throw new Error("未获取到任务ID");
      const modelName = activeModel.name ?? activeModel.model_key;
      saveActive({
        taskId: r.taskId,
        modelKey: activeModel.model_key,
        modelName,
        prompt: finalPrompt,
        startTs: tStart,
        initialPos,
        renderBudget,
      });
      await pollTask({
        taskId: r.taskId,
        modelName,
        tStart,
        initialPos,
        renderBudget,
      });
    } catch (e: any) {
      let msg = "生成失败，请稍后再试";
      try {
        const raw = e?.message ?? e?.error ?? e?.toString?.() ?? "";
        const text = typeof raw === "string" ? raw : JSON.stringify(raw);
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          msg = parsed?.message || parsed?.error || parsed?.msg || text;
        } else if (text) {
          msg = text;
        }
      } catch {
        msg = String(e?.message ?? e ?? "生成失败");
      }
      toast.error(msg, { duration: 6000 });
      clearActive();
      onProgress?.(null);
      onGenerateDone(null);
    }
  };


  return (
    <aside className="flex h-full min-h-0 flex-col overflow-hidden border-r border-border/60 bg-card/40">
      {/* 上半部分：参考图 + 提示词 — 固定高度，不参与滚动 */}
      <div className="flex shrink-0 flex-col">
        {/* 参考图 — 紧凑横向条 */}
        {!isTextOnly && (
          <section className="bg-gradient-to-b from-primary/[0.02] via-transparent to-transparent px-4 py-4">
            <div className="mb-3 flex items-center justify-between">
              <Label>参考图 · 图生图 ({refs.length}/5)</Label>
              {refs.length > 0 && (
                <button
                  onClick={() => setRefs([])}
                  className="text-[11px] text-muted-foreground transition-colors hover:text-primary"
                >
                  清空
                </button>
              )}
            </div>
            <div className="scrollbar-thin flex gap-3 overflow-x-auto pb-1">
              {refs.map((url, i) => (
                <div key={i} className="group relative h-24 w-24 shrink-0 overflow-hidden rounded-xl border border-primary/15 bg-surface">
                  <img src={url} alt="ref" className="h-full w-full object-cover" />
                  <button
                    onClick={() => removeRef(i)}
                    className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/75 text-white opacity-0 backdrop-blur transition-opacity group-hover:opacity-100 hover:bg-destructive"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              {refs.length < 5 && (
                <label className={`group flex h-24 w-24 shrink-0 flex-col items-center justify-center gap-1 ${uploadingRef ? "cursor-wait opacity-60" : "cursor-pointer"} rounded-xl border border-dashed border-primary/30 bg-primary/[0.04] transition-all hover:border-primary/60 hover:bg-primary/[0.08]`}>
                  {uploadingRef ? (
                    <span className="text-[11px] text-muted-foreground">上传中…</span>
                  ) : (
                    <>
                      <Plus className="h-6 w-6 text-primary/70 transition-colors group-hover:text-primary" strokeWidth={1.75} />
                      <span className="text-[10px] text-muted-foreground/80">上传参考图</span>
                    </>
                  )}
                  <input type="file" accept="image/*" className="hidden" onChange={addRef} disabled={uploadingRef} />
                </label>
              )}
            </div>
          </section>
        )}

        {/* 提示词 — frosted glass 卡片 */}
        <section className="px-4 pt-3 pb-2">
        <div className="relative">
          <div className="pointer-events-none absolute -inset-px rounded-2xl bg-gradient-to-br from-primary/10 via-transparent to-transparent opacity-50" />
          <div className="relative rounded-2xl border border-white/[0.04] bg-gradient-to-b from-white/[0.02] to-transparent shadow-inner backdrop-blur-xl">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={4}
                placeholder="描述您想生成的画面、风格、光影与氛围…"
                className="block w-full resize-none rounded-t-2xl border-0 bg-transparent px-4 py-3.5 text-sm font-light leading-relaxed text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus-visible:!border-transparent focus-visible:!shadow-none focus-visible:!ring-0"
              />
              <div className="flex items-center justify-between gap-2 border-t border-white/[0.04] px-2.5 py-2">
                <div className="flex items-center gap-1">
                  <Popover open={modelOpen} onOpenChange={setModelOpen}>
                    <PopoverTrigger asChild>
                      <button className="flex items-center gap-1.5 rounded-lg border border-primary/20 bg-primary/[0.05] px-2.5 py-1.5 text-[11px] font-medium transition-colors hover:border-primary/45 hover:bg-primary/[0.1]">
                        <Sparkles className="h-3 w-3 text-primary" />
                        {activeModel?.name ?? "选择模型"}
                        {activeModel && MODEL_BADGES[activeModel.model_key] && (() => {
                          const b = MODEL_BADGES[activeModel.model_key];
                          const Ic = b.icon;
                          return (
                            <span className={`inline-flex items-center gap-0.5 rounded border px-1 py-px text-[9px] font-medium ${b.className}`}>
                              <Ic className="h-2.5 w-2.5" fill="currentColor" />
                              {b.label}
                            </span>
                          );
                        })()}
                        <ChevronDown className="h-3 w-3 text-muted-foreground" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-72 border-border bg-popover/95 p-1.5 backdrop-blur-xl">
                      <div className="px-2 py-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">选择模型</div>
                      {models.length === 0 && (
                        <div className="px-2 py-3 text-center text-[11px] text-muted-foreground">加载中…</div>
                      )}
                      {models.map((m) => {
                        const active = m.model_key === modelKey;
                        const badge = MODEL_BADGES[m.model_key];
                        const BadgeIcon = badge?.icon;
                        return (
                          <button
                            key={m.id}
                            onClick={() => { setModelKey(m.model_key); setModelOpen(false); }}
                            className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors ${active ? "bg-primary/10" : "hover:bg-white/5"}`}
                          >
                            <div className={`flex h-7 w-7 items-center justify-center rounded-md ${active ? "bg-gradient-aurora text-primary-foreground" : "bg-white/5 text-muted-foreground"}`}>
                              <Sparkles className="h-3.5 w-3.5" />
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center gap-1.5">
                                <span className={`text-xs font-medium ${active ? "text-primary" : ""}`}>{m.name}</span>
                                {badge && BadgeIcon && (
                                  <span className={`inline-flex items-center gap-0.5 rounded border px-1 py-px text-[9px] font-medium ${badge.className}`}>
                                    <BadgeIcon className="h-2.5 w-2.5" fill="currentColor" />
                                    {badge.label}
                                  </span>
                                )}
                                <span className="ml-auto rounded bg-white/5 px-1.5 py-px font-mono text-[9px] text-primary">{Number(m.cost)} 点</span>
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

                  <Popover open={ratioOpen} onOpenChange={setRatioOpen}>
                    <PopoverTrigger asChild>
                      <button className="flex items-center gap-1.5 rounded-lg border border-primary/20 bg-primary/[0.05] px-2.5 py-1.5 text-[11px] font-medium transition-colors hover:border-primary/45 hover:bg-primary/[0.1]">
                        <ActiveRatioIcon className="h-3 w-3" />
                        {ratio}
                        <ChevronDown className="h-3 w-3 text-muted-foreground" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-auto max-w-[360px] border-border bg-popover/95 p-2 backdrop-blur-xl">
                      <div className="mb-1.5 px-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">画面比例</div>
                      <div className="grid grid-cols-4 gap-1.5">
                        {RATIOS.map((r) => {
                          const Icon = r.icon;
                          const active = ratio === r.id;
                          return (
                            <button
                              key={r.id}
                              onClick={() => { setRatio(r.id); setRatioOpen(false); }}
                              className={`flex flex-col items-center gap-1 rounded-lg border px-2 py-2 transition-all ${active ? "border-primary/50 bg-primary/10 text-primary" : "border-border bg-white/[0.02] text-muted-foreground hover:bg-white/5"}`}
                            >
                              <Icon className="h-3.5 w-3.5" strokeWidth={1.5} />
                              <span className="font-mono text-[9px] leading-none">{r.id}</span>
                              <span className="text-[9px] font-light leading-none">{r.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </PopoverContent>
                  </Popover>

                  <Popover open={sizeOpen} onOpenChange={setSizeOpen}>
                    <PopoverTrigger asChild>
                      <button className="flex items-center gap-1.5 rounded-lg border border-primary/20 bg-primary/[0.05] px-2.5 py-1.5 text-[11px] font-medium transition-colors hover:border-primary/45 hover:bg-primary/[0.1]">
                        <Zap className="h-3 w-3" />
                        {size}
                        <ChevronDown className="h-3 w-3 text-muted-foreground" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-auto border-border bg-popover/95 p-2 backdrop-blur-xl">
                      <div className="mb-1.5 px-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">输出像素</div>
                      <div className="grid grid-cols-3 gap-1.5">
                        {(["1K", "2K", "4K"] as const).map((s) => {
                          const active = size === s;
                          return (
                            <button
                              key={s}
                              onClick={() => { setSize(s); setSizeOpen(false); }}
                              className={`flex flex-col items-center gap-1 rounded-lg border px-3 py-2 transition-all ${active ? "border-primary/50 bg-primary/10 text-primary" : "border-border bg-white/[0.02] text-muted-foreground hover:bg-white/5"}`}
                            >
                              <span className="font-mono text-[11px] font-semibold">{s}</span>
                            </button>
                          );
                        })}
                      </div>
                      <div className="mt-2 px-1 text-[9px] font-light text-muted-foreground">像素越高生成越慢，仅部分模型支持</div>
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="flex items-center gap-1">
                  <span className="px-1 font-mono text-[10px] font-light text-muted-foreground">{prompt.length}</span>
                  <IconBtn onClick={() => setPrompt("")} title="清空"><Eraser className="h-3.5 w-3.5" /></IconBtn>
                  <IconBtn
                    title="灵感 · 点击随机生成提示词"
                    disabled={inspiring}
                    onClick={async () => {
                      if (inspiring) return;
                      setInspiring(true);
                      setPrompt("");
                      try {
                        const r: any = await randomPromptFn({});
                        if (r?.prompt) setPrompt(r.prompt);
                      } catch (e: any) {
                        toast.error(e?.message ?? "灵感生成失败");
                      } finally {
                        setInspiring(false);
                      }
                    }}
                  >
                    <Dices className={`h-3.5 w-3.5 text-primary ${inspiring ? "animate-spin" : ""}`} />
                  </IconBtn>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* 风格模板 — 自动填满剩余高度 */}
      <section className="flex min-h-0 flex-1 flex-col px-4 pt-2">
        <div className="mb-2 flex items-center justify-between">
          <Label>风格模板</Label>
          <span className="text-[10px] font-light text-muted-foreground">
            {inspirationMode ? "已使用灵感案例 · 已禁用" : "仅影响视觉风格"}
          </span>
        </div>
        {inspirationMode && (
          <div className="mb-2 flex items-center justify-between rounded-lg border border-primary/30 bg-primary/[0.06] px-3 py-2 text-[11px]">
            <span className="text-primary/90">灵感广场提示词优先</span>
            <button
              onClick={() => setInspirationMode(false)}
              className="rounded-md border border-primary/40 px-2 py-0.5 text-[10px] text-primary transition-colors hover:bg-primary/10"
            >
              取消复用
            </button>
          </div>
        )}
        <div className={`scrollbar-thin min-h-0 flex-1 overflow-y-auto pb-3 ${inspirationMode ? "pointer-events-none opacity-40" : ""}`}>
          {styles.length === 0 ? (
            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">加载中…</div>
          ) : (
            <div className="grid grid-cols-6 gap-2">
              {styles.map((s, idx) => {
                const active = !inspirationMode && s.id === styleId;
                // First 12 thumbnails are visible on first screen → eager + high priority.
                const isAboveFold = idx < 12;
                return (
                  <button
                    key={s.id}
                    onClick={() => setStyleId((prev) => (prev === s.id ? "" : s.id))}
                    title={s.name}
                    className={`group relative aspect-[9/16] overflow-hidden rounded-xl border transition-all ${
                      active
                        ? "border-primary/70 shadow-glow ring-2 ring-primary/40"
                        : "border-border hover:border-primary/50 hover:-translate-y-0.5"
                    }`}
                  >
                    <div className="absolute inset-0 bg-gradient-to-br from-zinc-700/60 to-zinc-900/80" />
                    <img
                      src={s.previewImage}
                      alt={s.name}
                      width={420}
                      height={747}
                      onError={(e) => {
                        const img = e.currentTarget as HTMLImageElement;
                        if (!img.src.endsWith("/style-previews/default.webp")) {
                          img.src = "/style-previews/default.webp";
                        } else {
                          img.style.display = "none";
                        }
                      }}
                      className="relative h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                      loading={isAboveFold ? "eager" : "lazy"}
                      decoding="async"
                      fetchPriority={isAboveFold ? "high" : "auto"}
                    />
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/50 to-transparent px-2 pb-1.5 pt-4">
                      <div className="flex items-center gap-1.5">
                        {active && <div className="h-3 w-1 rounded-full bg-primary" />}
                        <span className={`text-[11px] font-medium ${active ? "text-white" : "text-white/85"}`}>{s.name}</span>
                      </div>
                    </div>
                    {active && (
                      <div className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow">
                        <Check className="h-3 w-3" strokeWidth={3} />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* 立即生成 — 紧贴风格模板 */}
      <div className="shrink-0 border-t border-primary/15 bg-gradient-to-b from-primary/[0.04] to-background/85 p-3 backdrop-blur-xl">
        <button
          onClick={handleGenerate}
          disabled={generating || !activeModel}
          className="group relative flex w-full items-center justify-between gap-2 overflow-hidden rounded-2xl bg-gradient-aurora px-5 py-3.5 text-sm font-bold text-primary-foreground shadow-glow transition-all duration-150 ease-out hover:brightness-110 active:scale-[0.97] disabled:opacity-70 disabled:cursor-not-allowed disabled:active:scale-100"
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
