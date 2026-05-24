import { ControlPanel, type GenProgress } from "./ControlPanel";
import { Canvas } from "./Canvas";
import { TopBar } from "./TopBar";
import { AuthModal } from "@/components/auth/AuthModal";
import { useAuth } from "@/hooks/use-auth";
import { useState } from "react";

export function Studio() {
  const { session, profile, loading } = useAuth();
  const [generating, setGenerating] = useState(false);
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [currentPrompt, setCurrentPrompt] = useState<string>("");
  const [currentModel, setCurrentModel] = useState<string>("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [forceAuth, setForceAuth] = useState(false);
  const [progress, setProgress] = useState<GenProgress | null>(null);

  const handleGenerateStart = (info: { prompt: string; modelName: string }) => {
    setGenerating(true);
    setGeneratedUrl(null);
    setCurrentPrompt(info.prompt);
    setCurrentModel(info.modelName);
  };
  const handleGenerateDone = (url: string | null) => {
    setGenerating(false);
    setProgress(null);
    if (url) setGeneratedUrl(url);
  };

  const showAuth = !loading && (!session || forceAuth);
  const credits = profile?.credits ?? 0;

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground">
      <div className={showAuth ? "pointer-events-none select-none blur-sm" : ""}>
        <TopBar
          credits={credits}
          onOpenHistory={() => setHistoryOpen(true)}
          onSwitchAccount={() => setForceAuth(true)}
        />
        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-2" style={{ height: "calc(100vh - 56px)" }}>
          <ControlPanel
            onGenerateStart={handleGenerateStart}
            onGenerateDone={handleGenerateDone}
            onProgress={setProgress}
            generating={generating}
          />
          <Canvas
            generating={generating}
            heroIndex={0}
            generatedUrl={generatedUrl}
            currentPrompt={currentPrompt}
            currentModel={currentModel}
            progress={progress}
            historyOpen={historyOpen}
            onHistoryOpenChange={setHistoryOpen}
            onSelectHistory={(url, prompt, model) => {
              setGeneratedUrl(url);
              setCurrentPrompt(prompt);
              setCurrentModel(model);
            }}
          />
        </div>
      </div>
      {showAuth && <AuthModal onSuccess={() => setForceAuth(false)} />}
    </div>
  );
}


