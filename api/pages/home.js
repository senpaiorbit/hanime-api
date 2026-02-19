// ============================================================
//  api/pages/home.js — Scrape homepage sliders / featured
//  Endpoint: GET /api/v1/home
// ============================================================

import { CONFIG } from "../../config.js";
import { fetchUpstream } from "../../lib/scraper.js";

/**
 * Fetch & shape homepage data.
 * Returns an array of slider sections, each containing videos.
 */
export async function getHome() {
  const raw = await fetchUpstream(CONFIG.ENDPOINTS.HOME);

  // `browse_sliders` is an array of section objects
  const sliders = (raw.browse_sliders || []).map((slider) => ({
    title:       slider.title || slider.name || "Unknown",
    slug:        slider.slug  || null,
    description: slider.description || null,
    videos:      (slider.hentai_videos || []).map(formatVideo),
  }));

  return {
    sliders,
    total_sections: sliders.length,
  };
}

// ── Shared video formatter ────────────────────────────────────
export function formatVideo(v) {
  return {
    id:            v.id,
    slug:          v.slug,
    name:          v.name,
    titles:        v.titles || [],
    cover_url:     v.cover_url || v.poster_url || null,
    thumbnail_url: v.thumbnail_url || null,
    views:         v.views || 0,
    likes:         v.likes || 0,
    dislikes:      v.dislikes || 0,
    downloads:     v.downloads || 0,
    monthly_rank:  v.monthly_rank || null,
    brand:         v.brand || null,
    duration_in_ms:v.duration_in_ms || 0,
    is_censored:   v.is_censored || false,
    tags:          (v.hentai_tags || []).map((t) => ({
      id:   t.id,
      text: t.text,
      slug: t.slug,
    })),
    released_at:   v.released_at_unix || null,
    created_at:    v.created_at_unix  || null,
  };
}
