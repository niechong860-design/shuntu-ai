import { createFileRoute } from "@tanstack/react-router";
import { requireRole } from "@/lib/d1-bearer-auth";
import { authenticateD1Request } from "@/lib/d1-request-auth";
import { getCloudflareEnv, type R2BucketLike } from "@/lib/r2-image-preview";
import { createR2Object } from "@/lib/r2-create-only";

const MAX_FILE_BYTES = 15 * 1024 * 1024;
const PUBLIC_BASE_FALLBACK = "https://img.shuntu.cc";
const ALLOWED_SCOPES = new Set([
  "avatar",
  "reference-image",
  "announcement-image",
  "style-template-image",
]);
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

function extensionFor(contentType: string, filename: string): string {
  if (contentType === "image/jpeg") return "jpg";
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  if (contentType === "image/gif") return "gif";
  const extension = filename
    .split(".")
    .pop()
    ?.toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  return extension && extension.length <= 5 ? extension : "bin";
}

function safeId() {
  return crypto.randomUUID();
}

async function assertAdmin(userId: string) {
  await requireRole(userId, ["admin", "founder"]);
}

function getKey(scope: string, userId: string, extension: string): string {
  const id = safeId();
  if (scope === "avatar") return `avatars/${userId}/${id}.${extension}`;
  if (scope === "reference-image") return `reference-images/${userId}/${id}.${extension}`;
  if (scope === "announcement-image") return `admin-assets/announcements/${id}.${extension}`;
  return `admin-assets/style-templates/${id}.${extension}`;
}

async function upload(request: Request): Promise<Response> {
  let auth: Awaited<ReturnType<typeof authenticateD1Request>>;
  try {
    auth = await authenticateD1Request(request);
  } catch {
    return Response.json({ error: "未登录或登录已过期" }, { status: 401 });
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_FILE_BYTES + 32 * 1024)
    return Response.json({ error: "图片大小超过限制" }, { status: 413 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "上传格式无效" }, { status: 400 });
  }
  const scope = String(form.get("scope") ?? "");
  const file = form.get("file");
  if (!ALLOWED_SCOPES.has(scope) || !(file instanceof File))
    return Response.json({ error: "缺少有效图片" }, { status: 400 });
  if (!IMAGE_TYPES.has(file.type))
    return Response.json({ error: "仅支持 JPG、PNG、WEBP 或 GIF 图片" }, { status: 415 });
  if (file.size <= 0 || file.size > MAX_FILE_BYTES)
    return Response.json({ error: "图片大小超过限制" }, { status: 413 });

  if (scope === "announcement-image" || scope === "style-template-image") {
    try {
      await assertAdmin(auth.userId);
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : "无权上传后台资源" },
        { status: 403 },
      );
    }
  }

  const env = getCloudflareEnv();
  const bucket = env.SHUNTU_GENERATED_IMAGES as R2BucketLike | undefined;
  if (!bucket || typeof bucket.put !== "function")
    return Response.json({ error: "R2 存储不可用" }, { status: 503 });

  const key = getKey(scope, auth.userId, extensionFor(file.type, file.name));
  try {
    if (!(await createR2Object(bucket, key, await file.arrayBuffer(), file.type)))
      return Response.json({ error: "图片已存在，请重新上传" }, { status: 409 });
  } catch {
    return Response.json({ error: "图片上传失败，请稍后重试" }, { status: 503 });
  }
  const baseUrl = String(env.R2_PUBLIC_BASE_URL ?? PUBLIC_BASE_FALLBACK).replace(/\/+$/, "");
  return Response.json({ key, url: `${baseUrl}/${key}` }, { status: 201 });
}

export const Route = createFileRoute("/api/storage/upload")({
  server: {
    handlers: {
      POST: ({ request }) => upload(request),
    },
  },
});
