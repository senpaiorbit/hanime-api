// ============================================================
// api/trending.js — GET /api/trending
// Scrapes https://hanime.tv/browse/trending
//
// Query params:
//   period = day | week | month (default) | quarter | semi | year
//   page   = 1-N  (default 1, up to number_of_pages returned)
//
// Response includes monthly_rank, interests, likes, dislikes per video
// ============================================================

const { scrapeTrending } = require("../lib/scraper");
const { handleOptions, sendJSON, sendError } = require("../lib/cors");

const VALID_PERIODS = new Set(["day", "week", "month", "quarter", "semi", "year"]);

module.exports = async function handler(req, res) {
  if (handleOptions(req, res)) return;
  if (req.method !== "GET") return sendError(res, 405, "Method Not Allowed");

  const { period = "month", page = "1" } = req.query;

  if (!VALID_PERIODS.has(period)) {
    return sendError(
      res, 400,
      `Invalid period "${period}". Valid: day, week, month, quarter, semi, year`
    );
  }

  const pageNum = parseInt(page, 10);
  if (isNaN(pageNum) || pageNum < 1) {
    return sendError(res, 400, "page must be a positive integer");
  }

  try {
    const data = await scrapeTrending(period, pageNum);
    return sendJSON(res, 200, {
      ok:              true,
      source:          data.source,
      period,
      page:            data.page,
      page_size:       data.page_size,
      number_of_pages: data.number_of_pages,
      count:           data.videos.length,
      videos:          data.videos,
      scraped_at:      new Date().toISOString(),
    });
  } catch (err) {
    console.error(`[/api/trending?period=${period}&page=${pageNum}]`, err.message);
    return sendError(res, 502, "Failed to scrape trending page", err.message);
  }
};
