import { useState } from "react";
import { Sparkles, Zap, Plus, Bell, History } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { UserMenu } from "@/components/auth/UserMenu";
import { RedeemDialog } from "@/components/auth/RedeemDialog";
import { AdBanner } from "./AdBanner";


type Props = {
  credits: number;
  onOpenHistory: () => void;
  onSwitchAccount: () => void;
};

export function TopBar({ credits, onOpenHistory, onSwitchAccount }: Props) {
  const [redeemOpen, setRedeemOpen] = useState(false);
  return (
    <header className="flex h-14 w-full shrink-0 items-center justify-between border-b border-border/60 bg-card/70 px-4 backdrop-blur-2xl">
      {/* Left: Logo */}
      <div className="flex items-center gap-2.5">
        <div className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-aurora shadow-glow">
          <Sparkles className="h-4 w-4 text-primary-foreground" strokeWidth={2.5} />
        </div>
        <div className="font-display text-[15px] font-semibold tracking-tight" translate="no">
          ShunTu
        </div>
      </div>

      {/* Middle: Ad banner */}
      <AdBanner />

      {/* Right: nav + actions */}
      <div className="flex items-center gap-1 pr-3">
        <NavLinkTo to="/">在线生成</NavLinkTo>
        <NavLinkTo to="/inspiration">使用案例</NavLinkTo>
        <NavLink>联系客服</NavLink>
      </div>


      <div className="flex items-center gap-2">
        <IconBtn title="历史记录" onClick={onOpenHistory}><History className="h-4 w-4" /></IconBtn>
        <IconBtn title="通知">
          <span className="relative">
            <Bell className="h-4 w-4" />
            <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-primary" />
          </span>
        </IconBtn>
        <UserMenu onSwitchAccount={onSwitchAccount} />
        <div className="mx-1 h-6 w-px bg-border" />
        <div className="flex items-center gap-2 rounded-full border border-border bg-white/[0.03] px-3 py-1.5">
          <Zap className="h-3.5 w-3.5 text-primary" fill="currentColor" />
          <span className="font-mono text-xs font-semibold tabular-nums">{credits.toLocaleString()}</span>
          <span className="text-[10px] font-light text-muted-foreground">点</span>
        </div>
        <button
          onClick={() => setRedeemOpen(true)}
          className="flex items-center gap-1.5 rounded-full bg-gradient-aurora px-3.5 py-1.5 text-xs font-semibold text-primary-foreground shadow-glow transition-transform hover:scale-[1.03]"
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={3} />
          充值
        </button>
      </div>
      <RedeemDialog open={redeemOpen} onOpenChange={setRedeemOpen} />
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

function NavLink({ children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className="rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-white/[0.05] hover:text-foreground"
    >
      {children}
    </button>
  );
}

function NavLinkTo({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className="rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-white/[0.05] hover:text-foreground"
      activeProps={{ className: "rounded-md px-3 py-1.5 text-xs font-medium text-foreground bg-white/[0.05]" }}
    >
      {children}
    </Link>
  );
}

