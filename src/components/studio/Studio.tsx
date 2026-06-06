import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ControlPanel, type GenProgress } from "./ControlPanel";
import { Canvas } from "./Canvas";
import { TopBar } from "./TopBar";
import { TaskFloatingPanel, type FloatingTask } from "./TaskFloatingPanel";
import { useAuth } from "@/hooks/use-auth";
import { cancelGenerationTask, cancelMyQueuedGenerationTasks, createGenerationTask, getMyGenerationTasks, pollGenerationTask, startGenerationTask } from "@/lib/admin.functions";
import { toast } from "sonner";

const AnnouncementCenter = lazy(() => import("./AnnouncementCenter").then((m) => ({ default: m.AnnouncementCenter })));
const AuthModal = lazy(() => import("@/components/auth/AuthModal").then((m) => ({ default: m.AuthModal })));

const latestResultStorageKey = (userId: string) => `shuntu:studio:last-result:${userId}`;

type StoredLatestResult = {
  url: string;
  prompt: string;
  modelName: string;
};

function writeSessionJson(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Session storage is best-effort UI state only.
  }
}

function saveSessionLatestResult(userId: string, result: StoredLatestResult) {
  if (!result.url) return;
  writeSessionJson(latestResultStorageKey(userId), result);
}

function getActiveQueueTask(tasks: FloatingTask[]) {
  return (
    tasks.find((task) => task.status === "generating") ??
    tasks.find((task) => task.status === "submitting") ??
    tasks.find((task) => task.status === "waiting") ??
    null
  );
}

function getQueueProgress(task: FloatingTask): GenProgress {
  if (task.status === "generating") {
    return {
      stage: "rendering",
      attempt: 0,
      elapsedSec: 0,
      taskId: task.id,
      message: "AI 正在生成图片，请稍候...",
      initialPos: 18,
      renderBudget: 12,
    };
  }

  if (task.status === "submitting") {
    return {
      stage: "submitting",
      attempt: 0,
      elapsedSec: 0,
      taskId: task.id,
      message: "正在提交任务到生成队列...",
      initialPos: 18,
      renderBudget: 12,
    };
  }

  return {
    stage: "queued",
    attempt: 0,
    elapsedSec: 0,
    taskId: task.id,
    message: "任务已加入队列，等待开始生成...",
    initialPos: 18,
    renderBudget: 12,
  };
}

