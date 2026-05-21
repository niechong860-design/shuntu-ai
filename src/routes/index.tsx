import { createFileRoute } from "@tanstack/react-router";
import { Studio } from "@/components/studio/Studio";

export const Route = createFileRoute("/")({
  component: Studio,
  head: () => ({
    meta: [
      { title: "Lumen Studio — AI Image Generation" },
      { name: "description", content: "All-in-one AI image generation console with multiple models, sleek dark studio interface." },
    ],
  }),
});
