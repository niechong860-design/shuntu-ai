import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { listAnnouncements } from "@/lib/admin.functions";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Megaphone, Sparkles, AlertTriangle, CheckCircle2, Pin, X, ArrowUpRight, Bell } from "lucide-react";

export type Announcement = {
  id: string;
  title: string;
  content: string;
  type: "info" | "success" | "warning" | "promo";
  image_url: string | null;
  link_url: string | null;
  link_label: string | null;
  is_pinned: boolean;
  created_at: string;
};

const SEEN_KEY = "shuntu-seen-announcements-v1";

function readSeen(): Set<string> {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

function markSeen(id: string) {
  try {
    const seen = readSeen();
    seen.add(id);
    localStorage.setItem(SEEN_KEY, JSON.stringify([...seen].slice(-200)));
  } catch {
    /* noop */
  }
}

const TYPE_STYLES: Record<
  Announcement["type"],
  { ring: string; icon: typeof Megaphone; label: string; chipBg: string; chipText: string; glow: string; gradient: string }
> = {
  info: {
    ring: "ring-primary/30",
    icon: Megaphone,
    label: "公告",
    chipBg: "bg-primary/15 border-primary/35",
    chipText: "text-primary",
    glow: "shadow-[0_0_120px_-30px_hsl(var(--primary)/0.7)]",
    gradient: "from-primary/15 via-primary/5 to-transparent",
  },
  success: {
    ring: "ring-emerald-400/30",
    icon: CheckCircle2,
    label: "新功能",
    chipBg: "bg-emerald-400/15 border-emerald-400/35",
    chipText: "text-emerald-300",
    glow: "shadow-[0_0_120px_-30px_rgba(52,211,153,0.7)]",
    gradient: "from-emerald-400/15 via-emerald-400/5 to-transparent",
  },
  warning: {
    ring: "ring-amber-400/30",
    icon: AlertTriangle,
    label: "提醒",
    chipBg: "bg-amber-400/15 border-amber-400/35",
    chipText: "text-amber-300",
    glow: "shadow-[0_0_120px_-30px_rgba(251,191,36,0.7)]",
    gradient: "from-amber-400/15 via-amber-400/5 to-transparent",
  },
  promo: {
    ring: "ring-fuchsia-400/30",
    icon: Sparkles,
    label: "活动",
    chipBg: "bg-fuchsia-400/15 border-fuchsia-400/35",
    chipText: "text-fuchsia-300",
    glow: "shadow-[0_0_120px_-30px_rgba(232,121,249,0.7)]",
    gradient: "from-fuchsia-400/15 via-fuchsia-400/5 to-transparent",
  },
};

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Auto-open the newest unseen announcement once data is fetched. */
  autoOpenLatest?: boolean;
};

/**
 * Premium announcement dialog. Renders a list of recent announcements with
 * the newest item expanded by default. Triggered automatically on login
 * when there is an unseen announcement, or manually via the bell icon.
 */
