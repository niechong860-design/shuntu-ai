import { createFileRoute } from "@tanstack/react-router";
import { handleBearerAuth } from "@/lib/d1-bearer-auth";

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: ({ request }) => handleBearerAuth(request),
      POST: ({ request }) => handleBearerAuth(request),
      PUT: ({ request }) => handleBearerAuth(request),
      PATCH: ({ request }) => handleBearerAuth(request),
      DELETE: ({ request }) => handleBearerAuth(request),
      OPTIONS: ({ request }) => handleBearerAuth(request),
    },
  },
});
