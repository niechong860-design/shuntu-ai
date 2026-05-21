import { useEffect, useState } from "react";
import {
  Wand2, Eraser, Sparkles, Plus, X, Dices, Zap,
  ChevronDown, Square, RectangleHorizontal, RectangleVertical, Monitor,
  Check, ImageIcon,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { useServerFn } from "@tanstack/react-start";
import { listModelsConfig, generateImage, checkImageStatus, listStyleTemplates } from "@/lib/admin.functions";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
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

// 风格模板：只控制 灯光 / 背景 / 氛围 / 质感 / 色调 / 广告风格
// 严禁出现：比例 / 分辨率 / 尺寸 / 像素 / --ar / 16:9 / 4K 等字眼
const STYLE_TEMPLATES: { id: string; name: string; desc: string; emoji: string; prompt: string }[] = [
  { id: "none", name: "无风格", desc: "仅按提示词生成", emoji: "✖", prompt: "" },
  { id: "premium_ecom", name: "高级电商", desc: "柔光 · 高级商业大片", emoji: "🛍", prompt: "high-end e-commerce commercial photography, soft cinematic studio lighting, clean composition, premium glossy product feel, refined color grading, luxury advertising aesthetic" },
  { id: "xhs", name: "小红书", desc: "清新文艺日系氛围", emoji: "📔", prompt: "Xiaohongshu lifestyle photography, soft natural daylight, fresh airy atmosphere, pastel warm tones, cozy aesthetic background, instagrammable lifestyle styling" },
  { id: "ins_minimal", name: "INS极简", desc: "极简留白 · 性冷淡", emoji: "◻", prompt: "minimalist instagram aesthetic, lots of negative space, neutral muted palette, soft diffused lighting, clean geometric composition, editorial calm mood" },
  { id: "white_ecom", name: "白底电商", desc: "纯白棚拍商业图", emoji: "⬜", prompt: "pure white seamless studio background, even soft box lighting, crisp clean shadows, commercial catalog product photography, sharp clear details" },
  { id: "tech", name: "科技质感", desc: "冷色调 · 未来科技", emoji: "🛰", prompt: "futuristic tech product photography, cool cyan and blue tones, sleek dark gradient background, sharp rim lighting, glowing accent highlights, premium hi-tech mood" },
  { id: "trend_ad", name: "潮流广告", desc: "撞色潮酷海报感", emoji: "🎨", prompt: "trendy streetwear advertising poster, bold contrasting colors, dynamic playful composition, punchy saturated palette, modern editorial energy" },
  { id: "jewelry", name: "珠宝高级感", desc: "深色丝绒 · 璀璨反射", emoji: "💎", prompt: "luxury jewelry photography, dark velvet backdrop, sparkling specular highlights, precise focused lighting, refined reflections, opulent premium mood" },
  { id: "beauty", name: "美妆海报", desc: "柔光质感美妆大片", emoji: "💄", prompt: "high-end beauty cosmetics poster, soft glowing skin-friendly lighting, silky smooth gradient background, elegant pastel or rose tones, dewy luxurious atmosphere" },
  { id: "food", name: "食品广告", desc: "诱人质感 · 食欲色调", emoji: "🍔", prompt: "appetizing food commercial photography, warm golden lighting, rich appetizing colors, mouthwatering textures, steam and freshness, premium culinary mood" },
  { id: "shoes", name: "鞋靴高级感", desc: "动感光影 · 潮鞋大片", emoji: "👟", prompt: "premium footwear advertising, dramatic directional lighting, dynamic shadow play, textured concrete or stone surface, hype sneaker editorial mood" },
  { id: "outdoor", name: "户外露营", desc: "自然光 · 山野氛围", emoji: "🏕", prompt: "outdoor camping lifestyle scene, natural golden hour sunlight, rugged mountain or forest environment, earthy organic tones, adventurous warm atmosphere" },
  { id: "luxury_stage", name: "奢侈品展台", desc: "石材展台 · 博物馆光", emoji: "🏛", prompt: "luxury product display stage, marble or stone pedestal, museum-grade spotlight lighting, elegant deep background, sophisticated high-end gallery atmosphere" },
  { id: "white_studio", name: "极简白棚", desc: "纯净光影 · 极简棚拍", emoji: "🔳", prompt: "minimal white studio set, soft wraparound lighting, gentle natural shadows, pure clean backdrop, refined minimalist product mood" },
  { id: "dark_premium", name: "暗黑高级感", desc: "暗色调 · 戏剧光影", emoji: "🖤", prompt: "dark moody premium product photography, deep black background, dramatic chiaroscuro lighting, rich shadows, cinematic luxurious atmosphere" },
];

// 商品保护：固定追加，保证商品本体不被改动
const PRODUCT_PROTECTION_PROMPT =
  "Preserve the exact original product. Do not redesign or replace the product. Keep the exact shape, logo, material, stitching, structure, proportions and colors unchanged. Only optimize lighting, shadows, background and composition.";

type Props = {
  onGenerateStart: () => void;
  onGenerateDone: (imageUrl: string | null) => void;
  generating: boolean;
};

export function ControlPanel({ onGenerateStart, onGenerateDone, generating }: Props) {
  const fetchModels = useServerFn(listModelsConfig);
  const generate = useServerFn(generateImage);
  const checkStatus = useServerFn(checkImageStatus);
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
  const [styleId, setStyleId] = useState<string>("none");
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
    if (!/^image\//i.test(f.type)) {
      toast.error("仅支持图片文件");
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      toast.error("图片大小请小于 10MB");
      return;
    }
    setUploadingRef(true);
    try {
      const ext = (f.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
      const path = `${uid}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("reference-images")
        .upload(path, f, { cacheControl: "3600", contentType: f.type, upsert: false });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("reference-images").getPublicUrl(path);
      const url = pub.publicUrl;
      console.log("[ref upload] uploaded →", url);
      setRefs((arr) => [...arr, url]);
    } catch (err) {
      console.error("[ref upload] failed", err);
      toast.error("参考图上传失败，请重试");
    } finally {
      setUploadingRef(false);
    }
  };
  const removeRef = (i: number) => setRefs((arr) => arr.filter((_, idx) => idx !== i));

  const handleGenerate = async () => {
    if (generating || !activeModel) return;
    onGenerateStart();
    try {
      const httpRefs = refs.filter((u) => /^https?:\/\//i.test(u));
      const style = STYLE_TEMPLATES.find((s) => s.id === styleId);
      // 风格模板只拼接「风格/灯光/氛围」prompt，不包含任何比例/分辨率/尺寸字眼
      const finalPrompt = [
        prompt.trim(),
        style?.prompt?.trim(),
        PRODUCT_PROTECTION_PROMPT,
      ].filter(Boolean).join("\n\n");
      const payload = {
        modelKey: activeModel.model_key,
        prompt: finalPrompt,
        aspectRatio: ratio, // 用户选择优先级最高
        size,               // 用户选择优先级最高
        referenceImages: httpRefs.length ? httpRefs : undefined,
      };
      // 调试：打印最终发送给 serverFn 的 JSON Body（serverFn 会再透传给上游 API）
      console.log("[generate click] payload →", JSON.stringify(payload, null, 2));
      const r = await generate({ data: payload });

      toast.success(`已提交 · 扣除 ${r.cost} 点，剩余 ${r.credits}`);
      await refreshProfile();

      // 同步模型：直接拿到图片
      if (r.imageUrl) {
        onGenerateDone(r.imageUrl);
        return;
      }

      // 异步模型：前端轮询直到拿到结果（不受 Worker 超时限制）
      if (!r.taskId) throw new Error("未获取到任务ID");
      const taskId = r.taskId;
      const POLL_INTERVAL = 5000;
      const MAX_DURATION_MS = 5 * 60 * 1000; // 5 分钟硬性超时
      const MAX_TRANSIENT_RETRIES = 3;
      const startedAt = Date.now();
      let transientRetries = 0;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        if (Date.now() - startedAt > MAX_DURATION_MS) {
          toast.error(`AI 生成任务超时，请检查网络或稍后重新提交（任务 ID: ${taskId}）`, { duration: 8000 });
          onGenerateDone(null);
          return;
        }
        await new Promise((res) => setTimeout(res, POLL_INTERVAL));
        try {
          const s = await checkStatus({ data: { taskId } });
          if (s.status === "success" && s.imageUrl) {
            onGenerateDone(s.imageUrl);
            return;
          }
          if (s.status === "failed") {
            // 打印原始返回，方便排查被哪个关键词拦截
            console.warn("[checkImageStatus failed]", {
              taskId,
              reason: (s as any).reason,
              code: (s as any).code,
              taskStatus: (s as any).taskStatus,
              msg: (s as any).rawMsg,
              debug: (s as any).debug,
              message: s.message,
            });
            if ((s as any).reason === "ref_url") {
              toast.error(
                `参考图读取失败，请检查链接是否为公开的 HTTPS 链接${s.message ? ` · ${s.message}` : ""}`,
                { duration: 8000 },
              );
            } else if ((s as any).reason === "rejected" || (s as any).taskStatus === 3) {
              toast.error(
                `生成任务失败（原因：任务被拒绝或涉及合规限制，请尝试更换提示词）${s.message ? ` · ${s.message}` : ""}`,
                { duration: 8000 },
              );
            } else {
              toast.error(`生成失败：${s.message ?? "上游服务异常，请稍后重试"}`, { duration: 6000 });
            }

            onGenerateDone(null);
            return;
          }
          // pending — 重置瞬时错误计数，继续轮询
          transientRetries = 0;
        } catch (pollErr: any) {
          const msg = pollErr?.message ?? "";
          console.warn("[checkImageStatus network error]", pollErr);
          const isTransient = /network|fetch|timeout|500|502|503|504/i.test(msg) || !msg;
          if (isTransient && transientRetries < MAX_TRANSIENT_RETRIES) {
            transientRetries += 1;
            continue;
          }
          throw pollErr;
        }
      }
    } catch (e: any) {
      // 兼容 TanStack serverFn 错误包装：可能是 Error、字符串、或 { message } / { error } JSON
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
      // 关键：无论失败原因，强制解除 Loading，恢复按钮可点击
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
              <label className={`group flex h-20 w-20 ${uploadingRef ? "cursor-wait opacity-60" : "cursor-pointer"} flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border bg-white/[0.015] transition-all hover:border-primary/50 hover:bg-primary/[0.04] hover:shadow-glow`}>
                {uploadingRef ? (
                  <span className="text-[10px] text-muted-foreground">上传中…</span>
                ) : (
                  <Plus className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-primary" strokeWidth={1.5} />
                )}
                <input type="file" accept="image/*" className="hidden" onChange={addRef} disabled={uploadingRef} />
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
              placeholder="让您的想法，创造无限可能"
              className="block w-full resize-none rounded-2xl bg-transparent px-4 py-3.5 text-sm font-light leading-relaxed placeholder:text-muted-foreground/50 focus:outline-none"
            />
            <div className="flex items-center justify-between gap-2 border-t border-border/50 px-2.5 py-2">
              <div className="flex items-center gap-1">
                {/* Model popover */}
                <Popover open={modelOpen} onOpenChange={setModelOpen}>
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
                          onClick={() => { setModelKey(m.model_key); setModelOpen(false); }}
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
                <Popover open={ratioOpen} onOpenChange={setRatioOpen}>
                  <PopoverTrigger asChild>
                    <button className="flex items-center gap-1.5 rounded-lg border border-border bg-white/[0.03] px-2.5 py-1.5 text-[11px] font-medium transition-colors hover:border-primary/40 hover:bg-primary/[0.05]">
                      <ActiveRatioIcon className="h-3 w-3" />
                      {ratio}
                      <ChevronDown className="h-3 w-3 text-muted-foreground" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-auto max-w-[360px] border-border bg-popover/95 p-2 backdrop-blur-xl">
                    <div className="mb-1.5 px-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                      画面比例
                    </div>
                    <div className="grid grid-cols-4 gap-1.5">
                      {RATIOS.map((r) => {
                        const Icon = r.icon;
                        const active = ratio === r.id;
                        return (
                          <button
                            key={r.id}
                            onClick={() => { setRatio(r.id); setRatioOpen(false); }}
                            className={`flex flex-col items-center gap-1 rounded-lg border px-2 py-2 transition-all ${
                              active ? "border-primary/50 bg-primary/10 text-primary"
                              : "border-border bg-white/[0.02] text-muted-foreground hover:bg-white/5"
                            }`}
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

                {/* Size popover (1K / 2K / 4K) */}
                <Popover open={sizeOpen} onOpenChange={setSizeOpen}>
                  <PopoverTrigger asChild>
                    <button className="flex items-center gap-1.5 rounded-lg border border-border bg-white/[0.03] px-2.5 py-1.5 text-[11px] font-medium transition-colors hover:border-primary/40 hover:bg-primary/[0.05]">
                      <Zap className="h-3 w-3" />
                      {size}
                      <ChevronDown className="h-3 w-3 text-muted-foreground" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-auto border-border bg-popover/95 p-2 backdrop-blur-xl">
                    <div className="mb-1.5 px-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                      输出像素
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                      {(["1K", "2K", "4K"] as const).map((s) => {
                        const active = size === s;
                        return (
                          <button
                            key={s}
                            onClick={() => { setSize(s); setSizeOpen(false); }}
                            className={`flex flex-col items-center gap-1 rounded-lg border px-3 py-2 transition-all ${
                              active
                                ? "border-primary/50 bg-primary/10 text-primary"
                                : "border-border bg-white/[0.02] text-muted-foreground hover:bg-white/5"
                            }`}
                          >
                            <span className="font-mono text-[11px] font-semibold">{s}</span>
                          </button>
                        );
                      })}
                    </div>
                    <div className="mt-2 px-1 text-[9px] font-light text-muted-foreground">
                      像素越高生成越慢，仅部分模型支持（如 NanoBanana2）
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

        {/* Style templates — horizontal scroll (below prompt, enlarged) */}
        <section>
          <div className="mb-2 flex items-center justify-between">
            <Label>风格模板</Label>
            <span className="text-[10px] font-light text-muted-foreground">仅影响视觉风格，不改变比例/尺寸</span>
          </div>
          <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-2 scrollbar-thin">
            {STYLE_TEMPLATES.map((s) => {
              const active = s.id === styleId;
              return (
                <button
                  key={s.id}
                  onClick={() => setStyleId(s.id)}
                  className={`group relative flex w-[150px] shrink-0 flex-col gap-2 rounded-2xl border p-2.5 text-left transition-all ${
                    active
                      ? "border-primary/60 bg-primary/10 shadow-glow"
                      : "border-border bg-white/[0.02] hover:border-primary/40 hover:bg-white/5"
                  }`}
                >
                  <div className={`flex h-24 w-full items-center justify-center rounded-xl text-4xl ${
                    active ? "bg-gradient-aurora text-primary-foreground" : "bg-white/5 text-muted-foreground"
                  }`}>
                    {s.emoji}
                  </div>
                  <div className={`text-sm font-medium leading-tight ${active ? "text-primary" : ""}`}>
                    {s.name}
                  </div>
                  <div className="text-[11px] font-light leading-snug text-muted-foreground line-clamp-2">
                    {s.desc}
                  </div>
                  {active && (
                    <Check className="absolute right-2 top-2 h-3.5 w-3.5 text-primary" />
                  )}
                </button>
              );
            })}
          </div>
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
