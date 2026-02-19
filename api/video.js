// ============================================================
// api/video.js — GET /api/video?slug=:slug
// Scrapes https://hanime.tv/videos/hentai/:slug
//
// Returns full video data including:
//   - Core metadata (name, views, likes, brand, censorship, etc.)
//   - tags[]          enriched with count, description, image URLs
//   - titles[]        alternate/official titles with lang codes
//   - streams[]       HLS/MP4 playable URLs with resolution info
//   - storyboards[]   sprite sheets for timeline scrubbing
//   - franchise       sibling episodes in the same series
//   - brand           studio info with upload count
//   - next_video      next recommended video
//   - next_random     random next suggestion
//   - player_url      hanime player embed URL
//   - description     episode synopsis (HTML)
// ============================================================

const { scrapeVideo } = require("../lib/scraper");
const { handleOptions, sendJSON, sendError } = require("../lib/cors");

module.exports = async function handler(req, res) {
  if (handleOptions(req, res)) return;
  if (req.method !== "GET") return sendError(res, 405, "Method Not Allowed");

  const { slug } = req.query;
  if (!slug || typeof slug !== "string") {
    return sendError(res, 400, "slug query param is required. e.g. /api/video?slug=natsu-to-hako-1");
  }

  // Sanitise: allow only alphanumeric + hyphens
  const clean = slug.replace(/[^a-z0-9-]/gi, "").toLowerCase();
  if (!clean) return sendError(res, 400, "Invalid slug");

  try {
    const data = await scrapeVideo(clean);
    const v    = data.video;

    return sendJSON(res, 200, {
      ok:         true,
      source:     data.source,
      video: {
        // ── Core ─────────────────────────────────────────────
        id:               v.id,
        name:             v.name,
        slug:             v.slug,
        description:      v.description,
        url:              v.url,
        player_url:       v.player_url,
        // ── Stats ────────────────────────────────────────────
        views:            v.views,
        interests:        v.interests,
        likes:            v.likes,
        dislikes:         v.dislikes,
        downloads:        v.downloads    ?? null,
        monthly_rank:     v.monthly_rank,
        // ── Media ────────────────────────────────────────────
        cover_url:        v.cover_url,
        poster_url:       v.poster_url,
        duration_ms:      v.duration_ms,
        // ── Classification ───────────────────────────────────
        is_censored:      v.is_censored,
        brand:            v.brand,
        brand_id:         v.brand_id,
        // ── Dates ────────────────────────────────────────────
        released_at:      v.released_at,
        created_at:       v.created_at,
        released_at_unix: v.released_at_unix,
        created_at_unix:  v.created_at_unix,
        // ── Enriched ─────────────────────────────────────────
        titles:           v.titles       ?? [],
        tags:             v.tags         ?? [],
        streams:          v.streams      ?? [],
        storyboards:      v.storyboards  ?? [],
        franchise:        v.franchise    ?? null,
        brand_detail:     v.brand        ?? null,
        next_video:       v.next_video   ?? null,
        next_random:      v.next_random  ?? null,
      },
      scraped_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error(`[/api/video?slug=${clean}]`, err.message);
    return sendError(res, 502, "Failed to scrape video page", err.message);
  }
};
