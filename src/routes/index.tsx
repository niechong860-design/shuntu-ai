import { createFileRoute } from "@tanstack/react-router";
import { TopNav } from "@/components/studio/TopNav";
import { ControlPanel } from "@/components/studio/ControlPanel";
import { Gallery } from "@/components/studio/Gallery";

export const Route = createFileRoute("/")({
  component: Studio,
  head: () => ({
    meta: [
      { title: "Lumen Studio — AI Image Generation" },
      { name: "description", content: "Create stunning AI generated images with multiple models in a sleek dark studio interface." },
    ],
  }),
});

function Studio() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <TopNav />
      <div className="flex">
        <ControlPanel />
        <Gallery />
      </div>
    </div>
  );
}
