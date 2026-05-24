import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type CaseRow = {
  id: string;
  user_id: string;
  title: string;
  image_url: string;
  prompt: string;
  model_key: string | null;
  model_name: string | null;
  aspect_ratio: string | null;
  size: string | null;
  style_id: string | null;
  tags: string[];
  views: number;
  likes_count: number;
  favorites_count: number;
  created_at: string;
  author_name?: string | null;
  liked?: boolean;
  favorited?: boolean;
};

// List with filters
export const listCases = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        search: z.string().max(120).optional(),
        styleId: z.string().max(60).optional(),
        tag: z.string().max(60).optional(),
        modelKey: z.string().max(120).optional(),
        sort: z.enum(["latest", "hot", "views"]).optional(),
        limit: z.number().min(1).max(60).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const limit = data.limit ?? 40;
    let q = supabaseAdmin
      .from("inspiration_cases")
      .select("*")
      .eq("is_published", true)
      .limit(limit);
    if (data.search) {
      const s = `%${data.search.replace(/[%_]/g, "")}%`;
      q = q.or(`title.ilike.${s},prompt.ilike.${s}`);
    }
    if (data.styleId) q = q.eq("style_id", data.styleId);
    if (data.modelKey) q = q.eq("model_key", data.modelKey);
    if (data.tag) q = q.contains("tags", [data.tag]);
    if (data.sort === "hot") q = q.order("likes_count", { ascending: false });
    else if (data.sort === "views") q = q.order("views", { ascending: false });
    else q = q.order("created_at", { ascending: false });

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const list = (rows ?? []) as CaseRow[];
    if (list.length === 0) return [];

    const uid = context.userId;
    const ids = list.map((r) => r.id);
    const [{ data: likes }, { data: favs }, { data: authors }] = await Promise.all([
      supabaseAdmin.from("case_likes").select("case_id").in("case_id", ids).eq("user_id", uid),
      supabaseAdmin.from("case_favorites").select("case_id").in("case_id", ids).eq("user_id", uid),
      supabaseAdmin
        .from("profiles")
        .select("id, display_name")
        .in("id", Array.from(new Set(list.map((r) => r.user_id)))),
    ]);
    const likeSet = new Set((likes ?? []).map((r: any) => r.case_id));
    const favSet = new Set((favs ?? []).map((r: any) => r.case_id));
    const nameMap = new Map((authors ?? []).map((r: any) => [r.id, r.display_name]));
    return list.map((r) => ({
      ...r,
      liked: likeSet.has(r.id),
      favorited: favSet.has(r.id),
      author_name: nameMap.get(r.user_id) ?? null,
    }));
  });

// Get tags & models for filter chips
export const listCaseFacets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { data, error } = await supabaseAdmin
      .from("inspiration_cases")
      .select("tags, model_key, model_name, style_id")
      .eq("is_published", true)
      .limit(500);
    if (error) throw new Error(error.message);
    const tagCount = new Map<string, number>();
    const modelMap = new Map<string, string>();
    for (const r of (data ?? []) as any[]) {
      for (const t of (r.tags ?? []) as string[]) tagCount.set(t, (tagCount.get(t) ?? 0) + 1);
      if (r.model_key) modelMap.set(r.model_key, r.model_name ?? r.model_key);
    }
    const hotTags = Array.from(tagCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 16)
      .map(([name, count]) => ({ name, count }));
    const models = Array.from(modelMap.entries()).map(([key, name]) => ({ key, name }));
    return { hotTags, models };
  });

