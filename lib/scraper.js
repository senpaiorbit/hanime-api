// ============================================================
// lib/scraper.js — Core hanime.tv Scraper
// Supports: home (/), trending (/browse/trending), random (/browse/random)
// ============================================================

const config = require("../config");

// ── In-memory cache ────────────────────────────────────────
const cache = new Map();

function getCached(key) {
  if (!config.CACHE.enabled) return null;
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { cache.delete(key); return null; }
  return entry.data;
}

function setCache(key, data, ttlSeconds) {
  if (!config.CACHE.enabled) return;
  cache.set(key, { data, expiresAt: Date.now() + ttlSeconds * 1000 });
}

// ── HTTP fetch with browser-like headers ───────────────────
async function fetchPage(url) {
  const res = await fetch(url, { headers: config.HEADERS, redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  return res.text();
}

// ── Extract & run the __NUXT__ IIFE ───────────────────────
// hanime.tv embeds SSR state as:
//   window.__NUXT__ = (function(a,b,...){ return {...} }(val1, val2,...));
// We grab the full IIFE string and evaluate it in Node.
function extractNuxtState(html) {
  const match = html.match(
    /window\.__NUXT__\s*=\s*(\(function\s*\([^)]*\)\s*\{[\s\S]*?\}\s*\([^)]*\)\s*\))\s*;/
  );
  if (!match) return null;
  try {
    // eslint-disable-next-line no-new-func
    return new Function(`return ${match[1]}`)();
  } catch (e) {
    console.warn("[NUXT] eval failed:", e.message);
    return null;
  }
}

// ── Normalise any hentai_video object (same shape across pages) ───
function normaliseVideo(hv) {
  return {
    id:               hv.id,
    name:             hv.name,
    slug:             hv.slug,
    views:            hv.views,
    interests:        hv.interests        ?? null,
    likes:            hv.likes            ?? null,
    dislikes:         hv.dislikes         ?? null,
    monthly_rank:     hv.monthly_rank     ?? null,
    duration_ms:      hv.duration_in_ms   || null,
    is_censored:      hv.is_censored      ?? null,
    brand:            hv.brand            ?? null,
    brand_id:         hv.brand_id         ?? null,
    cover_url:        hv.cover_url,
    poster_url:       hv.poster_url       ?? null,
    released_at:      hv.released_at,
    created_at:       hv.created_at,
    released_at_unix: hv.released_at_unix ?? null,
    created_at_unix:  hv.created_at_unix  ?? null,
    url:              `${config.BASE_URL}/videos/hentai/${hv.slug}`,
  };
}

// ════════════════════════════════════════════════════════════
// HOME PAGE  https://hanime.tv/
// NUXT path: state.data.landing → { sections, hentai_videos }
// sections = [{ title, hentai_video_ids }]
// hentai_videos = flat array, minimal fields (no interests/rank)
// ════════════════════════════════════════════════════════════
function parseHomePage(html) {
  const nuxt = extractNuxtState(html);
  if (nuxt?.state?.data?.landing) {
    const { sections = [], hentai_videos = [] } = nuxt.state.data.landing;
    const hvMap = {};
    for (const hv of hentai_videos) hvMap[hv.id] = normaliseVideo(hv);
    const result = {};
    for (const sec of sections) {
      result[sec.title] = sec.hentai_video_ids.map((id) => hvMap[id]).filter(Boolean);
    }
    return result;
  }
  // Regex fallback
  return parseHomeRegex(html);
}

