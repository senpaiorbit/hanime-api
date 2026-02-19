// ============================================================
// lib/scraper.js — Core hanime.tv Scraper
// ============================================================

const config = require("../config");

// ── In-memory cache ────────────────────────────────────────
const cache = new Map();

function getCached(key) {
  if (!config.CACHE.enabled) return null;
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key, data, ttlSeconds) {
  if (!config.CACHE.enabled) return;
  cache.set(key, { data, expiresAt: Date.now() + ttlSeconds * 1000 });
}

// ── HTTP fetch with headers ────────────────────────────────
async function fetchPage(url) {
  const res = await fetch(url, {
    headers: config.HEADERS,
    redirect: "follow",
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} fetching ${url}`);
  }
  return res.text();
}

// ── Extract __NUXT__ state from HTML ───────────────────────
function extractNuxtState(html) {
  const match = html.match(/window\.__NUXT__\s*=\s*(\(function[\s\S]*?\))\s*;?\s*<\/script>/);
  if (!match) return null;
  try {
    // Execute the IIFE to get the state object
    // eslint-disable-next-line no-new-func
    const fn = new Function(`return ${match[1]}`);
    return fn();
  } catch {
    return null;
  }
}

// ── Parse home page HTML → sections of video objects ──────
function parseHomePage(html) {
  const nuxt = extractNuxtState(html);
  if (nuxt?.state?.data?.landing) {
    return parseLandingFromNuxt(nuxt.state.data.landing);
  }
  // Fallback: regex-based parsing
  return parseHomePageRegex(html);
}

function parseLandingFromNuxt(landing) {
  const hvMap = {};
  for (const hv of landing.hentai_videos || []) {
    hvMap[hv.id] = {
      id:          hv.id,
      name:        hv.name,
      slug:        hv.slug,
      views:       hv.views,
      cover_url:   hv.cover_url,
      released_at: hv.released_at,
      created_at:  hv.created_at,
      url:         `${config.BASE_URL}/videos/hentai/${hv.slug}`,
    };
  }

  const sections = {};
  for (const section of landing.sections || []) {
    sections[section.title] = section.hentai_video_ids
      .map((id) => hvMap[id])
      .filter(Boolean);
  }
  return sections;
}

// Regex fallback parser — works without JS execution
function parseHomePageRegex(html) {
  const sections = {};
  // Match each carousel section title
  const sectionRegex = /<span>([^<]+)<\/span>\s*<span class="htv-carousel__header__title__subtitle">/g;
  const cardRegex = /<a href="\/videos\/hentai\/([\w-]+)"[^>]*?title="([^"]+)"[\s\S]*?mdi-eye-outline"><\/i>\s*([\d,]+)/g;

  let sectionMatch;
  const sectionPositions = [];
  while ((sectionMatch = sectionRegex.exec(html)) !== null) {
    sectionPositions.push({ title: sectionMatch[1].trim(), index: sectionMatch.index });
  }

  sectionPositions.forEach((section, i) => {
    const chunk = html.slice(
      section.index,
      sectionPositions[i + 1]?.index ?? html.length
    );
    const videos = [];
    let cardMatch;
    const localCardRx = /<a href="\/videos\/hentai\/([\w-]+)"[^>]*?title="([^"]+)"[\s\S]*?mdi-eye-outline"><\/i>\s*([\d,]+)/g;
    while ((cardMatch = localCardRx.exec(chunk)) !== null) {
      videos.push({
        slug:   cardMatch[1],
        name:   cardMatch[2].replace(/^Watch | hentai stream.*$/g, "").trim(),
        views:  parseInt(cardMatch[3].replace(/,/g, ""), 10),
        url:    `${config.BASE_URL}/videos/hentai/${cardMatch[1]}`,
        cover_url: `${config.CDN_BASE}/images/covers/${cardMatch[1]}-cv1.webp`,
      });
    }
    sections[section.title] = videos;
  });

  return sections;
}

// ── Parse a video detail page ──────────────────────────────
function parseVideoPage(html, slug) {
  const nuxt = extractNuxtState(html);
  if (nuxt?.state?.data) {
    const d = nuxt.state.data;
    // The video detail page stores the HV in d.hentai_video or similar
    const hv = d.hentai_video || d.video;
    if (hv) {
      return {
        id:          hv.id,
        name:        hv.name,
        slug:        hv.slug || slug,
        views:       hv.views,
        cover_url:   hv.cover_url,
        released_at: hv.released_at,
        created_at:  hv.created_at,
        description: hv.description || "",
        tags:        (hv.hentai_tags || []).map((t) => t.text),
        brand:       hv.brand,
        url:         `${config.BASE_URL}/videos/hentai/${hv.slug || slug}`,
        streams:     hv.videos_manifest || null,
      };
    }
  }

  // Regex fallback
  const titleMatch  = html.match(/<title>Watch ([^<]+) hentai/i);
  const viewsMatch  = html.match(/mdi-eye-outline[^>]*><\/i>\s*([\d,]+)/);
  const coverMatch  = html.match(/cover_url:"([^"]+)"/);
  const tagsMatch   = [...html.matchAll(/href="\/browse\/tags\/([^"]+)"/g)].map((m) =>
    decodeURIComponent(m[1])
  );

  return {
    slug,
    name:      titleMatch ? titleMatch[1].trim() : slug,
    views:     viewsMatch ? parseInt(viewsMatch[1].replace(/,/g, ""), 10) : 0,
    cover_url: coverMatch ? coverMatch[1] : `${config.CDN_BASE}/images/covers/${slug}-cv1.webp`,
    tags:      [...new Set(tagsMatch)],
    url:       `${config.BASE_URL}/videos/hentai/${slug}`,
  };
}

// ── Parse search result page ───────────────────────────────
function parseSearchPage(html) {
  const nuxt = extractNuxtState(html);
  const videos = [];

  if (nuxt?.state?.data?.search_results) {
    for (const hv of nuxt.state.data.search_results) {
      videos.push({
        id:        hv.id,
        name:      hv.name,
        slug:      hv.slug,
        views:     hv.views,
        cover_url: hv.cover_url,
        url:       `${config.BASE_URL}/videos/hentai/${hv.slug}`,
      });
    }
    return videos;
  }

  // Regex fallback
  const cardRx = /<a href="\/videos\/hentai\/([\w-]+)"[^>]*?title="([^"]+)"[\s\S]*?mdi-eye-outline[^>]*><\/i>\s*([\d,]+)/g;
  let m;
  while ((m = cardRx.exec(html)) !== null) {
    videos.push({
      slug:      m[1],
      name:      m[2].replace(/^Watch | hentai stream.*$/g, "").trim(),
      views:     parseInt(m[3].replace(/,/g, ""), 10),
      cover_url: `${config.CDN_BASE}/images/covers/${m[1]}-cv1.webp`,
      url:       `${config.BASE_URL}/videos/hentai/${m[1]}`,
    });
  }
  return videos;
}

// ── Public API ─────────────────────────────────────────────

/** Scrape the home page sections */
async function scrapHome() {
  const cacheKey = "home";
  const cached = getCached(cacheKey);
  if (cached) return { source: "cache", sections: cached };

  const html     = await fetchPage(config.BASE_URL);
  const sections = parseHomePage(html);
  setCache(cacheKey, sections, config.CACHE.ttl.home);
  return { source: "live", sections };
}

/** Scrape a single video detail page */
async function scrapeVideo(slug) {
  const cacheKey = `video:${slug}`;
  const cached   = getCached(cacheKey);
  if (cached) return { source: "cache", video: cached };

  const url  = `${config.BASE_URL}/videos/hentai/${slug}`;
  const html = await fetchPage(url);
  const video = parseVideoPage(html, slug);
  setCache(cacheKey, video, config.CACHE.ttl.video);
  return { source: "live", video };
}

/** Scrape search results */
async function scrapeSearch(query, tags = []) {
  const cacheKey = `search:${query}:${tags.join(",")}`;
  const cached   = getCached(cacheKey);
  if (cached) return { source: "cache", results: cached };

  const params = new URLSearchParams({ search_text: query });
  if (tags.length) params.set("tags[]", tags.join(","));
  const url  = `${config.BASE_URL}/search?${params}`;
  const html = await fetchPage(url);
  const results = parseSearchPage(html);
  setCache(cacheKey, results, config.CACHE.ttl.search);
  return { source: "live", results };
}

/** Scrape trending page */
async function scrapeTrending() {
  const cacheKey = "trending";
  const cached   = getCached(cacheKey);
  if (cached) return { source: "cache", results: cached };

  const html    = await fetchPage(`${config.BASE_URL}/browse/trending`);
  const results = parseSearchPage(html);
  setCache(cacheKey, results, config.CACHE.ttl.trending);
  return { source: "live", results };
}

module.exports = { scrapHome, scrapeVideo, scrapeSearch, scrapeTrending };
