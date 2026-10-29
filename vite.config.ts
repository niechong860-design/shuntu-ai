import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";

const tanstackStartOptions = {
  importProtection: {
    behavior: "error" as const,
    client: {
      files: ["**/server/**"],
      specifiers: ["server-only"],
    },
  },
};

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const envDefine = Object.fromEntries(
    Object.entries(env).map(([key, value]) => [`import.meta.env.${key}`, JSON.stringify(value)]),
  );

  const plugins = [
    tailwindcss(),
    tsconfigPaths({ projects: ["./tsconfig.json"] }),
    tanstackStart({
      ...tanstackStartOptions,
      server: { entry: "server" },
    }),
    ...(command === "build"
      ? [
          nitro({
            defaultPreset: "cloudflare-module",
            plugins: ["./plugins/replication-outbox.ts"],
            cloudflare: { exports: "./exports.cloudflare.mjs" },
          } as never),
        ]
      : []),
    react(),
  ];

  return {
    define: envDefine,
    css: { transformer: "lightningcss" },
    resolve: {
      alias: {
        "@": `${process.cwd()}/src`,
        ...(command === "build"
          ? {}
          : { "cloudflare:workers": `${process.cwd()}/src/lib/cloudflare-workers-dev.ts` }),
      },
      dedupe: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "@tanstack/react-query",
        "@tanstack/query-core",
      ],
    },
    plugins,
    server: { host: "127.0.0.1", port: 8080, strictPort: true },
    build: { rollupOptions: { external: ["cloudflare:workers"] } },
  };
});