// Case detail + comments
export const getCaseDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ caseId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const uid = context.userId;
    const [{ data: row, error }, { data: comments }, { data: like }, { data: fav }] =
      await Promise.all([
        supabaseAdmin.from("inspiration_cases").select("*").eq("id", data.caseId).maybeSingle(),
        supabaseAdmin
          .from("case_comments")
          .select("id, user_id, content, created_at")
          .eq("case_id", data.caseId)
          .order("created_at", { ascending: false })
          .limit(100),
        supabaseAdmin
          .from("case_likes")
          .select("case_id")
          .eq("case_id", data.caseId)
          .eq("user_id", uid)
          .maybeSingle(),
        supabaseAdmin
          .from("case_favorites")
          .select("case_id")
          .eq("case_id", data.caseId)
          .eq("user_id", uid)
          .maybeSingle(),
      ]);
    if (error) throw new Error(error.message);
    if (!row) throw new Error("案例不存在");

    const userIds = Array.from(
      new Set([(row as any).user_id, ...((comments ?? []).map((c: any) => c.user_id))]),
    );
    const { data: profs } = await supabaseAdmin
      .from("profiles")
      .select("id, display_name")
      .in("id", userIds);
    const nameMap = new Map((profs ?? []).map((p: any) => [p.id, p.display_name]));

    return {
      ...(row as any),
      author_name: nameMap.get((row as any).user_id) ?? null,
      liked: !!like,
      favorited: !!fav,
      comments: (comments ?? []).map((c: any) => ({
        ...c,
        author_name: nameMap.get(c.user_id) ?? null,
      })),
    };
  });

export const incrementCaseView = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ caseId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    await supabaseAdmin.rpc("increment_case_view", { _case_id: data.caseId });
    return { ok: true };
  });

export const toggleCaseLike = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ caseId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const uid = context.userId;
    const { data: existing } = await supabaseAdmin
      .from("case_likes")
      .select("case_id")
      .eq("case_id", data.caseId)
      .eq("user_id", uid)
      .maybeSingle();
    if (existing) {
      const { error } = await supabaseAdmin
        .from("case_likes")
        .delete()
        .eq("case_id", data.caseId)
        .eq("user_id", uid);
      if (error) throw new Error(error.message);
      return { liked: false };
    }
    const { error } = await supabaseAdmin
      .from("case_likes")
      .insert({ case_id: data.caseId, user_id: uid });
    if (error) throw new Error(error.message);
    return { liked: true };
  });

export const toggleCaseFavorite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ caseId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const uid = context.userId;
    const { data: existing } = await supabaseAdmin
      .from("case_favorites")
      .select("case_id")
      .eq("case_id", data.caseId)
      .eq("user_id", uid)
      .maybeSingle();
    if (existing) {
      const { error } = await supabaseAdmin
        .from("case_favorites")
        .delete()
        .eq("case_id", data.caseId)
        .eq("user_id", uid);
      if (error) throw new Error(error.message);
      return { favorited: false };
    }
    const { error } = await supabaseAdmin
      .from("case_favorites")
      .insert({ case_id: data.caseId, user_id: uid });
    if (error) throw new Error(error.message);
    return { favorited: true };
  });

export const addCaseComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ caseId: z.string().uuid(), content: z.string().min(1).max(500) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await supabaseAdmin
      .from("case_comments")
      .insert({ case_id: data.caseId, user_id: context.userId, content: data.content });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const publishCase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        title: z.string().min(1).max(80),
        imageUrl: z.string().url().max(2048),
        prompt: z.string().max(4000).optional(),
        modelKey: z.string().max(120).optional(),
        modelName: z.string().max(120).optional(),
        aspectRatio: z.string().max(20).optional(),
        size: z.string().max(20).optional(),
        styleId: z.string().max(60).optional(),
        tags: z.array(z.string().min(1).max(20)).max(8).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await supabaseAdmin
      .from("inspiration_cases")
      .insert({
        user_id: context.userId,
        title: data.title,
        image_url: data.imageUrl,
        prompt: data.prompt ?? "",
        model_key: data.modelKey ?? null,
        model_name: data.modelName ?? null,
        aspect_ratio: data.aspectRatio ?? null,
        size: data.size ?? null,
        style_id: data.styleId ?? null,
        tags: data.tags ?? [],
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: (row as any).id };
  });
