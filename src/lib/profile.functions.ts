import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Profile } from "@/lib/business-database";
import { createBusinessDatabaseFromContext } from "@/lib/business-database-router";

type PublicProfile = Pick<Profile, "id" | "email" | "display_name" | "avatar_url" | "credits">;

const updateProfileInput = z.object({
  displayName: z.string().trim().min(0).max(80).optional(),
  avatarUrl: z.string().url().max(2048).nullable().optional(),
});

function getBusinessDb(context: unknown) {
  return createBusinessDatabaseFromContext(context as Parameters<typeof createBusinessDatabaseFromContext>[0]);
}

function claimEmail(claims: unknown): string | null {
  return claims && typeof claims === "object" && typeof (claims as { email?: unknown }).email === "string"
    ? (claims as { email: string }).email
    : null;
}

function toPublicProfile(profile: Profile): PublicProfile {
  return {
    id: profile.id,
    email: profile.email,
    display_name: profile.display_name,
    avatar_url: profile.avatar_url,
    credits: Number(profile.credits ?? 0),
  };
}

export const getCurrentProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = getBusinessDb(context);
    const existing = await db.getProfile(context.userId);
    if (existing) return toPublicProfile(existing);

    if (db.primary === "lovable") return null;
    const created = await db.ensureProfile({
      id: context.userId,
      email: claimEmail(context.claims),
    });
    return toPublicProfile(created);
  });

export const updateCurrentProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => updateProfileInput.parse(input))
  .handler(async ({ context, data }) => {
    const db = getBusinessDb(context);
    const profile = await db.updateProfile({
      userId: context.userId,
      email: claimEmail(context.claims),
      displayName: data.displayName,
      avatarUrl: data.avatarUrl,
    });
    return toPublicProfile(profile);
  });
