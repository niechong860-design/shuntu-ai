import { createContext } from "react";
import type { D1AuthSession, D1AuthUser } from "@/lib/d1-auth-client";

export type Profile = {
  id: string;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
  credits: number;
};

export type AuthCtx = {
  session: D1AuthSession | null;
  user: D1AuthUser | null;
  profile: Profile | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};

export const Ctx = createContext<AuthCtx | null>(null);
