import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route = createFileRoute("/inspiration")({
  beforeLoad: () => {
    throw redirect({ to: "/" });
  },
});
