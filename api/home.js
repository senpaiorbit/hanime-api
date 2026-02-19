// ============================================================
// api/home.js — GET /api/home
// Scrapes https://hanime.tv/ home page
// Returns all 4 sections: Recent Uploads, New Releases, Trending, Random
// ============================================================

const { scrapeHome } = require("../lib/scraper");
const { handleOptions, sendJSON, sendError } = require("../lib/cors");

module.exports = async function handler(req, res) {
  if (handleOptions(req, res)) return;
  if (req.method !== "GET") return sendError(res, 405, "Method Not Allowed");

  try {
    const data = await scrapeHome();
    const sectionNames = Object.keys(data.sections);

    return sendJSON(res, 200, {
      ok:            true,
      source:        data.source,
      section_count: sectionNames.length,
      sections:      data.sections,
      scraped_at:    new Date().toISOString(),
    });
  } catch (err) {
    console.error("[/api/home]", err.message);
    return sendError(res, 502, "Failed to scrape home page", err.message);
  }
};
