import assert from "node:assert/strict";
import test from "node:test";
import { historyThumbUrl, normalizeLegacyImageUrl, thumbUrl } from "../src/lib/image-url.ts";

test("legacy Supabase transform URLs resolve to original object URLs", () => {
  const input =
    "https://project.example.supabase.co/storage/v1/render/image/public/avatars/user.png?width=480&quality=62&resize=contain&token=synthetic-token&v=3";
  const expected =
    "https://project.example.supabase.co/storage/v1/object/public/avatars/user.png?token=synthetic-token&v=3";

  assert.equal(normalizeLegacyImageUrl(input), expected);
  assert.equal(thumbUrl(input, { quality: 65 }), expected);
  assert.equal(historyThumbUrl(input), expected);
  assert.equal(
    thumbUrl("https://project.example.supabase.co/storage/v1/object/public/avatars/user.png"),
    "https://project.example.supabase.co/storage/v1/object/public/avatars/user.png",
  );
  assert.equal(
    thumbUrl("https://img.shuntu.cc/generated/2026/10/task.png"),
    "https://img.shuntu.cc/generated/2026/10/task.png",
  );
  assert.equal(
    thumbUrl("data:image/png;base64,c3ludGhldGlj"),
    "data:image/png;base64,c3ludGhldGlj",
  );
  assert.equal(thumbUrl("/style-previews/style-01.webp"), "/style-previews/style-01.webp");

  for (const value of [expected, thumbUrl("https://img.shuntu.cc/generated/2026/10/task.png")]) {
    assert.equal(value.includes("/storage/v1/render/image/"), false);
  }
});
