import { authenticateBearer } from "./d1-bearer-auth";

// Compatibility name preserves all existing middleware registrations. No
// Supabase-issued token is accepted by the new D1 authentication boundary.
export async function authenticateSupabaseRequest(request: Request) {
  const auth = await authenticateBearer(request);
  return { supabase: undefined, userId: auth.userId, claims: auth.claims };
}
