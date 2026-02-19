// ============================================================
//  lib/format.js — Shared data formatters
// ============================================================

/**
 * Shape a raw hanime.tv video object into a clean API response.
 */
export function formatVideo(v) {
  return {
    id:             v.id            ?? null,
    slug:           v.slug          ?? null,
    name:           v.name          ?? null,
    titles:         v.titles        ?? [],
    cover_url:      v.cover_url     ?? v.poster_url ?? null,
    thumbnail_url:  v.thumbnail_url ?? null,
    brand:          v.brand         ?? null,
    brand_id:       v.brand_id      ?? null,
    is_censored:    v.is_censored   ?? false,
    views:          v.views         ?? 0,
    likes:          v.likes         ?? 0,
    dislikes:       v.dislikes      ?? 0,
    downloads:      v.downloads     ?? 0,
    monthly_rank:   v.monthly_rank  ?? null,
    duration_in_ms: v.duration_in_ms ?? 0,
    released_at:    v.released_at_unix ?? null,
    created_at:     v.created_at_unix  ?? null,
    tags: (v.hentai_tags ?? []).map((t) => ({
      id:   t.id,
      text: t.text,
      slug: t.slug,
    })),
  };
}
