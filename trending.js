// ============================================================
// api/trending.js — GET /api/trending
// Returns trending videos (past 30 days)
// ============================================================

const { scrapeTrending } = require("../lib/scraper");
const { handleOptions, sendJSON, sendError } = require("../lib/cors");

module.exports = async function handler(req, res) {
  if (handleOptions(req, res)) return;

  if (req.method !== "GET") {
    return sendError(res, 405, "Method Not Allowed");
  }

  try {
    const data = await scrapeTrending();
    return sendJSON(res, 200, {
      ok:         true,
      source:     data.source,
      count:      data.results.length,
      results:    data.results,
      scraped_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[/api/trending]", err.message);
    return sendError(res, 502, "Failed to scrape trending page", err.message);
  }
};
