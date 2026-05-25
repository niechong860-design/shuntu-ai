import { createFileRoute } from "@tanstack/react-router";
import { Studio } from "@/components/studio/Studio";

export const Route = createFileRoute("/")({
  component: Studio,
  head: () => ({
    meta: [
      { title: "ShunTu — 专业电商 AI 商品图生成工作台" },
      { name: "description", content: "ShunTu 专为电商卖家打造的 AI 商品图工作台，一站式生成高质量主图、场景图与商业级视觉内容。" },
      { property: "og:title", content: "ShunTu — 专业电商 AI 商品图生成工作台" },
      { property: "og:description", content: "ShunTu 专为电商卖家打造的 AI 商品图工作台，一站式生成高质量主图、场景图与商业级视觉内容。" },
      { name: "twitter:title", content: "ShunTu — 专业电商 AI 商品图生成工作台" },
      { name: "twitter:description", content: "ShunTu 专为电商卖家打造的 AI 商品图工作台，一站式生成高质量主图、场景图与商业级视觉内容。" },
    ],
  }),
});
