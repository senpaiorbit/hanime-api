// ============================================================
// config.js — hanime.tv Vercel Scraper Configuration
// ============================================================

module.exports = {
  // ── Base URLs ──────────────────────────────────────────────
  BASE_URL: "https://hanime.tv",
  API_BASE: "https://hanime.tv/api/v8",
  CDN_BASE: "https://hanime-cdn.com",
  SEARCH_URL: "https://cached.freeanimehentai.net/api/v10/search_hvs",

  // ── Scraping Targets ───────────────────────────────────────
  ENDPOINTS: {
    home:     "/",
    trending: "/browse/trending",
    random:   "/browse/random",
    search:   "/search",
    browse:   "/browse",
    video:    "/videos/hentai", // append /:slug
    tags:     "/browse/tags",
  },

  // ── Request Headers (mimics real browser) ─────────────────
  HEADERS: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
      "AppleWebKit/537.36 (KHTML, like Gecko) " +
      "Chrome/122.0.0.0 Safari/537.36",
    "Accept":
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Cache-Control":   "no-cache",
    "Pragma":          "no-cache",
    "Referer":         "https://hanime.tv/",
    "Origin":          "https://hanime.tv",
    "DNT":             "1",
    "Connection":      "keep-alive",
    "Sec-Fetch-Dest":  "document",
    "Sec-Fetch-Mode":  "navigate",
    "Sec-Fetch-Site":  "same-origin",
    "Upgrade-Insecure-Requests": "1",
  },

  // ── Sections parsed from the home page ────────────────────
  HOME_SECTIONS: [
    "Recent Uploads",
    "New Releases",
    "Trending",
    "Random",
  ],

  // ── Caching (in-memory TTL, seconds) ──────────────────────
  CACHE: {
    enabled: true,
    ttl: {
      home:    300,   // 5 min
      video:   600,   // 10 min
      search:  120,   // 2 min
      trending: 300,
    },
  },

  // ── Pagination ─────────────────────────────────────────────
  PAGE_SIZE: 24,

  // ── Rate limiting (ms between requests) ───────────────────
  RATE_LIMIT_MS: 500,

  // ── Vercel Function Settings ───────────────────────────────
  VERCEL: {
    maxDuration: 30, // seconds
    regions:     ["iad1"], // US East
  },

  // ── CORS ──────────────────────────────────────────────────
  CORS: {
    allowedOrigins: ["*"],
    allowedMethods: ["GET", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  },
};
