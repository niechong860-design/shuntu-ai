import { Ctx, type Profile } from "./auth-context";
import { useEffect, useState, useCallback, useRef, ReactNode } from "react";
import type { D1AuthSession } from "@/lib/d1-auth-client";
import { d1Auth } from "@/lib/d1-auth-client";
import { getCurrentProfile } from "@/lib/profile.functions";
import { clearAllPreviewCache } from "@/lib/preview-cache";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<D1AuthSession | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const cacheUserIdRef = useRef<string | null>(null);

  const loadProfile = useCallback(async (uid: string) => {
    try {
      const data = await getCurrentProfile();
      if (data?.id === uid) setProfile({ ...data, credits: Number(data.credits ?? 0) } as Profile);
      else setProfile(null);
    } catch {
      setProfile(null);
    }
  }, []);

  useEffect(() => {
    const {
      data: { subscription },
    } = d1Auth.auth.onAuthStateChange((_e, s) => {
      // Stored state is not proof that the D1 session is still active.
      if (_e === "INITIAL_SESSION") return;
      setSession(s);
      const nextUserId = s?.user?.id ?? null;
      if (cacheUserIdRef.current !== nextUserId) {
        clearAllPreviewCache();
        cacheUserIdRef.current = nextUserId;
      }
      if (s?.user) {
        setTimeout(() => loadProfile(s.user.id), 0);
      } else {
        setProfile(null);
      }
    });
    d1Auth.auth.getSession().then(async ({ data }) => {
      if (data.session) {
        const verified = await d1Auth.auth.getUser();
        if (verified.error || verified.data.user?.id !== data.session.user.id) {
          await d1Auth.auth.signOut();
          setSession(null);
          setProfile(null);
          cacheUserIdRef.current = null;
          setLoading(false);
          return;
        }
      }
      setSession(data.session);
      cacheUserIdRef.current = data.session?.user?.id ?? null;
      if (data.session?.user) loadProfile(data.session.user.id);
      setLoading(false);
    });
    return () => subscription.unsubscribe();
  }, [loadProfile]);

  const refreshProfile = useCallback(async () => {
    if (session?.user) await loadProfile(session.user.id);
  }, [session, loadProfile]);

  const signOut = useCallback(async () => {
    await d1Auth.auth.signOut();
    clearAllPreviewCache();
    cacheUserIdRef.current = null;
    setSession(null);
    setProfile(null);
  }, []);

  return (
    <Ctx.Provider
      value={{
        session,
        user: session?.user ?? null,
        profile,
        loading,
        refreshProfile,
        signOut,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}
