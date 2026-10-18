# Shuntu Sharp image processor

This small Node.js service creates the JPEG preview variants used by the Cloudflare Worker:

- 480px maximum edge for history cards (quality 78)
- 1024px maximum edge for the canvas and lightbox (quality 82)

The service receives image bytes over an authenticated server-to-server request. It does not access D1 or R2 and does not store images. The Worker remains responsible for reading the original from R2 and writing preview variants back to R2.

## Run

Use Node.js 20.9 or newer. Set the SHARP_IMAGE_PROCESSOR_TOKEN environment variable to a long random secret, then run npm ci, npm test, and npm start.

The service listens on port 8080 by default. GET /healthz is a health check. POST /v1/previews requires Authorization: Bearer token and accepts image/png, image/jpeg, or image/webp bytes. Inputs are limited to 30 MiB and 100 million pixels.

## Container

Build this directory as a Docker image and run it behind HTTPS. Set SHARP_IMAGE_PROCESSOR_TOKEN as a service secret. Configure the Cloudflare Worker with the same token as a secret and SHARP_IMAGE_PROCESSOR_URL as the service's HTTPS base URL. Keep the processor private or restrict inbound traffic to the Worker where the hosting platform supports it.

Do not place the token in wrangler.jsonc, source control, or a client-side bundle.
