import { getD1AccessToken } from "@/lib/d1-auth-client";

export type R2UploadScope =
  | "avatar"
  | "reference-image"
  | "announcement-image"
  | "style-template-image";

export async function uploadImageToR2(
  file: File,
  scope: R2UploadScope,
): Promise<{ key: string; url: string }> {
  const accessToken = await getD1AccessToken();
  if (!accessToken) throw new Error("请先登录");

  const form = new FormData();
  form.set("scope", scope);
  form.set("file", file, file.name || "upload");
  const response = await fetch("/api/storage/upload", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form,
  });
  const payload = (await response.json().catch(() => null)) as {
    error?: string;
    key?: string;
    url?: string;
  } | null;
  if (!response.ok || !payload?.key || !payload.url) {
    throw new Error(payload?.error || `上传失败（${response.status}）`);
  }
  return { key: payload.key, url: payload.url };
}
