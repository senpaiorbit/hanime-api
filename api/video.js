// ============================================================
// api/video.js — GET /api/video?slug=<slug>
// Returns detail for a single video
// ============================================================

const { scrapeVideo } = require("../lib/scraper");
const { handleOptions, sendJSON, sendError } = require("../lib/cors");

module.exports = async function handler(req, res) {
  if (handleOptions(req, res)) return;

  if (req.method !== "GET") {
    return sendError(res, 405, "Method Not Allowed");
  }

  const { slug } = req.query;
  if (!slug || typeof slug !== "string") {
    return sendError(res, 400, "Missing or invalid ?slug= parameter");
  }

  // Sanitise slug
  const clean = slug.replace(/[^a-z0-9-]/gi, "").toLowerCase();
  if (!clean) {
    return sendError(res, 400, "Invalid slug");
  }

  try {
    const data = await scrapeVideo(clean);
    return sendJSON(res, 200, {
      ok:         true,
      source:     data.source,
      video:      data.video,
      scraped_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error(`[/api/video?slug=${clean}]`, err.message);
    return sendError(res, 502, "Failed to scrape video page", err.message);
  }
};
