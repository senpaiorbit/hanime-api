// ============================================================
// api/random.js — GET /api/random
// Scrapes https://hanime.tv/browse/random
//
// Returns 24 random videos per request — never cached.
// Each call hits hanime.tv fresh, so results differ every time.
// Response includes full video metadata: brand, duration, likes, etc.
// ============================================================

const { scrapeRandom } = require("../lib/scraper");
const { handleOptions, sendJSON, sendError } = require("../lib/cors");

module.exports = async function handler(req, res) {
  if (handleOptions(req, res)) return;
  if (req.method !== "GET") return sendError(res, 405, "Method Not Allowed");

  try {
    const data = await scrapeRandom();
    return sendJSON(res, 200, {
      ok:         true,
      source:     data.source,  // always "live"
      count:      data.videos.length,
      videos:     data.videos,
      scraped_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[/api/random]", err.message);
    return sendError(res, 502, "Failed to scrape random page", err.message);
  }
};
