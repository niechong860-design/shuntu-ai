import { Sparkles, Zap, Plus, Bell, Send, History } from "lucide-react";

type Props = {
  credits: number;
  onOpenHistory: () => void;
};

export function TopBar({ credits, onOpenHistory }: Props) {
  return (
    <header className="flex h-14 w-full shrink-0 items-center justify-between border-b border-border/60 bg-card/70 px-4 backdrop-blur-2xl">
      {/* Left: Logo */}
      <div className="flex items-center gap-2.5">
        <div className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-aurora shadow-glow">
          <Sparkles className="h-4 w-4 text-primary-foreground" strokeWidth={2.5} />
        </div>
        <div className="font-display text-[15px] font-semibold tracking-tight">
          Lumen<span className="text-gradient-aurora">.</span>Studio
        </div>
      </div>

      {/* Right: actions */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2 rounded-full border border-border bg-white/[0.03] px-3 py-1.5">
          <Zap className="h-3.5 w-3.5 text-primary" fill="currentColor" />
          <span className="font-mono text-xs font-semibold tabular-nums">{credits.toLocaleString()}</span>
          <span className="text-[10px] font-light uppercase tracking-wider text-muted-foreground">pts</span>
        </div>
        <button className="flex items-center gap-1.5 rounded-full bg-gradient-aurora px-3.5 py-1.5 text-xs font-semibold text-primary-foreground shadow-glow transition-transform hover:scale-[1.03]">
          <Plus className="h-3.5 w-3.5" strokeWidth={3} />
          Top up
        </button>
        <div className="mx-1 h-6 w-px bg-border" />
        <IconBtn title="History" onClick={onOpenHistory}><History className="h-4 w-4" /></IconBtn>
        <IconBtn title="Notifications">
          <span className="relative">
            <Bell className="h-4 w-4" />
            <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-primary" />
          </span>
        </IconBtn>
        <div className="relative h-8 w-8 overflow-hidden rounded-full ring-1 ring-border">
          <div className="h-full w-full bg-gradient-to-br from-primary/40 via-accent to-secondary" />
          <div className="absolute inset-0 flex items-center justify-center text-[11px] font-semibold">Y</div>
          <span className="absolute -bottom-0 -right-0 h-2 w-2 rounded-full border-2 border-card bg-primary" />
        </div>
        <button className="ml-1 flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/[0.08] px-3.5 py-1.5 text-xs font-semibold text-primary transition-all hover:bg-primary/[0.14] hover:shadow-glow">
          <Send className="h-3.5 w-3.5" strokeWidth={2.5} />
          Publish
        </button>
      </div>
    </header>
  );
}

function IconBtn({ children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className="flex h-9 w-9 items-center justify-center rounded-lg border border-transparent text-muted-foreground transition-all hover:border-border hover:bg-white/[0.05] hover:text-foreground"
    >
      {children}
    </button>
  );
}
