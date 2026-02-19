// ============================================================
// lib/scraper.js — Core hanime.tv Scraper
// Supports: home (/), trending (/browse/trending), random (/browse/random),
//           video (/videos/hentai/:slug), search (/search)
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

// ── Normalise a raw hentai_video object (shared shape across all pages) ──
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
  return parseHomeRegex(html);
}

function parseHomeRegex(html) {
  const out = {};
  const secRx = /<span>([^<]+)<\/span>\s*<span class="htv-carousel__header__title__subtitle">/g;
  const positions = [];
  let m;
  while ((m = secRx.exec(html)) !== null) positions.push({ title: m[1].trim(), index: m.index });
  for (let i = 0; i < positions.length; i++) {
    const chunk = html.slice(positions[i].index, positions[i + 1]?.index);
    const videos = [];
    const rx = /href="\/videos\/hentai\/([\w-]+)"[^>]*?title="Watch ([^"]+) hentai[\s\S]*?mdi-eye-outline[^>]*><\/i>\s*([\d,]+)/g;
    let c;
    while ((c = rx.exec(chunk)) !== null) {
      const slug = c[1];
      videos.push({ slug, name: c[2].trim(), views: parseInt(c[3].replace(/,/g, ""), 10),
        cover_url: `${config.CDN_BASE}/images/covers/${slug}-cv1.webp`,
        url: `${config.BASE_URL}/videos/hentai/${slug}` });
    }
    out[positions[i].title] = videos;
  }
  return out;
}

// ════════════════════════════════════════════════════════════
// TRENDING PAGE  https://hanime.tv/browse/trending
// ════════════════════════════════════════════════════════════
function parseTrendingPage(html) {
  const nuxt = extractNuxtState(html);
  if (nuxt?.state?.data?.trending) {
    const t = nuxt.state.data.trending;
    return {
      time: t.time || "month", page: t.page || 1,
      page_size: t.page_size || 24, number_of_pages: t.number_of_pages || 1,
      videos: (t.hentai_videos || []).map(normaliseVideo),
    };
  }
  const videos = [];
  const rx = /href="\/videos\/hentai\/([\w-]+)"[^>]*?title="Watch ([^"]+) hentai[\s\S]*?hvc__slot_data">\s*Rank\s*(\d+)/g;
  let c;
  while ((c = rx.exec(html)) !== null) {
    const slug = c[1];
    videos.push({ slug, name: c[2].trim(), monthly_rank: parseInt(c[3], 10),
      cover_url: `${config.CDN_BASE}/images/covers/${slug}-cv1.webp`,
      url: `${config.BASE_URL}/videos/hentai/${slug}` });
  }
  return { time: "month", page: 1, page_size: 24, number_of_pages: 1, videos };
}

