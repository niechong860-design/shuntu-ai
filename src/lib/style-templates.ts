// Local-only style template presets.
// 风格模板只是前端 prompt 预设，不依赖任何后端/数据库。
// 用户点击模板时，把 promptSuffix 追加到原始 prompt 后即可。

export type StyleTemplate = {
  id: string;
  name: string;
  /** 可选：本地图或外链图。可为 null，前端用渐变占位 */
  image: string | null;
  /** 用于展示的渐变（Tailwind from-... to-...）。仅占位用 */
  gradient: string;
  /** 追加到用户提示词后的风格补充词。无风格为空字符串 */
  promptSuffix: string;
};

export const STYLE_TEMPLATES: StyleTemplate[] = [
  {
    id: "none",
    name: "无风格",
    image: null,
    gradient: "from-zinc-700/60 to-zinc-900/80",
    promptSuffix: "",
  },
  {
    id: "ecommerce-premium",
    name: "高级电商",
    image: null,
    gradient: "from-amber-200/40 to-stone-700/70",
    promptSuffix:
      "high-end e-commerce product photography, clean seamless background, soft diffused studio lighting, subtle reflections, premium material textures, magazine-grade color grading, ultra sharp details, 8k",
  },
  {
    id: "tech-texture",
    name: "科技质感",
    image: null,
    gradient: "from-cyan-500/40 to-slate-900/80",
    promptSuffix:
      "futuristic tech product visualization, brushed metal and glass surfaces, cool cyan rim light, dark gradient background, subtle holographic reflections, sharp micro details, cinematic studio shot, 8k",
  },
  {
    id: "jewelry-luxury",
    name: "珠宝高级感",
    image: null,
    gradient: "from-yellow-200/40 to-neutral-900/80",
    promptSuffix:
      "luxury jewelry advertising photography, sparkling gemstones, polished metal, soft black velvet background, refined key light with delicate reflections, macro details, elegant editorial mood, 8k",
  },
  {
    id: "beauty-poster",
    name: "美妆海报",
    image: null,
    gradient: "from-pink-300/50 to-rose-700/70",
    promptSuffix:
      "high-end beauty cosmetics poster, glossy product surface, soft pastel gradient background, dewy skin highlights, fashion magazine lighting, vivid yet refined color palette, ultra clean retouch, 8k",
  },
  {
    id: "food-ad",
    name: "餐饮广告",
    image: null,
    gradient: "from-orange-400/50 to-red-800/70",
    promptSuffix:
      "appetizing food commercial photography, warm directional lighting, steam and fresh ingredients, rich saturated colors, shallow depth of field, mouth-watering textures, premium menu ad style, 8k",
  },
  {
    id: "footwear-premium",
    name: "鞋靴高级感",
    image: null,
    gradient: "from-stone-300/40 to-stone-900/80",
    promptSuffix:
      "premium footwear product shot, sculpted studio lighting, soft shadows on minimalist concrete or stone surface, crisp leather and material details, editorial fashion mood, ultra sharp, 8k",
  },
  {
    id: "outdoor-photography",
    name: "户外摄影",
    image: null,
    gradient: "from-emerald-400/50 to-sky-800/70",
    promptSuffix:
      "outdoor lifestyle photography, natural golden hour sunlight, scenic landscape background, atmospheric haze, vivid realistic colors, cinematic wide angle, documentary feel, 8k",
  },
  {
    id: "dark-luxury",
    name: "暗黑高级感",
    image: null,
    gradient: "from-zinc-800/80 to-black",
    promptSuffix:
      "dark moody premium photography, deep black background, single dramatic rim light, rich shadows, polished surfaces with subtle highlights, mysterious luxury atmosphere, ultra sharp details, 8k",
  },
  {
    id: "future-tech",
    name: "未来科技",
    image: null,
    gradient: "from-indigo-500/50 to-fuchsia-700/70",
    promptSuffix:
      "futuristic sci-fi visualization, neon accent lighting, holographic UI elements, sleek metallic surfaces, glowing edges, deep blue and magenta palette, cinematic concept art, 8k",
  },
  {
    id: "post-apocalyptic",
    name: "末日废土",
    image: null,
    gradient: "from-amber-700/60 to-zinc-900/90",
    promptSuffix:
      "post-apocalyptic wasteland scene, dusty atmosphere, rusted metal and broken concrete, harsh sunlight through haze, desaturated warm palette, gritty cinematic mood, ultra detailed, 8k",
  },
];

export function getStyleTemplate(id: string | null | undefined): StyleTemplate | undefined {
  if (!id) return undefined;
  return STYLE_TEMPLATES.find((s) => s.id === id);
}

export function getStylePromptSuffix(id: string | null | undefined): string {
  return getStyleTemplate(id)?.promptSuffix ?? "";
}

/** 在用户原 prompt 后追加风格补充词 */
export function applyStyleSuffix(prompt: string, styleId: string | null | undefined): string {
  const suffix = getStylePromptSuffix(styleId).trim();
  const base = (prompt ?? "").trim();
  if (!suffix) return base;
  return base ? `${base}\n\n${suffix}` : suffix;
}
