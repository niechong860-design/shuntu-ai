import { lazy, Suspense, useState } from "react";
import { Zap, Plus, Bell, History } from "lucide-react";
import shuntuLogo from "@/assets/shuntu-logo.png";
import { Link } from "@tanstack/react-router";
import { UserMenu } from "@/components/auth/UserMenu";
import { AdBanner } from "./AdBanner";

const RedeemDialog = lazy(() => import("@/components/auth/RedeemDialog").then((m) => ({ default: m.RedeemDialog })));
const ContactDialog = lazy(() => import("./ContactDialog").then((m) => ({ default: m.ContactDialog })));


type Props = {
  credits: number;
  onOpenHistory: () => void;
  onOpenAnnouncements: () => void;
  onSwitchAccount: () => void;
};

export function TopBar({ credits, onOpenHistory, onOpenAnnouncements, onSwitchAccount }: Props) {
  const [redeemOpen, setRedeemOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  return (
    <header className="flex min-h-14 w-full shrink-0 flex-wrap items-center gap-2 border-b border-border/60 bg-card/70 px-2 py-2 backdrop-blur-2xl md:h-14 md:flex-nowrap md:justify-between md:gap-0 md:px-4 md:py-0">
      {/* Left: Logo — 点击回到生成主页并刷新 */}
      <button
        type="button"
        title="返回主页并刷新"
        onClick={() => {
          if (window.location.pathname === "/") {
            window.location.reload();
          } else {
            window.location.assign("/");
          }
        }}
        className="flex shrink-0 items-center gap-2.5 bg-transparent p-1 focus:outline-none focus-visible:outline-none"
      >
        <img src={shuntuLogo} alt="ShunTu 返回主页" className="h-9 w-auto object-contain" />
      </button>

      {/* Middle: Ad banner */}
      <AdBanner />

      {/* Right: nav + actions */}
      <div className="hidden md:flex md:items-center md:gap-1 md:pr-3">
        <NavLinkTo to="/">在线生成</NavLinkTo>
        <NavLinkTo to="/inspiration">灵感广场</NavLinkTo>
        <NavLink onClick={() => setContactOpen(true)}>联系客服</NavLink>
      </div>


      <div className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-1 md:ml-0 md:flex-none md:gap-2">
        <IconBtn title="历史记录" onClick={onOpenHistory}><History className="h-4 w-4" /></IconBtn>
        <IconBtn title="通知公告" onClick={onOpenAnnouncements}>
          <span className="relative">
            <Bell className="h-4 w-4" />
            <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-primary" />
          </span>
        </IconBtn>
        <UserMenu onSwitchAccount={onSwitchAccount} />
        <div className="mx-0.5 h-6 w-px shrink-0 bg-border md:mx-1" />
        <div className="flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-white/[0.03] px-2 py-1.5 md:gap-2 md:px-3">
          <Zap className="h-3.5 w-3.5 text-primary" fill="currentColor" />
          <span className="font-mono text-xs font-semibold tabular-nums">{credits.toLocaleString()}</span>
          <span className="text-[10px] font-light text-muted-foreground">点</span>
        </div>
        <button
          onClick={() => setRedeemOpen(true)}
          className="flex shrink-0 items-center gap-1 rounded-full bg-gradient-aurora px-2.5 py-1.5 text-xs font-semibold text-primary-foreground shadow-glow transition-transform hover:scale-[1.03] md:gap-1.5 md:px-3.5"
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={3} />
          充值
        </button>
      </div>
      {redeemOpen && (
        <Suspense fallback={null}>
          <RedeemDialog open={redeemOpen} onOpenChange={setRedeemOpen} />
        </Suspense>
      )}
      {contactOpen && (
        <Suspense fallback={null}>
          <ContactDialog open={contactOpen} onOpenChange={setContactOpen} />
        </Suspense>
      )}
    </header>
  );
}

function IconBtn({ children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-transparent text-muted-foreground transition-all hover:border-border hover:bg-white/[0.05] hover:text-foreground md:h-9 md:w-9"
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

function NavLinkTo({ to, children }: { to: "/" | "/inspiration"; children: React.ReactNode }) {
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


