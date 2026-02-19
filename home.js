// ============================================================
// api/home.js — GET /api/home
// Returns all home page sections (Recent Uploads, Trending, etc.)
// ============================================================

const { scrapHome } = require("../lib/scraper");
const { handleOptions, sendJSON, sendError } = require("../lib/cors");

module.exports = async function handler(req, res) {
  if (handleOptions(req, res)) return;

  if (req.method !== "GET") {
    return sendError(res, 405, "Method Not Allowed");
  }

  try {
    const data = await scrapHome();
    return sendJSON(res, 200, {
      ok:       true,
      source:   data.source,
      sections: data.sections,
      scraped_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[/api/home]", err.message);
    return sendError(res, 502, "Failed to scrape home page", err.message);
  }
};
