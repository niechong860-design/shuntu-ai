import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { authenticateBearer } from "@/lib/d1-bearer-auth";

export const requireD1Auth = createMiddleware({ type: "function" }).server(
  async ({ next, context }) => {
    const request = getRequest();
    if (!request?.headers) throw new Error("Unauthorized: No request headers available");
    const { userId, claims } = await authenticateBearer(request);
    return next({
      context: {
        ...(context && typeof context === "object" ? context : {}),
        userId,
        claims,
      },
    });
  },
);
