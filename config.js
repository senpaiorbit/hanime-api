// ============================================================
//  config.js — Central configuration for Hanime API scraper
// ============================================================

export const CONFIG = {
  // ── Base URLs ────────────────────────────────────────────
  BASE_URL: "https://hanime.tv",
  API_BASE: "https://hanime.tv/api/v8",

  // ── API Endpoints (relative to API_BASE) ────────────────
  ENDPOINTS: {
    HOME:        "/browse-sliders",      // Homepage sliders / featured
    BROWSE:      "/browse",             // Browse / catalog
    SEARCH:      "/search",             // Search
    VIDEO:       "/video",              // Single video details
    TRENDING:    "/trending",           // Trending now
    NEWEST:      "/newest",             // Newest uploads
    TAGS:        "/tags",               // All tags
    BRANDS:      "/brands",             // Studios / brands
    SERIES:      "/series",             // Series list
    HENTAI_TAGS: "/hentai_tags",        // Hentai-specific tags
    PLAYLIST:    "/playlists",          // Playlists
  },

  // ── Request Headers ──────────────────────────────────────
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

  // ── Cache TTL (seconds) ──────────────────────────────────
  CACHE_TTL: {
    HOME:     300,   // 5 min
    BROWSE:   300,
    SEARCH:   60,    // 1 min
    VIDEO:    600,   // 10 min
    TRENDING: 180,   // 3 min
    TAGS:     3600,  // 1 hr (rarely changes)
    BRANDS:   3600,
    SERIES:   600,
  },

  // ── Our API version prefix ───────────────────────────────
  API_VERSION: "/api/v1",
};

// ── Helper: build full upstream URL ─────────────────────────
export function buildUrl(endpoint, params = {}) {
  const url = new URL(`${CONFIG.API_BASE}${endpoint}`);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") {
      url.searchParams.set(k, v);
    }
  });
  return url.toString();
}

// ── Helper: standard JSON response ──────────────────────────
export function successResponse(data, meta = {}) {
  return {
    success: true,
    ...meta,
    data,
  };
}

export function errorResponse(message, status = 500) {
  return {
    success: false,
    error: message,
    status,
  };
}
