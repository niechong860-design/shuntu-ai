import { useEffect, useRef, useState } from "react";
import {
  Wand2, Eraser, Sparkles, Plus, X, Dices, Zap,
  ChevronDown, Square, RectangleHorizontal, RectangleVertical, Monitor,
  Check, ImageIcon, Crown, Flame, Star,
  Loader2,
} from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { useServerFn } from "@tanstack/react-start";
import { listModelsConfig, generateImage, checkImageStatus, generateRandomPrompt } from "@/lib/admin.functions";
import { useAuth } from "@/hooks/use-auth";
import { uploadImageToR2 } from "@/lib/r2-upload-client";
import { consumeStudioPrefill } from "@/lib/studio-prefill";
import { processImage, validateImageFile } from "@/lib/image-processing";
import { thumbUrl } from "@/lib/image-url";
import { checkPromptSafety, SAFETY_BLOCK_MESSAGE } from "@/lib/promptSafety";
import { STYLE_TEMPLATES, applyStyleSuffix, type StyleTemplate } from "@/lib/style-templates";
import { toast } from "sonner";
import { loadHistoryPreview } from "@/lib/preview-cache";

type ModelCfg = {
  id: string; model_key: string; name: string; description: string | null; cost: number;
  sort_order?: number | null;
  extra_params?: Record<string, unknown> | null;
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

type ModelBadge = { label: string; icon: typeof Crown; className: string };

const MODEL_BADGES: Record<string, ModelBadge> = {
  nanobanana_pro: { label: "最强", icon: Crown, className: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  "gpt-image-2": { label: "最火", icon: Flame, className: "bg-rose-500/15 text-rose-400 border-rose-500/30" },
  nanobanana2: { label: "推荐", icon: Star, className: "bg-primary/15 text-primary border-primary/30" },
};

const BADGE_COLOR_CLASSES: Record<string, string> = {
  green: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  red: "bg-rose-500/15 text-rose-400 border-rose-500/30",
  orange: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  cyan: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
  purple: "bg-violet-500/15 text-violet-300 border-violet-500/30",
  gray: "bg-muted text-muted-foreground border-border",
};

const MAX_REFERENCE_IMAGES = 5;
const GENERATED_IMAGE_DRAG_MIME = "application/x-shuntu-generated-image";
const REFERENCE_REORDER_DRAG_MIME = "application/x-shuntu-reference-reorder";

type ReferenceImageItem = {
  id: string;
  sourceUrl: string | null;
  previewUrl: string;
  status: "uploading" | "ready" | "error";
  ownsPreviewUrl: boolean;
  generatedDragToken?: string;
};

function createReferenceImageId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `ref-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function revokeReferencePreview(item: ReferenceImageItem) {
  if (item.ownsPreviewUrl && /^blob:/i.test(item.previewUrl)) {
    URL.revokeObjectURL(item.previewUrl);
  }
}

const pickDefaultModel = (list: ModelCfg[]): ModelCfg | undefined =>
  list.find((m) => m.extra_params?.ui_default_model === true);

const putDefaultModelFirst = (list: ModelCfg[], defaultModel?: ModelCfg): ModelCfg[] => {
  if (!defaultModel) return list;
  return [defaultModel, ...list.filter((m) => m.id !== defaultModel.id)];
};

const getModelBadge = (model?: ModelCfg | null): ModelBadge | null => {
  if (!model) return null;
  const extra = model.extra_params ?? {};
  const configuredText = typeof extra.ui_badge_text === "string" ? extra.ui_badge_text.trim() : "";
  if (extra.ui_badge_enabled === true && configuredText) {
    const color = typeof extra.ui_badge_color === "string" ? extra.ui_badge_color : "cyan";
    return {
      label: configuredText,
      icon: Star,
      className: BADGE_COLOR_CLASSES[color] ?? BADGE_COLOR_CLASSES.cyan,
    };
  }
  return MODEL_BADGES[model.model_key] ?? null;
};
type ActiveGen = {
  userId: string;
  taskId: string;
  modelKey: string;
  modelName: string;
  prompt: string;
  inputParams?: Record<string, unknown>;
  startTs: number;
  initialPos: number;
  renderBudget: number;
};
function loadActive(userId: string): ActiveGen | null {
  try {
    const raw = localStorage.getItem(ACTIVE_GEN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ActiveGen;
    if (!parsed?.taskId || !parsed?.startTs || parsed.userId !== userId) {
      clearActive();
      return null;
    }
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
 onGenerateStart: (info: { prompt: string; modelName: string; modelKey?: string; inputParams?: Record<string, unknown> }) => void;
  onGenerateDone: (imageUrl: string | null, historyId?: string | null) => void;
  generatedImageUrl?: string | null;
  generatedHistoryId?: string | null;
  generatedImageDragToken?: string | null;
  onProgress?: (p: GenProgress | null) => void;
  generating: boolean;
  retryPrefill?: {
    nonce: number;
    prompt: string;
    modelKey?: string;
    inputParams?: Record<string, unknown>;
  } | null;
  reusePrefill?: {
    nonce: number;
    prompt: string;
    modelKey?: string;
    inputParams?: Record<string, unknown>;
  } | null;
  referenceResetToken?: number;
  isAdmin?: boolean;
  adminPreparingNextTask?: boolean;
  adminCurrentBatchTaskCount?: number;
  canPrepareNextAdminTask?: boolean;
  onAdminPrepareNextTask?: (info: { prompt: string; modelName: string }) => void;
  onAdminCreateQueuedTask?: (input: {
    prompt: string;
    modelKey: string;
    modelName: string;
    inputParams: Record<string, unknown>;
  }) => Promise<boolean>;
};

export function ControlPanel({
  onGenerateStart,
  onGenerateDone,
  generatedImageUrl,
  generatedHistoryId,
  generatedImageDragToken,
  onProgress,
  generating,
  retryPrefill,
  reusePrefill,
  referenceResetToken = 0,
  isAdmin = false,
  adminPreparingNextTask = false,
  adminCurrentBatchTaskCount = 0,
  canPrepareNextAdminTask = false,
  onAdminPrepareNextTask,
  onAdminCreateQueuedTask,
}: Props) {
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
  const [refs, setRefs] = useState<ReferenceImageItem[]>([]);
  const refsRef = useRef<ReferenceImageItem[]>([]);
  const pendingGeneratedReferenceTokensRef = useRef<Set<string>>(new Set());
  const dragDepthRef = useRef(0);
  const draggedReferenceIdRef = useRef<string | null>(null);
  const [referenceDropActive, setReferenceDropActive] = useState(false);
  const [previewItem, setPreviewItem] = useState<ReferenceImageItem | null>(null);
  const [prompt, setPrompt] = useState("");
  const [styleId, setStyleId] = useState<string>("");
  const [styles] = useState<StyleTpl[]>(STYLE_TEMPLATES);
  const [inspirationMode, setInspirationMode] = useState(false);
  const [cfg, setCfg] = useState([7.5]);
  const [steps, setSteps] = useState([32]);
  const [isCreatingQueuedTask, setIsCreatingQueuedTask] = useState(false);
  const isPreparingNextTask = isAdmin && adminPreparingNextTask;
  const isQueueMode = isAdmin && !!onAdminCreateQueuedTask;

  useEffect(() => {
    if (!session) return;
    fetchModels({}).then((data) => {
      const list = (data ?? []) as ModelCfg[];
      const configuredDefault = pickDefaultModel(list);
      const orderedList = putDefaultModelFirst(list, configuredDefault);
      const initialModel = configuredDefault ?? list[0];
      setModels(orderedList);
      if (initialModel) {
        setModelKey((current) => {
          const currentStillEnabled = current && list.some((m) => m.model_key === current);
          return currentStillEnabled ? current : initialModel.model_key;
        });
      }
    }).catch(() => {});
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

  const updateReferenceItems = (updater: (items: ReferenceImageItem[]) => ReferenceImageItem[]) => {
    const next = updater(refsRef.current);
    refsRef.current = next;
    setRefs(next);
    setPreviewItem((current) => current ? next.find((item) => item.id === current.id) ?? null : null);
  };

  const replaceReferenceItems = (next: ReferenceImageItem[]) => {
    for (const item of refsRef.current) {
      if (!next.some((candidate) => candidate.id === item.id)) revokeReferencePreview(item);
    }
    refsRef.current = next;
    setRefs(next);
    setPreviewItem((current) => current && next.some((item) => item.id === current.id) ? current : null);
  };

  const clearReferenceItems = () => replaceReferenceItems([]);

  useEffect(() => {
    refsRef.current = refs;
  }, [refs]);

  useEffect(() => () => {
    for (const item of refsRef.current) revokeReferencePreview(item);
  }, []);

  const applyPrefill = (prefill: { prompt: string; modelKey?: string; inputParams?: Record<string, unknown> }) => {
    setPrompt(prefill.prompt);
    if (prefill.modelKey) setModelKey(prefill.modelKey);
    const inputParams = prefill.inputParams ?? {};
    const aspectRatio = typeof inputParams.aspectRatio === "string" ? inputParams.aspectRatio : null;
    const nextSize = typeof inputParams.size === "string" ? inputParams.size : null;
    const referenceImages = Array.isArray(inputParams.referenceImages)
      ? inputParams.referenceImages.filter((url): url is string => typeof url === "string").slice(0, MAX_REFERENCE_IMAGES)
      : [];
    if (aspectRatio && RATIOS.some((item) => item.id === aspectRatio)) setRatio(aspectRatio);
    if (nextSize === "1K" || nextSize === "2K" || nextSize === "4K") setSize(nextSize);
    replaceReferenceItems(referenceImages.map((url) => ({
      id: createReferenceImageId(),
      sourceUrl: url,
      previewUrl: url,
      status: "ready" as const,
      ownsPreviewUrl: false,
    })));
    setStyleId("");
    setInspirationMode(false);
  };

  useEffect(() => {
    if (!retryPrefill) return;
    applyPrefill(retryPrefill);
    toast.success("已回填失败任务参数，可编辑后重试");
  }, [retryPrefill]);

  useEffect(() => {
    if (!reusePrefill) return;
    applyPrefill(reusePrefill);
  }, [reusePrefill]);

  useEffect(() => {
    if (referenceResetToken <= 0) return;
    clearReferenceItems();
  }, [referenceResetToken]);


  const activeModel = models.find((m) => m.model_key === modelKey);
  const activeBadge = getModelBadge(activeModel);
  const activeRatio = RATIOS.find((r) => r.id === ratio)!;
  const ActiveRatioIcon = activeRatio.icon;
  const activeCost = Number(activeModel?.cost ?? 0);
  // 仅文生图的模型：禁止参考图（前端隐藏入口 + 提交时不带 refs）
  const TEXT_ONLY_MODELS = new Set(["wan26"]);
  const isTextOnly = activeModel ? TEXT_ONLY_MODELS.has(activeModel.model_key) : false;
  const uploadedHttpRefs = refs
    .filter((item) => item.status === "ready" && !!item.sourceUrl && /^https?:\/\//i.test(item.sourceUrl))
    .map((item) => item.sourceUrl!);
  // 切换到仅文生图模型时，自动清空已有参考图，避免残留
  useEffect(() => {
    if (isTextOnly && refs.length > 0) clearReferenceItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTextOnly]);

  const uploadingRef = refs.some((item) => item.status === "uploading");

  const uploadReferenceFile = async (file: File, item: ReferenceImageItem) => {
    try {
      const processed = await processImage(file, "ai-model");
      if (processed.previewUrl !== item.previewUrl) URL.revokeObjectURL(processed.previewUrl);
      const { url } = await uploadImageToR2(new File([processed.blob], `reference.${processed.ext}`, { type: processed.contentType }), "reference-image");
      console.log(
        `[ref upload] ${(processed.originalSize / 1024).toFixed(0)}KB → ${(processed.processedSize / 1024).toFixed(0)}KB →`,
        url,
      );
      updateReferenceItems((items) => {
        const existing = items.find((candidate) => candidate.id === item.id);
        if (!existing) {
          revokeReferencePreview(item);
          return items;
        }
        revokeReferencePreview(existing);
        return items.map((candidate) => candidate.id === item.id
          ? { ...candidate, sourceUrl: url, previewUrl: url, status: "ready", ownsPreviewUrl: false }
          : candidate);
      });
    } catch (err) {
      console.error("[ref upload] failed", err);
      toast.error("参考图上传失败，请重试");
      updateReferenceItems((items) => {
        const existing = items.find((candidate) => candidate.id === item.id);
        if (!existing) {
          revokeReferencePreview(item);
          return items;
        }
        return items.map((candidate) => candidate.id === item.id
          ? { ...candidate, sourceUrl: null, status: "error" }
          : candidate);
      });
    }
  };

  const addReferenceFiles = (files: File[], options?: { generatedDragToken?: string }) => {
    const uid = session?.user?.id;
    if (!uid) {
      toast.error("请先登录后再上传参考图");
      return;
    }
    const remainingSlots = MAX_REFERENCE_IMAGES - refsRef.current.length;
    if (remainingSlots <= 0) {
      toast.error("最多上传 5 张参考图");
      return;
    }
    if (files.length > remainingSlots) toast.error("最多上传 5 张参考图，已忽略超出部分");

    const accepted = files.slice(0, remainingSlots);
    const pending = accepted.flatMap((file) => {
      const invalid = validateImageFile(file, { preset: "ai-model", maxMB: 15 });
      if (invalid) {
        toast.error(invalid);
        return [];
      }
      const item: ReferenceImageItem = {
        id: createReferenceImageId(),
        sourceUrl: null,
        previewUrl: URL.createObjectURL(file),
        status: "uploading",
        ownsPreviewUrl: true,
        generatedDragToken: options?.generatedDragToken,
      };
      return [{ file, item }];
    });
    if (pending.length === 0) return;

    updateReferenceItems((items) => [...items, ...pending.map(({ item }) => item)]);
    for (const { file, item } of pending) void uploadReferenceFile(file, item);
  };

  const addRef = (e: React.ChangeEvent<HTMLInputElement>) => {
    addReferenceFiles(Array.from(e.target.files ?? []));
    e.target.value = "";
  };

  const removeRef = (id: string) => {
    const item = refsRef.current.find((candidate) => candidate.id === id);
    if (item) revokeReferencePreview(item);
    if (previewItem?.id === id) setPreviewItem(null);
    updateReferenceItems((items) => items.filter((candidate) => candidate.id !== id));
  };

  const reorderReferences = (sourceId: string, targetId: string) => {
    if (sourceId === targetId) return;
    updateReferenceItems((items) => {
      const sourceIndex = items.findIndex((item) => item.id === sourceId);
      const targetIndex = items.findIndex((item) => item.id === targetId);
      if (sourceIndex < 0 || targetIndex < 0) return items;
      const next = [...items];
      const [moved] = next.splice(sourceIndex, 1);
      next.splice(targetIndex, 0, moved);
      return next;
    });
  };

  const addGeneratedReference = async () => {
    const url = generatedImageUrl;
    const generatedDragToken = generatedImageDragToken;
    if (!url || !generatedDragToken) return;
    if (refsRef.current.some((item) => item.generatedDragToken === generatedDragToken || (item.status === "ready" && item.sourceUrl === url))) {
      toast.message("该生成图片已添加");
      return;
    }
    if (pendingGeneratedReferenceTokensRef.current.has(generatedDragToken)) {
      toast.message("该生成图片已添加");
      return;
    }
    if (refsRef.current.length >= MAX_REFERENCE_IMAGES) {
      toast.error("参考图最多 5 张");
      return;
    }
    if (/^https?:\/\//i.test(url)) {
      const id = createReferenceImageId();
      if (!generatedHistoryId || !session?.user?.id) {
        toast.error("当前生成图片预览尚未就绪，请稍后重试");
        return;
      }
      pendingGeneratedReferenceTokensRef.current.add(generatedDragToken);
      try {
        const previewUrl = await loadHistoryPreview(session.user.id, generatedHistoryId);
        updateReferenceItems((items) => [...items, {
          id,
          sourceUrl: url,
          previewUrl,
          status: "ready",
          ownsPreviewUrl: false,
          generatedDragToken,
        }]);
      } catch {
        toast.error("生成图片预览读取失败，无法添加为参考图");
      } finally {
        pendingGeneratedReferenceTokensRef.current.delete(generatedDragToken);
      }
      return;
    }
    if (!/^(data:image\/|blob:)/i.test(url)) {
      toast.error("当前生成图片格式不支持作为参考图");
      return;
    }
    pendingGeneratedReferenceTokensRef.current.add(generatedDragToken);
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      if (!blob.size || !/^image\//i.test(blob.type)) throw new Error("invalid generated image");
      const extension = blob.type === "image/jpeg" ? "jpg" : blob.type.split("/")[1] || "bin";
      const file = new File([blob], `generated-reference.${extension}`, { type: blob.type });
      addReferenceFiles([file], { generatedDragToken });
    } catch {
      toast.error("生成图片读取失败，无法添加为参考图");
    } finally {
      pendingGeneratedReferenceTokensRef.current.delete(generatedDragToken);
    }
  };

  const handleReferenceDrop = (event: React.DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current = 0;
    setReferenceDropActive(false);
    const transfer = event.dataTransfer;
    const generatedToken = transfer.getData(GENERATED_IMAGE_DRAG_MIME);
    if (generatedToken) {
      if (generatedToken === generatedImageDragToken) void addGeneratedReference();
      return;
    }
    const reorderId = transfer.getData(REFERENCE_REORDER_DRAG_MIME);
    if (reorderId) return;
    const files = Array.from(transfer.files ?? []);
    if (files.length > 0) addReferenceFiles(files);
  };

  // 轮询任务到完成。tStart 是任务开始时间戳（毫秒），用于刷新后从持久化时间继续计算 elapsed
  const pollTask = async (args: {
    taskId: string;
    modelName: string;
    modelKey: string;
    prompt: string;
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
        const s = await checkStatus({ data: { taskId, modelName, modelKey: args.modelKey, prompt: args.prompt } });
        if (s.status === "success" && s.imageUrl) {
          clearActive();
          onProgress?.(null);
          onGenerateDone(s.imageUrl, (s as { historyId?: string | null }).historyId);
          refreshProfile();
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
    const userId = session?.user?.id;
    if (!userId) return;
    const active = loadActive(userId);
    if (!active) return;
    console.log("[resume] restoring in-flight task", active.taskId);
    onGenerateStart({
      prompt: active.prompt,
      modelName: active.modelName,
      modelKey: active.modelKey,
      inputParams: active.inputParams,
    });
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
      modelKey: active.modelKey,
      prompt: active.prompt,
      tStart: active.startTs,
      initialPos: active.initialPos,
      renderBudget: active.renderBudget,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  const handleAdminPrepareNextTask = () => {
    if (!canPrepareNextAdminTask) return;
    onAdminPrepareNextTask?.({
      prompt,
      modelName: activeModel?.name ?? activeModel?.model_key ?? "当前模型",
    });
    setPrompt("");
    clearReferenceItems();
    setStyleId("");
    setInspirationMode(false);
    toast.success("已加入任务面板，可以准备下一个提示词");
  };

  const handleGenerate = async () => {
    const createQueuedTask = async () => {
      if (isCreatingQueuedTask) return;
      if (adminCurrentBatchTaskCount >= 3) {
        toast.error("本轮任务已满 3 个，请开始新一轮后再提交。");
        return;
      }
      if (!activeModel) return;
      if (!prompt || !prompt.trim()) {
        toast.error("请输入图片描述后再生成。");
        return;
      }
      const effectiveStyleId = inspirationMode ? "" : styleId;
      const finalPrompt = applyStyleSuffix(prompt, effectiveStyleId);
      const safety = checkPromptSafety(`${prompt}\n${finalPrompt}`);
      if (!safety.allowed) {
        console.warn("[generation-task] prompt blocked by safety filter", { category: safety.category });
        toast.error(SAFETY_BLOCK_MESSAGE);
        return;
      }
      setIsCreatingQueuedTask(true);
      try {
        const httpRefs = isTextOnly ? [] : uploadedHttpRefs;
        const ok = await onAdminCreateQueuedTask?.({
          modelKey: activeModel.model_key,
          modelName: activeModel.name ?? activeModel.model_key,
          prompt: finalPrompt,
          inputParams: {
            aspectRatio: ratio,
            size,
            referenceImages: httpRefs,
            styleId: effectiveStyleId || null,
            inspirationMode,
          },
        });
        if (ok) {
          setPrompt("");
          clearReferenceItems();
          setStyleId("");
          setInspirationMode(false);
          toast.success("任务已加入等待队列，可继续准备下一张。");
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "任务创建失败，请稍后重试。";
        if (message.includes("generation_tasks") || message.includes("任务表尚未启用")) {
          toast.error("任务表尚未启用，暂不能创建多任务。");
        } else {
          toast.error(message);
        }
      } finally {
        setIsCreatingQueuedTask(false);
      }
    };

    if (isAdmin && onAdminCreateQueuedTask) {
      await createQueuedTask();
      return;
    }

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
    const httpRefs = isTextOnly ? [] : uploadedHttpRefs;
    const inputParams = {
      aspectRatio: ratio,
      size,
      referenceImages: httpRefs,
      styleId: effectiveStyleId || null,
      inspirationMode,
    };
    onGenerateStart({
      prompt: finalPrompt,
      modelName: activeModel.name ?? activeModel.model_key,
      modelKey: activeModel.model_key,
      inputParams,
    });
    const tStart = Date.now();
    const initialPos = 18 + Math.floor(Math.random() * 25);
    const renderBudget = 12 + Math.floor(Math.random() * 10);
    onProgress?.({
      stage: "submitting", attempt: 0, elapsedSec: 0,
      initialPos, renderBudget,
      message: "正在提交任务到生成队列…",
    });
    try {
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

      if (r.imageUrl) {
        // sync 模型：服务端已扣费，刷新余额
        await refreshProfile();
        onProgress?.(null);
        onGenerateDone(r.imageUrl, r.historyId);
        return;
      }

      if (!r.taskId) throw new Error("未获取到任务ID");
      const modelName = activeModel.name ?? activeModel.model_key;
      const userId = session?.user?.id;
      if (!userId) throw new Error("请先登录后再生成");
      saveActive({
        userId,
        taskId: r.taskId,
        modelKey: activeModel.model_key,
        modelName,
        prompt: finalPrompt,
        inputParams,
        startTs: tStart,
        initialPos,
        renderBudget,
      });
      await pollTask({
        taskId: r.taskId,
        modelName,
        modelKey: activeModel.model_key,
        prompt: finalPrompt,
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
          <section
            onDragEnter={(event) => {
              event.preventDefault();
              event.stopPropagation();
              dragDepthRef.current += 1;
              setReferenceDropActive(true);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              event.stopPropagation();
              event.dataTransfer.dropEffect = event.dataTransfer.types.includes(GENERATED_IMAGE_DRAG_MIME) || event.dataTransfer.types.includes("Files") ? "copy" : "move";
            }}
            onDragLeave={(event) => {
              event.preventDefault();
              event.stopPropagation();
              dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
              if (dragDepthRef.current === 0) setReferenceDropActive(false);
            }}
            onDrop={handleReferenceDrop}
            className={`bg-gradient-to-b from-primary/[0.02] via-transparent to-transparent px-4 py-4 transition-colors ${referenceDropActive ? "bg-primary/[0.09]" : ""}`}
          >
            <div className="mb-3 flex items-center justify-between">
              <Label>参考图 · 图生图 ({refs.length}/5)</Label>
              {refs.length > 0 && (
                <button
                  onClick={clearReferenceItems}
                  className="text-[11px] text-muted-foreground transition-colors hover:text-primary"
                >
                  清空
                </button>
              )}
            </div>
            <div className="scrollbar-thin flex gap-3 overflow-x-auto pb-1">
              {refs.map((item) => (
                <div
                  key={item.id}
                  draggable
                  onDragStart={(event) => {
                    draggedReferenceIdRef.current = item.id;
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData(REFERENCE_REORDER_DRAG_MIME, item.id);
                  }}
                  onDragEnd={() => {
                    draggedReferenceIdRef.current = null;
                    dragDepthRef.current = 0;
                    setReferenceDropActive(false);
                  }}
                  onDragOver={(event) => {
                    if (event.dataTransfer.types.includes(REFERENCE_REORDER_DRAG_MIME)) {
                      event.preventDefault();
                      event.stopPropagation();
                      event.dataTransfer.dropEffect = "move";
                    }
                  }}
                  onDrop={(event) => {
                    if (!event.dataTransfer.types.includes(REFERENCE_REORDER_DRAG_MIME)) return;
                    event.preventDefault();
                    event.stopPropagation();
                    const sourceId = event.dataTransfer.getData(REFERENCE_REORDER_DRAG_MIME) || draggedReferenceIdRef.current;
                    if (sourceId) reorderReferences(sourceId, item.id);
                    draggedReferenceIdRef.current = null;
                    dragDepthRef.current = 0;
                    setReferenceDropActive(false);
                  }}
                  className="group relative h-24 w-24 shrink-0 cursor-grab overflow-hidden rounded-xl border border-primary/15 bg-surface active:cursor-grabbing"
                >
                  <button
                    type="button"
                    className="h-full w-full"
                    onClick={() => setPreviewItem(item)}
                    aria-label="查看参考图大图"
                  >
                    <img src={item.previewUrl} alt="参考图" draggable={false} className="h-full w-full object-cover" />
                  </button>
                  {item.status === "uploading" && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/45 text-white">
                      <Loader2 className="h-5 w-5 animate-spin" />
                    </div>
                  )}
                  {item.status === "error" && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/60 px-2 text-center text-[10px] text-rose-100">
                      上传失败
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={(event) => { event.stopPropagation(); removeRef(item.id); }}
                    className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/75 text-white opacity-0 backdrop-blur transition-opacity group-hover:opacity-100 hover:bg-destructive"
                    aria-label="删除参考图"
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
                  <input type="file" accept="image/*" multiple className="hidden" onChange={addRef} />
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
                        {activeBadge && (() => {
                          const Ic = activeBadge.icon;
                          return (
                            <span className={`inline-flex items-center gap-0.5 rounded border px-1 py-px text-[9px] font-medium ${activeBadge.className}`}>
                              <Ic className="h-2.5 w-2.5" fill="currentColor" />
                              {activeBadge.label}
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
                        const badge = getModelBadge(m);
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
      <Dialog open={!!previewItem} onOpenChange={(open) => { if (!open) setPreviewItem(null); }}>
        <DialogContent className="max-w-5xl border-border bg-black/90 p-3">
          <DialogTitle className="sr-only">参考图预览</DialogTitle>
          {previewItem && (
            <img src={previewItem.previewUrl} alt="参考图大图" draggable={false} className="max-h-[82vh] w-full rounded-lg object-contain" />
          )}
        </DialogContent>
      </Dialog>

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
        {canPrepareNextAdminTask && (
          <button
            type="button"
            onClick={handleAdminPrepareNextTask}
            className="mb-2 flex w-full items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/[0.06] px-4 py-2.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/[0.1]"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
            准备下一个任务
          </button>
        )}
        <button
          onClick={handleGenerate}
          disabled={
            isQueueMode
              ? !activeModel || adminCurrentBatchTaskCount >= 3 || isCreatingQueuedTask
              : (generating && !isPreparingNextTask) || !activeModel
          }
          className="group relative flex w-full items-center justify-between gap-2 overflow-hidden rounded-2xl bg-gradient-aurora px-5 py-3.5 text-sm font-bold text-primary-foreground shadow-glow transition-all duration-150 ease-out hover:brightness-110 active:scale-[0.97] disabled:opacity-70 disabled:cursor-not-allowed disabled:active:scale-100"
        >
          <div className="flex items-center gap-2">
            {generating && !isPreparingNextTask ? (
              <>
                <Sparkles className="h-4 w-4 animate-spin" />
                生成中…
              </>
            ) : (
              <>
                <Wand2 className="h-4 w-4" strokeWidth={2.5} />
                {isPreparingNextTask
                  ? isCreatingQueuedTask
                    ? "加入队列中..."
                    : adminCurrentBatchTaskCount >= 3
                    ? "任务已满 3/3"
                    : "加入任务队列"
                  : isQueueMode && isCreatingQueuedTask
                  ? "加入队列中..."
                  : isQueueMode && adminCurrentBatchTaskCount >= 3
                  ? "任务已满 3/3"
                  : isQueueMode && adminCurrentBatchTaskCount > 0
                  ? "加入任务队列"
                  : "立即生成"}
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
