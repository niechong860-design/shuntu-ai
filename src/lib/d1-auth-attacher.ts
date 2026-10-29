import { createMiddleware } from "@tanstack/react-start";
import { getD1AccessToken } from "@/lib/d1-auth-client";

export const attachD1Auth = createMiddleware({ type: "function" }).client(async ({ next }) => {
  const token = await getD1AccessToken();
  return next({ headers: token ? { Authorization: `Bearer ${token}` } : {} });
});