export function Studio() {
  const { session, profile, loading } = useAuth();
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
  const [adminTasks, setAdminTasks] = useState<FloatingTask[]>([]);
  const [adminPrimaryTaskInBatch, setAdminPrimaryTaskInBatch] = useState(false);
  const [adminPreparingNextTask, setAdminPreparingNextTask] = useState(false);
  const [startingTaskIds, setStartingTaskIds] = useState<string[]>([]);
  const [cancelingTaskIds, setCancelingTaskIds] = useState<string[]>([]);
  const pollingTaskIdsRef = useRef<Set<string>>(new Set());
  const adminActiveTaskCount = adminTasks.filter((task) =>
    task.status === "waiting" || task.status === "submitting" || task.status === "generating"
  ).length;
  const adminBatchHasContext = generating || adminActiveTaskCount > 0 || adminPreparingNextTask;
  const effectiveCurrentBatchTaskCount = adminBatchHasContext
    ? adminTasks.length + (adminPrimaryTaskInBatch ? 1 : 0)
    : 0;
  const canPrepareNextAdminTask =
    !!session &&
    !adminPreparingNextTask &&
    effectiveCurrentBatchTaskCount < 3 &&
    (generating || adminActiveTaskCount > 0);
  const activeQueueTask = getActiveQueueTask(adminTasks);
  const hasVisibleResult = !!generatedUrl;
  const shouldShowQueueLoadingOnCanvas = !!activeQueueTask && !hasVisibleResult;
  const queueProgress = activeQueueTask ? getQueueProgress(activeQueueTask) : null;

  const trimPanelTasks = (tasks: FloatingTask[]) => {
    const queueTasks = tasks.filter((task) =>
      task.status === "waiting" || task.status === "submitting" || task.status === "generating"
    );
    const recentTasks = tasks.filter((task) =>
      task.status !== "waiting" && task.status !== "submitting" && task.status !== "generating"
    );
    return [...queueTasks, ...recentTasks].slice(0, 3);
  };

  const rememberLatestResult = (url: string, prompt: string, modelName: string) => {
    const userId = session?.user?.id;
    if (!userId) return;
    saveSessionLatestResult(userId, { url, prompt, modelName });
  };

  const mapRecoveredTaskStatus = (status: string, deductionStatus?: string | null, deductionId?: string | null): FloatingTask["status"] => {
    if (status === "queued") return "waiting";
    if (status === "running") return "generating";
    if (status === "succeeded") return deductionStatus === "charged" && !!deductionId ? "done" : "failed";
    if (status === "failed") return "failed";
    if (status === "canceled") return "failed";
    return "waiting";
  };

  useEffect(() => {
    setGeneratedUrl(null);
    setCurrentPrompt("");
    setCurrentModel("");
    setProgress(null);
    setAdminTasks([]);
    setAdminPrimaryTaskInBatch(false);
    setAdminPreparingNextTask(false);
    setStartingTaskIds([]);
    setCancelingTaskIds([]);
    pollingTaskIdsRef.current.clear();
  }, [session?.user?.id]);

  useEffect(() => {
    let cancelled = false;
    if (!session) {
      setAdminTasks([]);
      setAdminPrimaryTaskInBatch(false);
      setAdminPreparingNextTask(false);
      setStartingTaskIds([]);
      setCancelingTaskIds([]);
      pollingTaskIdsRef.current.clear();
      return;
    }
    fetchGenerationTasks({})
      .then((res) => {
        if (cancelled) return;
        const recovered = (res?.items ?? [])
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
          .slice(0, 3);
        const trimmed = trimPanelTasks(recovered);
        setAdminTasks(trimmed);
        const activeTask = getActiveQueueTask(trimmed);
        if (activeTask) {
          setGeneratedUrl(null);
          setCurrentPrompt(activeTask.prompt ?? activeTask.title ?? "");
          setCurrentModel(activeTask.modelName ?? "");
          setProgress(getQueueProgress(activeTask));
        }
      })
      .catch((error) => {
        console.warn("[generation-tasks] restore failed", error);
        if (!cancelled) {
          setAdminTasks([]);
        }
      });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id]);

  useEffect(() => {
    if (!session) return;
    const runningTaskIds = adminTasks
      .filter((task) => task.status === "generating")
      .map((task) => task.id);
    if (runningTaskIds.length === 0) return;

    let cancelled = false;
    const timer = window.setInterval(() => {
      for (const taskId of runningTaskIds) {
        if (pollingTaskIdsRef.current.has(taskId)) continue;
        pollingTaskIdsRef.current.add(taskId);
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
              setAdminTasks((tasks) =>
                trimPanelTasks(tasks.map((item) =>
                  item.id === task.taskId ? { ...item, status: "done" as const, resultImageUrl: task.resultImageUrl ?? item.resultImageUrl ?? null } : item,
                )),
              );
              if (task.resultImageUrl) {
                setGeneratedUrl(task.resultImageUrl);
                const prompt = matchedTask?.prompt ?? matchedTask?.title ?? "";
                const modelName = matchedTask?.modelName ?? "";
                setCurrentPrompt(prompt);
                setCurrentModel(modelName);
                setProgress(null);
                rememberLatestResult(task.resultImageUrl, prompt, modelName);
              }
              return;
            }
            if (task.status === "failed" || task.status === "succeeded") {
              setProgress(null);
              setAdminTasks((tasks) =>
                tasks.map((item) =>
                  item.id === task.taskId ? { ...item, status: "failed" as const } : item,
                ),
              );
              setProgress(null);
            }
          })
          .catch((error) => {
            console.warn("[generation-tasks] poll failed", error);
          })
          .finally(() => {
            pollingTaskIdsRef.current.delete(taskId);
          });
      }
    }, 4000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id, adminTasks]);

  const handleGenerateStart = (info: { prompt: string; modelName: string }) => {
    if (session && !adminBatchHasContext) {
      setAdminTasks([]);
    }
    setAdminPrimaryTaskInBatch(!!session);
    setGenerating(true);
    setAdminPreparingNextTask(false);
    setCurrentPrompt(info.prompt);
    setCurrentModel(info.modelName);
  };
  const handleGenerateDone = (url: string | null) => {
    setGenerating(false);
    setAdminPreparingNextTask(false);
    setAdminTasks((tasks) =>
      trimPanelTasks(url
        ? tasks.map((task) =>
            task.id.startsWith("admin-preview-") && task.status === "generating"
              ? { ...task, status: "done" as const, resultImageUrl: url }
              : task,
          )
        : tasks.map((task) =>
            task.id.startsWith("admin-preview-") && task.status === "generating"
              ? { ...task, status: "failed" as const }
              : task,
          )),
    );
    setProgress(null);
    if (url) {
      setGeneratedUrl(url);
      rememberLatestResult(url, currentPrompt, currentModel);
    }
  };

  const handleAdminPrepareNextTask = () => {
    if (!canPrepareNextAdminTask) return;
    setAdminPreparingNextTask(true);
  };

  const handleAdminCreateQueuedTask = async (input: {
    prompt: string;
    modelKey: string;
    modelName: string;
    inputParams: Record<string, unknown>;
  }) => {
    if (!session) return false;
    if (effectiveCurrentBatchTaskCount >= 3) {
      throw new Error("本轮任务已满 3 个，请开始新一轮后再提交。");
    }

    const task = await createTask({
      data: {
        modelKey: input.modelKey,
        prompt: input.prompt,
        inputParams: input.inputParams,
      },
    });

    const title = task.prompt.trim().slice(0, 20) || input.modelName || task.modelId;
    const queuedTask: FloatingTask = {
      id: task.taskId,
      title,
      status: "waiting",
      prompt: input.prompt,
      modelName: input.modelName,
    };
    setAdminTasks((tasks) =>
      trimPanelTasks([
        ...(!adminBatchHasContext ? [] : tasks),
        queuedTask,
      ]),
    );
    if (!generatedUrl) {
      setCurrentPrompt(input.prompt);
      setCurrentModel(input.modelName);
      setProgress(getQueueProgress(queuedTask));
    }
    setAdminPreparingNextTask(false);
    return true;
  };

  const handleAdminClearTestTasks = async () => {
    if (!session) return;
    try {
      await cancelQueuedTasks({});
      setAdminTasks((tasks) =>
        tasks.filter((task) =>
          task.status !== "waiting" && task.status !== "submitting" && task.status !== "generating"
        ),
      );
      setAdminPreparingNextTask(false);
      toast.success("未完成任务已清除");
    } catch (error) {
      const message = error instanceof Error ? error.message : "清除未完成任务失败";
      setProgress(null);
      toast.error(message);
    }
  };

  const handleAdminCancelTask = async (taskId: string) => {
    if (!session) return;
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
    if (!session) return;
    if (startingTaskIds.includes(taskId)) return;
    const taskForCanvas = adminTasks.find((item) => item.id === taskId);
    setStartingTaskIds((ids) => ids.includes(taskId) ? ids : [...ids, taskId]);
    setAdminTasks((tasks) =>
      tasks.map((item) =>
        item.id === taskId && item.status === "waiting" ? { ...item, status: "submitting" as const } : item,
      ),
    );
    if (taskForCanvas) {
      const submittingTask: FloatingTask = { ...taskForCanvas, status: "submitting" };
      if (!generatedUrl) {
        setCurrentPrompt(submittingTask.prompt ?? submittingTask.title ?? "");
        setCurrentModel(submittingTask.modelName ?? "");
        setProgress(getQueueProgress(submittingTask));
      }
    }
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
        trimPanelTasks(finalized
          ? tasks.map((item) =>
              item.id === task.taskId ? { ...item, status: "done" as const, resultImageUrl: task.resultImageUrl ?? item.resultImageUrl ?? null } : item,
            )
          : tasks.map((item) =>
              item.id === task.taskId ? { ...item, status: nextStatus as FloatingTask["status"], resultImageUrl: task.resultImageUrl ?? item.resultImageUrl ?? null } : item,
            )),
      );
      if (finalized) {
        if (task.resultImageUrl) {
          setGeneratedUrl(task.resultImageUrl);
          const prompt = matchedTask?.prompt ?? matchedTask?.title ?? "";
          const modelName = matchedTask?.modelName ?? "";
          setCurrentPrompt(prompt);
          setCurrentModel(modelName);
          setProgress(null);
          rememberLatestResult(task.resultImageUrl, prompt, modelName);
        }
        toast.success("任务已完成");
      } else if (task.status === "failed" || task.status === "succeeded") {
        setProgress(null);
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
      setProgress(null);
      toast.error(message);
    } finally {
      setStartingTaskIds((ids) => ids.filter((id) => id !== taskId));
    }
  };

  useEffect(() => {
    if (!session) return;
    if (generating) return;
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
  }, [session?.user?.id, adminTasks, startingTaskIds, generating]);

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
            isAdmin={!!session}
            adminPreparingNextTask={adminPreparingNextTask}
            adminCurrentBatchTaskCount={effectiveCurrentBatchTaskCount}
            canPrepareNextAdminTask={canPrepareNextAdminTask}
            onAdminPrepareNextTask={handleAdminPrepareNextTask}
            onAdminCreateQueuedTask={handleAdminCreateQueuedTask}
          />
          <Canvas
            userId={session?.user?.id ?? null}
            generating={generating || shouldShowQueueLoadingOnCanvas}
            heroIndex={0}
            generatedUrl={generatedUrl}
            currentPrompt={currentPrompt}
            currentModel={currentModel}
            progress={shouldShowQueueLoadingOnCanvas ? queueProgress : progress}
            historyOpen={historyOpen}
            onHistoryOpenChange={setHistoryOpen}
            onSelectHistory={(url, prompt, model) => {
              setGeneratedUrl(url);
              setCurrentPrompt(prompt);
              setCurrentModel(model);
            }}
          />
        </div>
        {session && (
          <TaskFloatingPanel
            tasks={adminTasks}
            maxTasks={3}
            onClearTestTasks={handleAdminClearTestTasks}
            startingTaskIds={startingTaskIds}
            onCancelTask={handleAdminCancelTask}
            cancelingTaskIds={cancelingTaskIds}
            currentTaskCount={effectiveCurrentBatchTaskCount}
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


