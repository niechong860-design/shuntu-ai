import { useState } from "react";
import { ControlPanel } from "./ControlPanel";
import { Canvas } from "./Canvas";
import { RightRail } from "./RightRail";

export function Studio() {
  const [credits, setCredits] = useState(520);
  const [generating, setGenerating] = useState(false);
  const [heroIndex, setHeroIndex] = useState(0);
  const [historyOpen, setHistoryOpen] = useState(false);

  const handleGenerate = () => {
    if (generating || credits < 2) return;
    setGenerating(true);
    setCredits((c) => c - 2);
    setTimeout(() => {
      setGenerating(false);
      setHeroIndex((i) => (i + 1) % 6);
    }, 3000);
  };

  return (
    <div className="grid h-screen w-screen grid-cols-1 overflow-hidden bg-background text-foreground lg:grid-cols-[30%_1fr_72px]">
      <ControlPanel onGenerate={handleGenerate} generating={generating} />
      <Canvas
        generating={generating}
        heroIndex={heroIndex}
        historyOpen={historyOpen}
        onHistoryOpenChange={setHistoryOpen}
        onSelectHistory={setHeroIndex}
      />
      <RightRail credits={credits} onOpenHistory={() => setHistoryOpen(true)} />
    </div>
  );
}
