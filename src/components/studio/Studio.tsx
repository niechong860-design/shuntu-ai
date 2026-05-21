import { useState } from "react";
import { ControlPanel } from "./ControlPanel";
import { Canvas } from "./Canvas";

export function Studio() {
  const [credits, setCredits] = useState(520);
  const [generating, setGenerating] = useState(false);
  const [heroIndex, setHeroIndex] = useState(0);

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
    <div className="grid h-screen w-screen grid-cols-1 overflow-hidden bg-background text-foreground lg:grid-cols-[38%_62%]">
      <ControlPanel credits={credits} onGenerate={handleGenerate} generating={generating} />
      <Canvas generating={generating} heroIndex={heroIndex} />
    </div>
  );
}
