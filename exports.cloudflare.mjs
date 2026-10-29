// Nitro's Worker entry must also export the existing container Durable Object.
// Use the already compiled Start server module, preserving its runtime identity.
export { SharpImageProcessor } from "./node_modules/.nitro/vite/services/ssr/index.js";