function parseHomeRegex(html) {
  const out = {};
  const secRx = /<span>([^<]+)<\/span>\s*<span class="htv-carousel__header__title__subtitle">/g;
  const positions = [];
  let m;
  while ((m = secRx.exec(html)) !== null) {
    positions.push({ title: m[1].trim(), index: m.index });
  }
  for (let i = 0; i < positions.length; i++) {
    const chunk = html.slice(positions[i].index, positions[i + 1]?.index);
    const videos = [];
    const rx = /href="\/videos\/hentai\/([\w-]+)"[^>]*?title="Watch ([^"]+) hentai[\s\S]*?mdi-eye-outline[^>]*><\/i>\s*([\d,]+)/g;
    let c;
    while ((c = rx.exec(chunk)) !== null) {
      const slug = c[1];
      videos.push({
        slug, name: c[2].trim(),
        views: parseInt(c[3].replace(/,/g, ""), 10),
        cover_url: `${config.CDN_BASE}/images/covers/${slug}-cv1.webp`,
        url: `${config.BASE_URL}/videos/hentai/${slug}`,
      });
    }
    out[positions[i].title] = videos;
  }
  return out;
}

// ════════════════════════════════════════════════════════════
// TRENDING PAGE  https://hanime.tv/browse/trending
// NUXT path: state.data.trending → { hentai_videos, time, page, page_size, number_of_pages }
// hentai_videos has full fields including monthly_rank, interests, likes, dislikes
// HTML also has: <div class="hvc__slot_data">  Rank N  </div>
// ════════════════════════════════════════════════════════════
function parseTrendingPage(html) {
  const nuxt = extractNuxtState(html);
  if (nuxt?.state?.data?.trending) {
    const t = nuxt.state.data.trending;
    return {
      time:            t.time            || "month",
      page:            t.page            || 1,
      page_size:       t.page_size       || 24,
      number_of_pages: t.number_of_pages || 1,
      videos:          (t.hentai_videos  || []).map(normaliseVideo),
    };
  }
  // Regex fallback — trending cards show "Rank N" badge
  const videos = [];
  const rx = /href="\/videos\/hentai\/([\w-]+)"[^>]*?title="Watch ([^"]+) hentai[\s\S]*?hvc__slot_data">\s*Rank\s*(\d+)/g;
  let c;
  while ((c = rx.exec(html)) !== null) {
    const slug = c[1];
    videos.push({
      slug, name: c[2].trim(), monthly_rank: parseInt(c[3], 10),
      cover_url: `${config.CDN_BASE}/images/covers/${slug}-cv1.webp`,
      url: `${config.BASE_URL}/videos/hentai/${slug}`,
    });
  }
  return { time: "month", page: 1, page_size: 24, number_of_pages: 1, videos };
}

// ════════════════════════════════════════════════════════════
// RANDOM PAGE  https://hanime.tv/browse/random
// NUXT path: state.data.random → { hentai_videos }
// Returns 24 random videos per request, full fields (brand, duration, etc.)
// HTML uses .hvc2 card class (no rank badge)
// ════════════════════════════════════════════════════════════
function parseRandomPage(html) {
  const nuxt = extractNuxtState(html);
  if (nuxt?.state?.data?.random?.hentai_videos) {
    return { videos: nuxt.state.data.random.hentai_videos.map(normaliseVideo) };
  }
  // Regex fallback — .hvc2 cards only contain an href
  const slugs = [...new Set(
    [...html.matchAll(/href="\/videos\/hentai\/([\w-]+)"/g)].map((m) => m[1])
  )];
  return {
    videos: slugs.map((slug) => ({
      slug,
      cover_url: `${config.CDN_BASE}/images/covers/${slug}-cv1.webp`,
      url: `${config.BASE_URL}/videos/hentai/${slug}`,
    })),
  };
}