// ════════════════════════════════════════════════════════════
// RANDOM PAGE  https://hanime.tv/browse/random
// ════════════════════════════════════════════════════════════
function parseRandomPage(html) {
  const nuxt = extractNuxtState(html);
  if (nuxt?.state?.data?.random?.hentai_videos) {
    return { videos: nuxt.state.data.random.hentai_videos.map(normaliseVideo) };
  }
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
// VIDEO DETAIL  https://hanime.tv/videos/hentai/:slug
//
// NUXT structure: state.data.video = {
//   hentai_video:                 main video object + hentai_tags[] + titles[]
//   hentai_tags:                  enriched tag objects (count, description, image_urls)
//   hentai_franchise:             { id, name, slug, title }
//   hentai_franchise_hentai_videos: sibling episodes in same franchise
//   hentai_video_storyboards:     storyboard sprite sheets for scrubbing
//   brand:                        { id, title, slug, count }
//   next_hentai_video:            next video object
//   next_random_hentai_video:     random next suggestion
//   videos_manifest:              { servers: [{ name, streams: [{ url, width, height, kind, ... }] }] }
// }
// ════════════════════════════════════════════════════════════
function parseVideoPage(html, slug) {
  const nuxt = extractNuxtState(html);
  const vd   = nuxt?.state?.data?.video;

  if (vd?.hentai_video) {
    const hv = vd.hentai_video;

    // ── Tags ────────────────────────────────────────────────
    // hentai_tags on the top-level has richer data (count, description, image urls)
    const enrichedTagMap = {};
    for (const t of vd.hentai_tags || []) enrichedTagMap[t.id] = t;

    const tags = (hv.hentai_tags || []).map((t) => {
      const rich = enrichedTagMap[t.id] || {};
      return {
        id:             t.id,
        text:           t.text,
        count:          rich.count          ?? null,
        description:    rich.description    ?? null,
        wide_image_url: rich.wide_image_url ?? null,
        tall_image_url: rich.tall_image_url ?? null,
        url:            `${config.BASE_URL}/browse/tags/${encodeURIComponent(t.text)}`,
      };
    });

    // ── Alternate titles ────────────────────────────────────
    const titles = (hv.titles || []).map((t) => ({ lang: t.lang, kind: t.kind, title: t.title }));

    // ── Streams from videos_manifest ───────────────────────
    // servers[] → streams[] — we flatten to a list of playable stream objects
    const streams = [];
    for (const server of vd.videos_manifest?.servers || []) {
      for (const s of server.streams || []) {
        streams.push({
          server_name:     server.name,
          server_slug:     server.slug,
          stream_id:       s.id,
          url:             s.url,
          width:           s.width,
          height:          s.height,
          kind:            s.kind,       // "hls" | "mp4"
          mime_type:       s.mime_type,
          extension:       s.extension,
          filesize_mbs:    s.filesize_mbs ?? null,
          is_downloadable: s.is_downloadable ?? false,
          is_guest_allowed:   s.is_guest_allowed   ?? true,
          is_member_allowed:  s.is_member_allowed  ?? true,
          is_premium_allowed: s.is_premium_allowed ?? true,
        });
      }
    }

    // ── Storyboards ─────────────────────────────────────────
    const storyboards = (vd.hentai_video_storyboards || []).map((sb) => ({
      id:                    sb.id,
      url:                   sb.url,
      frame_width:           sb.frame_width,
      frame_height:          sb.frame_height,
      num_total_frames:      sb.num_total_frames,
      num_horizontal_frames: sb.num_horizontal_frames,
      num_vertical_frames:   sb.num_vertical_frames,
      num_total_storyboards: sb.num_total_storyboards,
      sequence:              sb.sequence,
    }));

    // ── Franchise ────────────────────────────────────────────
    const franchise = vd.hentai_franchise
      ? {
          id:    vd.hentai_franchise.id,
          name:  vd.hentai_franchise.name,
          slug:  vd.hentai_franchise.slug,
          title: vd.hentai_franchise.title,
          episodes: (vd.hentai_franchise_hentai_videos || []).map(normaliseVideo),
        }
      : null;

    // ── Brand ────────────────────────────────────────────────
    const brand = vd.brand
      ? {
          id:          vd.brand.id,
          title:       vd.brand.title,
          slug:        vd.brand.slug,
          upload_count: vd.brand.count ?? null,
          url:         `${config.BASE_URL}/browse/brands/${vd.brand.slug}`,
        }
      : null;

    // ── Player base URL ──────────────────────────────────────
    const player_url = vd.player_base_url
      ? `${vd.player_base_url}id=${hv.slug}`
      : null;

    return {
      // Core video fields
      ...normaliseVideo(hv),
      description:  hv.description ?? null,
      // Enriched data
      tags,
      titles,
      streams,
      storyboards,
      franchise,
      brand,
      player_url,
      // Navigation
      next_video:   vd.next_hentai_video        ? normaliseVideo(vd.next_hentai_video)        : null,
      next_random:  vd.next_random_hentai_video ? normaliseVideo(vd.next_random_hentai_video) : null,
    };
  }

  // ── Regex fallback ───────────────────────────────────────
  const titleM = html.match(/<h1 class="tv-title">([^<]+)<\/h1>/);
  const viewsM = html.match(/<div class="tv-views[^"]*">([\d,]+)\s*views<\/div>/);
  const coverM = html.match(/class="hvpi-cover"[^>]*src="([^"]+)"/);
  const descM  = html.match(/hvpist-description"[^>]*>([\s\S]*?)<\/div>/);
  const tags   = [...html.matchAll(/href="\/browse\/tags\/([^"]+)"[^>]*><div[^>]*>([^<]+)<\/div>/g)]
    .map((m) => ({ text: decodeURIComponent(m[1]), url: `${config.BASE_URL}/browse/tags/${m[1]}` }));
  const streams = [];
  const streamRx = /url:"(https:\/\/[^"]+\.m3u8[^"]*)",/g;
  let sm;
  while ((sm = streamRx.exec(html)) !== null) {
    streams.push({ url: sm[1], kind: "hls" });
  }
  return {
    slug,
    name:        titleM ? titleM[1].trim() : slug,
    views:       viewsM ? parseInt(viewsM[1].replace(/,/g, ""), 10) : 0,
    cover_url:   coverM ? coverM[1] : `${config.CDN_BASE}/images/covers/${slug}-cv1.webp`,
    description: descM  ? descM[1].replace(/<[^>]+>/g, "").trim() : null,
    tags, streams,
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
    videos.push({ slug, name: c[2].trim(), views: parseInt(c[3].replace(/,/g, ""), 10),
      cover_url: `${config.CDN_BASE}/images/covers/${slug}-cv1.webp`,
      url: `${config.BASE_URL}/videos/hentai/${slug}` });
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

async function scrapeTrending(period = "month", page = 1) {
  const cacheKey = `trending:${period}:${page}`;
  const cached   = getCached(cacheKey);
  if (cached) return { source: "cache", ...cached };
  const params = new URLSearchParams({ time: period });
  if (page > 1) params.set("page", String(page));
  const data = parseTrendingPage(await fetchPage(`${config.BASE_URL}/browse/trending?${params}`));
  setCache(cacheKey, data, config.CACHE.ttl.trending);
  return { source: "live", ...data };
}

async function scrapeRandom() {
  const data = parseRandomPage(await fetchPage(`${config.BASE_URL}/browse/random`));
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
