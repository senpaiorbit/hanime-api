// ============================================================
// api/search.js — GET /api/search?q=<query>&tags=<tag1,tag2>
// Returns search results
// ============================================================

const { scrapeSearch } = require("../lib/scraper");
const { handleOptions, sendJSON, sendError } = require("../lib/cors");

module.exports = async function handler(req, res) {
  if (handleOptions(req, res)) return;

  if (req.method !== "GET") {
    return sendError(res, 405, "Method Not Allowed");
  }

  const { q = "", tags = "" } = req.query;
  if (!q && !tags) {
    return sendError(res, 400, "Provide at least ?q= or ?tags= parameter");
  }

  const tagList = tags ? tags.split(",").map((t) => t.trim()).filter(Boolean) : [];

  try {
    const data = await scrapeSearch(q, tagList);
    return sendJSON(res, 200, {
      ok:         true,
      source:     data.source,
      query:      q,
      tags:       tagList,
      count:      data.results.length,
      results:    data.results,
      scraped_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error(`[/api/search?q=${q}]`, err.message);
    return sendError(res, 502, "Failed to scrape search results", err.message);
  }
};
