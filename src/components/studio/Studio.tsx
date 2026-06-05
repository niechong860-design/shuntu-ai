import { lazy, Suspense, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ControlPanel, type GenProgress } from "./ControlPanel";
import { Canvas } from "./Canvas";
import { TopBar } from "./TopBar";
import { TaskFloatingPanel, type FloatingTask } from "./TaskFloatingPanel";
import { useAuth } from "@/hooks/use-auth";
import { cancelGenerationTask, cancelMyQueuedGenerationTasks, checkIsAdmin, createGenerationTask, getMyGenerationTasks, pollGenerationTask, startGenerationTask } from "@/lib/admin.functions";
import { toast } from "sonner";

const AnnouncementCenter = lazy(() => import("./AnnouncementCenter").then((m) => ({ default: m.AnnouncementCenter })));
const AuthModal = lazy(() => import("@/components/auth/AuthModal").then((m) => ({ default: m.AuthModal })));

export function Studio() {
  const { session, profile, loading } = useAuth();
  const checkAdmin = useServerFn(checkIsAdmin);
  const fetchGenerationTasks = useServerFn(getMyGenerationTasks);
  const createTask = useServerFn(createGenerationTask);
  const cancelTask = useServerFn(cancelGenerationTask);
  const cancelQueuedTasks = useServerFn(cancelMyQueuedGenerationTasks);
  const startTask = useServerFn(startGenerationTask);
  const pollTask = useServerFn(pollGenerationTask);
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
  const [startingTaskIds, setStartingTaskIds] = useState<string[]>([]);
  const [cancelingTaskIds, setCancelingTaskIds] = useState<string[]>([]);
  const adminActiveTaskCount = adminTasks.filter((task) =>
    task.status === "waiting" || task.status === "submitting" || task.status === "generating"
  ).length;

  const mapRecoveredTaskStatus = (status: string, deductionStatus?: string | null, deductionId?: string | null): FloatingTask["status"] => {
    if (status === "queued") return "waiting";
    if (status === "running") return "generating";
    if (status === "succeeded") return deductionStatus === "charged" && !!deductionId ? "done" : "failed";
    if (status === "failed") return "failed";
    if (status === "canceled") return "failed";
    return "waiting";
  };

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

  useEffect(() => {
    let cancelled = false;
    if (!session || !isAdmin) {
      setAdminTasks([]);
      return;
    }

    fetchGenerationTasks({})
      .then((res) => {
        if (cancelled) return;
        const recovered = (res?.items ?? [])
          .filter((task: { status: string }) => task.status === "queued" || task.status === "running")
          .map((task: {
            id: string;
            prompt: string | null;
            modelId: string;
            status: string;
            resultImageUrl?: string | null;
            deductionStatus?: string | null;
            deductionId?: string | null;
          }) => {
            const promptTitle = task.prompt?.trim().slice(0, 20);
            return {
              id: task.id,
              title: promptTitle || task.modelId || "生成任务",
              status: mapRecoveredTaskStatus(task.status, task.deductionStatus, task.deductionId),
              prompt: task.prompt ?? "",
              modelName: task.modelId,
              resultImageUrl: task.resultImageUrl ?? null,
            };
          })
          .reverse()
          .slice(0, 3);
        setAdminTasks(recovered);
      })
      .catch((error) => {
        console.warn("[generation-tasks] restore failed", error);
      });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id, isAdmin]);

  useEffect(() => {
    if (!session || !isAdmin) return;
    const runningTaskIds = adminTasks
      .filter((task) => task.status === "generating")
      .map((task) => task.id);
    if (runningTaskIds.length === 0) return;

    let cancelled = false;
    const timer = window.setInterval(() => {
      for (const taskId of runningTaskIds) {
        pollTask({ data: { taskId } })
          .then((taskResult) => {
            if (cancelled) return;
            const task = taskResult as {
              taskId: string;
              status: string;
              resultImageUrl?: string | null;
              deductionStatus?: string | null;
              historyId?: string | null;
              errorMessage?: string | null;
            };
            if (task.status === "succeeded" && task.deductionStatus === "charged" && !!task.historyId) {
              const matchedTask = adminTasks.find((item) => item.id === task.taskId);
              setAdminTasks((tasks) => tasks.filter((item) => item.id !== task.taskId));
              if (task.resultImageUrl) {
                setGeneratedUrl(task.resultImageUrl);
                setCurrentPrompt(matchedTask?.prompt ?? matchedTask?.title ?? "");
                setCurrentModel(matchedTask?.modelName ?? "");
              }
              return;
            }
            if (task.status === "failed" || task.status === "succeeded") {
              setAdminTasks((tasks) =>
                tasks.map((item) =>
                  item.id === task.taskId ? { ...item, status: "failed" as const } : item,
                ),
              );
            }
          })
          .catch((error) => {
            console.warn("[generation-tasks] poll failed", error);
          });
      }
    }, 4000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id, isAdmin, adminTasks]);

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
      url
        ? tasks.filter((task) => !task.id.startsWith("admin-preview-"))
        : tasks.map((task) =>
            task.id.startsWith("admin-preview-") && task.status === "generating"
              ? { ...task, status: "failed" as const }
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
        prompt: info.prompt,
        modelName: info.modelName,
      },
    ].slice(-3));
    setAdminPreparingNextTask(true);
  };

  const handleAdminCreateQueuedTask = async (input: {
    prompt: string;
    modelKey: string;
    modelName: string;
    inputParams: Record<string, unknown>;
  }) => {
    if (!isAdmin) return false;
    if (adminActiveTaskCount >= 3) {
      throw new Error("当前已有 3 个进行中任务，请等待任务完成后再提交。");
    }

    const task = await createTask({
      data: {
        modelKey: input.modelKey,
        prompt: input.prompt,
        inputParams: input.inputParams,
      },
    });

    const title = task.prompt.trim().slice(0, 20) || input.modelName || task.modelId;
    setAdminTasks((tasks) => [
      ...tasks,
      {
        id: task.taskId,
        title,
        status: "waiting" as const,
        prompt: input.prompt,
        modelName: input.modelName,
      },
    ].slice(-3));
    return true;
  };

  const handleAdminClearTestTasks = async () => {
    if (!isAdmin) return;
    try {
      await cancelQueuedTasks({});
      setAdminTasks((tasks) =>
        tasks.filter((task) =>
          task.status !== "waiting" && task.status !== "submitting" && task.status !== "generating"
        ),
      );
      setAdminPreparingNextTask(false);
      toast.success("内测任务已清空");
    } catch (error) {
      const message = error instanceof Error ? error.message : "清空测试任务失败";
      toast.error(message);
    }
  };

  const handleAdminCancelTask = async (taskId: string) => {
    if (!isAdmin) return;
    if (cancelingTaskIds.includes(taskId)) return;
    setCancelingTaskIds((ids) => ids.includes(taskId) ? ids : [...ids, taskId]);
    try {
      const task = await cancelTask({ data: { taskId } }) as { taskId: string; status: string };
      if (task.status === "canceled") {
        setAdminTasks((tasks) => tasks.filter((item) => item.id !== task.taskId));
        toast.success("任务已取消");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "任务取消失败";
      toast.error(message);
    } finally {
      setCancelingTaskIds((ids) => ids.filter((id) => id !== taskId));
    }
  };

  const handleAdminStartTask = async (taskId: string) => {
    if (!isAdmin) return;
    if (startingTaskIds.includes(taskId)) return;
    setStartingTaskIds((ids) => ids.includes(taskId) ? ids : [...ids, taskId]);
    setAdminTasks((tasks) =>
      tasks.map((item) =>
        item.id === taskId && item.status === "waiting" ? { ...item, status: "submitting" as const } : item,
      ),
    );
    try {
      const task = await startTask({ data: { taskId } }) as {
        taskId: string;
        status: string;
        resultImageUrl?: string | null;
        errorMessage?: string | null;
        deductionStatus?: string | null;
        historyId?: string | null;
      };
      const matchedTask = adminTasks.find((item) => item.id === task.taskId);
      const finalized = task.status === "succeeded" && task.deductionStatus === "charged" && !!task.historyId;
      const nextStatus =
        finalized
          ? "done"
          : task.status === "failed" || task.status === "succeeded"
          ? "failed"
          : "generating";
      setAdminTasks((tasks) =>
        finalized
          ? tasks.filter((item) => item.id !== task.taskId)
          : tasks.map((item) =>
              item.id === task.taskId ? { ...item, status: nextStatus as FloatingTask["status"], resultImageUrl: task.resultImageUrl ?? item.resultImageUrl ?? null } : item,
            ),
      );
      if (finalized) {
        if (task.resultImageUrl) {
          setGeneratedUrl(task.resultImageUrl);
          setCurrentPrompt(matchedTask?.prompt ?? matchedTask?.title ?? "");
          setCurrentModel(matchedTask?.modelName ?? "");
        }
        toast.success("任务已完成");
      } else if (task.status === "failed" || task.status === "succeeded") {
        toast.error(task.errorMessage ?? "任务生成失败");
      } else {
        toast.success("任务已进入生成中");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "任务启动失败";
      setAdminTasks((tasks) =>
        tasks.map((item) =>
          item.id === taskId ? { ...item, status: "failed" as const } : item,
        ),
      );
      toast.error(message);
    } finally {
      setStartingTaskIds((ids) => ids.filter((id) => id !== taskId));
    }
  };

  useEffect(() => {
    if (!session || !isAdmin) return;
    const runningOrStartingIds = new Set(startingTaskIds);
    for (const task of adminTasks) {
      if (task.status === "submitting" || task.status === "generating") {
        runningOrStartingIds.add(task.id);
      }
    }
    if (runningOrStartingIds.size > 0) return;

    const taskToStart = adminTasks.find((task) => task.status === "waiting" && !startingTaskIds.includes(task.id));
    if (!taskToStart) return;

    void handleAdminStartTask(taskToStart.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id, isAdmin, adminTasks, startingTaskIds]);

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
            adminActiveTaskCount={adminActiveTaskCount}
            onAdminPrepareNextTask={handleAdminPrepareNextTask}
            onAdminCreateQueuedTask={handleAdminCreateQueuedTask}
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
        {isAdmin && (
          <TaskFloatingPanel
            tasks={adminTasks}
            maxTasks={3}
            onClearTestTasks={handleAdminClearTestTasks}
            startingTaskIds={startingTaskIds}
            onCancelTask={handleAdminCancelTask}
            cancelingTaskIds={cancelingTaskIds}
          />
        )}
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