export function AnnouncementCenter({ open, onOpenChange, autoOpenLatest = false }: Props) {
  const fetchList = useServerFn(listAnnouncements);
  const [items, setItems] = useState<Announcement[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [autoOpened, setAutoOpened] = useState(false);

  // Fetch once
  useEffect(() => {
    let cancelled = false;
    fetchList({})
      .then((rows) => {
        if (cancelled) return;
        setItems(rows as Announcement[]);
      })
      .catch(() => {
        /* silent: announcements are non-critical */
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-open the latest unseen one on mount (after fetch)
  useEffect(() => {
    if (!autoOpenLatest || autoOpened || items.length === 0) return;
    const seen = readSeen();
    const latest = items.find((a) => !seen.has(a.id));
    if (latest) {
      setActiveId(latest.id);
      onOpenChange(true);
      markSeen(latest.id);
    }
    setAutoOpened(true);
  }, [items, autoOpenLatest, autoOpened, onOpenChange]);

  // When opening manually, default-select the newest item
  useEffect(() => {
    if (open && !activeId && items.length > 0) setActiveId(items[0].id);
    if (open && activeId) markSeen(activeId);
  }, [open, activeId, items]);

  const active = useMemo(() => items.find((a) => a.id === activeId) ?? items[0], [items, activeId]);
  const style = active ? TYPE_STYLES[active.type] : TYPE_STYLES.info;
  const Icon = style.icon;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={`max-w-3xl overflow-hidden border-border/60 bg-card/90 p-0 backdrop-blur-2xl ${style.glow}`}
      >
        <div className="grid grid-cols-1 md:grid-cols-[260px_1fr]">
          {/* Sidebar list */}
          <aside className="border-r border-border/60 bg-black/30">
            <div className="flex items-center gap-2 px-4 py-3.5">
              <Bell className="h-3.5 w-3.5 text-primary" />
              <span className="text-xs font-semibold tracking-wide">通知中心</span>
              <span className="ml-auto rounded bg-white/[0.06] px-1.5 py-px font-mono text-[10px] text-muted-foreground">
                {items.length}
              </span>
            </div>
            <div className="max-h-[60vh] space-y-0.5 overflow-auto px-2 pb-3">
              {items.length === 0 && (
                <div className="px-3 py-8 text-center text-[11px] text-muted-foreground">暂无通知</div>
              )}
              {items.map((a) => {
                const s = TYPE_STYLES[a.type];
                const SIcon = s.icon;
                const isActive = active?.id === a.id;
                return (
                  <button
                    key={a.id}
                    onClick={() => setActiveId(a.id)}
                    className={`group flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left transition-all ${
                      isActive ? "bg-white/[0.06]" : "hover:bg-white/[0.03]"
                    }`}
                  >
                    <div
                      className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border ${s.chipBg}`}
                    >
                      <SIcon className={`h-3 w-3 ${s.chipText}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1">
                        {a.is_pinned && <Pin className="h-2.5 w-2.5 text-primary" fill="currentColor" />}
                        <p
                          className={`truncate text-[11px] font-medium ${
                            isActive ? "text-foreground" : "text-muted-foreground group-hover:text-foreground"
                          }`}
                        >
                          {a.title}
                        </p>
                      </div>
                      <p className="mt-0.5 truncate text-[10px] text-muted-foreground/70">
                        {new Date(a.created_at).toLocaleDateString("zh-CN")}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </aside>

          {/* Body */}
          <div className="relative">
            {/* Top glow */}
            <div
              className={`pointer-events-none absolute inset-x-0 top-0 h-48 bg-gradient-to-b ${style.gradient}`}
            />
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="absolute right-3 top-3 z-10 flex h-7 w-7 items-center justify-center rounded-full border border-border/60 bg-black/40 text-muted-foreground transition-colors hover:bg-black/60 hover:text-foreground"
              aria-label="关闭"
            >
              <X className="h-3.5 w-3.5" />
            </button>

            <div className="relative max-h-[70vh] overflow-auto p-7">
              {!active ? (
                <div className="flex h-64 items-center justify-center text-xs text-muted-foreground">
                  暂无通知
                </div>
              ) : (
                <div className="space-y-5">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${style.chipBg} ${style.chipText}`}
                    >
                      <Icon className="h-2.5 w-2.5" />
                      {style.label}
                    </span>
                    {active.is_pinned && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-primary/35 bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                        <Pin className="h-2.5 w-2.5" fill="currentColor" />
                        置顶
                      </span>
                    )}
                    <span className="ml-auto font-mono text-[10px] text-muted-foreground/70">
                      {new Date(active.created_at).toLocaleString("zh-CN")}
                    </span>
                  </div>

                  <h2 className="text-2xl font-semibold leading-snug tracking-tight">{active.title}</h2>

                  {active.image_url && (
                    <div className={`overflow-hidden rounded-xl border border-border/60 ring-1 ${style.ring}`}>
                      <img
                        src={active.image_url}
                        alt={active.title}
                        className="max-h-80 w-full object-cover"
                        loading="lazy"
                      />
                    </div>
                  )}

                  {active.content && (
                    <div className="whitespace-pre-wrap text-[13px] leading-relaxed text-foreground/85">
                      {active.content}
                    </div>
                  )}

                  {active.link_url && (
                    <div className="pt-2">
                      <a
                        href={active.link_url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="inline-flex items-center gap-1.5 rounded-full bg-gradient-aurora px-4 py-2 text-xs font-semibold text-primary-foreground shadow-glow transition-transform hover:scale-[1.03]"
                      >
                        {active.link_label || "查看详情"}
                        <ArrowUpRight className="h-3.5 w-3.5" />
                      </a>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
