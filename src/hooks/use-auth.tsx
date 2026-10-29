import { useContext } from "react";
import { Ctx, type AuthCtx } from "./auth-context";
export type { Profile } from "./auth-context";

const FALLBACK: AuthCtx = {
  session: null,
  user: null,
  profile: null,
  loading: true,
  refreshProfile: async () => {},
  signOut: async () => {},
};

export function useAuth() {
  const v = useContext(Ctx);
  return v ?? FALLBACK;
}
