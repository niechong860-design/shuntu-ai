import { lazy, Suspense, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ControlPanel, type GenProgress } from "./ControlPanel";
import { Canvas } from "./Canvas";
import { TopBar } from "./TopBar";
import { TaskFloatingPanel, type FloatingTask } from "./TaskFloatingPanel";
import { useAuth } from "@/hooks/use-auth";
import { checkIsAdmin } from "@/lib/admin.functions";

const AnnouncementCenter = lazy(() => import("./AnnouncementCenter").then((m) => ({ default: m.AnnouncementCenter })));
const AuthModal = lazy(() => import("@/components/auth/AuthModal").then((m) => ({ default: m.AuthModal })));

export function Studio() {
  const { session, profile, loading } = useAuth();
  const checkAdmin = useServerFn(checkIsAdmin);
  const [generating, setGenerating] = useState(false);
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [currentPrompt, setCurrentPrompt] = useState<string>("");
  const [currentModel, setCurrentModel] = useState<string>("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [forceAuth, setForceAuth] = useState(false);
  const [announcementsOpen, setAnnouncementsOpen] = useState(false);
  const [progress, setProgress] = useState<GenProgress | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminTasks, setAdminTasks] = useState<FloatingTask[]>([]);
  const [adminPreparingNextTask, setAdminPreparingNextTask] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setIsAdmin(false);
    if (!session) return;
    checkAdmin({})
      .then((res) => {
        if (!cancelled) setIsAdmin(!!res?.isAdmin);
      })
      .catch(() => {
        if (!cancelled) setIsAdmin(false);
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id]);

  const handleGenerateStart = (info: { prompt: string; modelName: string }) => {
    setGenerating(true);
    setAdminPreparingNextTask(false);
    setGeneratedUrl(null);
    setCurrentPrompt(info.prompt);
    setCurrentModel(info.modelName);
  };
  const handleGenerateDone = (url: string | null) => {
    setGenerating(false);
    setAdminPreparingNextTask(false);
    setAdminTasks((tasks) =>
      tasks.map((task) =>
        task.status === "generating"
          ? { ...task, status: url ? "done" : "failed" }
          : task,
      ),
    );
    setProgress(null);
    if (url) setGeneratedUrl(url);
  };

  const handleAdminPrepareNextTask = (info: { prompt: string; modelName: string }) => {
    if (!isAdmin || adminPreparingNextTask) return;
    const title = info.prompt.trim().slice(0, 20) || info.modelName || "当前生成任务";
    setAdminTasks((tasks) => [
      ...tasks,
      {
        id: `admin-preview-${Date.now()}`,
        title,
        status: "generating" as const,
      },
    ].slice(-3));
    setAdminPreparingNextTask(true);
  };

  const showAuth = !loading && (!session || forceAuth);
  const credits = profile?.credits ?? 0;

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground">
      <div className={showAuth ? "pointer-events-none select-none blur-sm" : ""}>
        <TopBar
          credits={credits}
          onOpenHistory={() => setHistoryOpen(true)}
          onOpenAnnouncements={() => setAnnouncementsOpen(true)}
          onSwitchAccount={() => setForceAuth(true)}
        />
        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-2" style={{ height: "calc(100vh - 56px)" }}>
          <ControlPanel
            onGenerateStart={handleGenerateStart}
            onGenerateDone={handleGenerateDone}
            onProgress={setProgress}
            generating={generating}
            isAdmin={isAdmin}
            adminPreparingNextTask={adminPreparingNextTask}
            onAdminPrepareNextTask={handleAdminPrepareNextTask}
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
        {isAdmin && <TaskFloatingPanel tasks={adminTasks} maxTasks={3} />}
      </div>
      {!showAuth && (
        <Suspense fallback={null}>
          <AnnouncementCenter
            open={announcementsOpen}
            onOpenChange={setAnnouncementsOpen}
            autoOpenLatest
          />
        </Suspense>
      )}
      {showAuth && (
        <Suspense fallback={null}>
          <AuthModal onSuccess={() => setForceAuth(false)} />
        </Suspense>
      )}
    </div>
  );
}


