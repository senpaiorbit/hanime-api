// ============================================================
//  config.js — Central configuration for Hanime API scraper
//  Edit this file to update base URLs, endpoints, or defaults
// ============================================================

export const CONFIG = {
  // ── Base URLs ────────────────────────────────────────────
  BASE_URL: "https://hanime.tv",
  API_BASE: "https://hanime.tv/api/v8",

  // ── Upstream API Endpoints (relative to API_BASE) ────────
  ENDPOINTS: {
    HOME:        "/browse-sliders",
    BROWSE:      "/browse",
    SEARCH:      "/search",
    VIDEO:       "/video",
    TRENDING:    "/trending",
    TAGS:        "/hentai_tags",
    BRANDS:      "/brands",
    SERIES:      "/series",
  },

  // ── Request Headers sent to hanime.tv ───────────────────
  HEADERS: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept":          "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer":         "https://hanime.tv/",
    "Origin":          "https://hanime.tv",
    "x-requested-with": "XMLHttpRequest",
  },

  // ── Pagination defaults ──────────────────────────────────
  PAGINATION: {
    DEFAULT_PAGE:  0,
    DEFAULT_LIMIT: 20,
    MAX_LIMIT:     100,
  },

  // ── Our API version prefix ───────────────────────────────
  API_VERSION: "/api/v1",
};
