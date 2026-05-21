import { useState } from "react";
import { ControlPanel } from "./ControlPanel";
import { Canvas } from "./Canvas";
import { TopBar } from "./TopBar";

export function Studio() {
  const [credits, setCredits] = useState(7847);
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
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground">
      <TopBar credits={credits} onOpenHistory={() => setHistoryOpen(true)} />
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-2">
        <ControlPanel onGenerate={handleGenerate} generating={generating} />
        <Canvas
          generating={generating}
          heroIndex={heroIndex}
          historyOpen={historyOpen}
          onHistoryOpenChange={setHistoryOpen}
          onSelectHistory={setHeroIndex}
        />
      </div>
    </div>
  );
}