// ════════════════════════════════════════════════════════════
// VIDEO DETAIL  /videos/hentai/:slug
// ════════════════════════════════════════════════════════════
function parseVideoPage(html, slug) {
  const nuxt = extractNuxtState(html);
  const hv   = nuxt?.state?.data?.hentai_video || nuxt?.state?.data?.video;
  if (hv) return normaliseVideo(hv);

  // Regex fallback
  const titleM  = html.match(/<title>Watch ([^<]+) hentai/i);
  const viewsM  = html.match(/mdi-eye-outline[^>]*><\/i>\s*([\d,]+)/);
  const coverM  = html.match(/cover_url:"([^"]+)"/);
  const tags    = [...new Set([...html.matchAll(/href="\/browse\/tags\/([^"]+)"/g)]
    .map((m) => decodeURIComponent(m[1])))];
  return {
    slug,
    name:      titleM ? titleM[1].trim() : slug,
    views:     viewsM ? parseInt(viewsM[1].replace(/,/g, ""), 10) : 0,
    cover_url: coverM ? coverM[1] : `${config.CDN_BASE}/images/covers/${slug}-cv1.webp`,
    tags,
    url: `${config.BASE_URL}/videos/hentai/${slug}`,
  };
}

// ════════════════════════════════════════════════════════════
// SEARCH  /search?search_text=…
// ════════════════════════════════════════════════════════════
function parseSearchPage(html) {
  const nuxt = extractNuxtState(html);
  if (nuxt?.state?.data?.search_results) {
    return nuxt.state.data.search_results.map(normaliseVideo);
  }
  const videos = [];
  const rx = /href="\/videos\/hentai\/([\w-]+)"[^>]*?title="Watch ([^"]+) hentai[\s\S]*?mdi-eye-outline[^>]*><\/i>\s*([\d,]+)/g;
  let c;
  while ((c = rx.exec(html)) !== null) {
    const slug = c[1];
    videos.push({
      slug, name: c[2].trim(),
      views: parseInt(c[3].replace(/,/g, ""), 10),
      cover_url: `${config.CDN_BASE}/images/covers/${slug}-cv1.webp`,
      url: `${config.BASE_URL}/videos/hentai/${slug}`,
    });
  }
  return videos;
}

// ════════════════════════════════════════════════════════════
// Public API
// ════════════════════════════════════════════════════════════

async function scrapeHome() {
  const cached = getCached("home");
  if (cached) return { source: "cache", sections: cached };
  const sections = parseHomePage(await fetchPage(config.BASE_URL));
  setCache("home", sections, config.CACHE.ttl.home);
  return { source: "live", sections };
}

/**
 * @param {"day"|"week"|"month"|"quarter"|"semi"|"year"} period
 * @param {number} page  (1-indexed)
 */
async function scrapeTrending(period = "month", page = 1) {
  const cacheKey = `trending:${period}:${page}`;
  const cached   = getCached(cacheKey);
  if (cached) return { source: "cache", ...cached };

  const params = new URLSearchParams({ time: period });
  if (page > 1) params.set("page", String(page));
  const data = parseTrendingPage(
    await fetchPage(`${config.BASE_URL}/browse/trending?${params}`)
  );
  setCache(cacheKey, data, config.CACHE.ttl.trending);
  return { source: "live", ...data };
}

// Random is never cached — different 24 videos every call
async function scrapeRandom() {
  const data = parseRandomPage(
    await fetchPage(`${config.BASE_URL}/browse/random`)
  );
  return { source: "live", ...data };
}

async function scrapeVideo(slug) {
  const cacheKey = `video:${slug}`;
  const cached   = getCached(cacheKey);
  if (cached) return { source: "cache", video: cached };
  const video = parseVideoPage(await fetchPage(`${config.BASE_URL}/videos/hentai/${slug}`), slug);
  setCache(cacheKey, video, config.CACHE.ttl.video);
  return { source: "live", video };
}

async function scrapeSearch(query, tags = []) {
  const cacheKey = `search:${query}:${tags.join(",")}`;
  const cached   = getCached(cacheKey);
  if (cached) return { source: "cache", results: cached };
  const params = new URLSearchParams({ search_text: query });
  tags.forEach((t) => params.append("tags[]", t));
  const results = parseSearchPage(await fetchPage(`${config.BASE_URL}/search?${params}`));
  setCache(cacheKey, results, config.CACHE.ttl.search);
  return { source: "live", results };
}

module.exports = { scrapeHome, scrapeTrending, scrapeRandom, scrapeVideo, scrapeSearch };
