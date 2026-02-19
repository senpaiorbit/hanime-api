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
const FETCH_TIMEOUT_MS = 12000;

async function fetchPage(url, extraHeaders = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { ...config.HEADERS, ...extraHeaders },
      redirect: "follow",
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
    return res.text();
  } finally {
    clearTimeout(timer);
  }
}

// ── Safe NUXT state extractor (no eval / Function constructor) ─────────────
// Strategy:
//  1. Extract param names from function(a,b,c,...)
//  2. Extract call-site values from }(val1, val2,...))
//  3. Build param → value map
//  4. Extract the return { ... } body
//  5. Substitute param tokens in body with JSON-safe literals
//  6. Fix unquoted keys / trailing commas → JSON.parse
//
// hanime NUXT IIFE format:
//   window.__NUXT__ = (function(a,b,c,...){ return { ... } }(val1, val2, ...));
// Call-site values are JS primitives only (null, true, false, numbers, strings).
// ─────────────────────────────────────────────────────────────────────────────
function extractNuxtState(html) {
  // Capture: params, return body, call args
  // We need the full match to be robust — use a two-pass approach.

  // Pass 1: find the outer IIFE boundaries
  const startMarker = "window.__NUXT__=(function(";
  // Also handle optional spaces around =
  const startRx = /window\.__NUXT__\s*=\s*\(function\s*\(/;
  const startMatch = startRx.exec(html);
  if (!startMatch) return null;

  const fnStart = startMatch.index + startMatch[0].length - 1; // index of the '(' of param list
  // fnStart points to the '(' before param list

  // Extract param list (balanced parens are just a flat list here)
  let paramEnd = html.indexOf(")", fnStart);
  if (paramEnd === -1) return null;
  const paramStr = html.slice(fnStart + 1, paramEnd).trim();
  const params   = paramStr ? paramStr.split(",").map((p) => p.trim()) : [];

  // Find the matching ')' for the IIFE call: }(args))
  // We look for the last occurrence of the call pattern after paramEnd
  // The body ends with: }(callArgs))  — we find }( after the function body
  // Strategy: find "return " then balance braces to find end of return object,
  // then find the call args between }( and the final ))

  const returnKw = html.indexOf("return ", paramEnd);
  if (returnKw === -1) return null;

  // Find start of return object '{'
  const objStart = html.indexOf("{", returnKw);
  if (objStart === -1) return null;

  // Balance braces to find end of return object
  let depth = 0;
  let objEnd = -1;
  for (let i = objStart; i < html.length; i++) {
    if (html[i] === "{") depth++;
    else if (html[i] === "}") {
      depth--;
      if (depth === 0) { objEnd = i; break; }
    }
  }
  if (objEnd === -1) return null;

  const bodyStr = html.slice(objStart, objEnd + 1);

  // After objEnd we expect: }(callArgs))  — find '(' for call args
  const callArgsStart = html.indexOf("(", objEnd);
  if (callArgsStart === -1) return null;

  // Find matching ')' for call args
  let callDepth = 0;
  let callArgsEnd = -1;
  for (let i = callArgsStart; i < html.length; i++) {
    if (html[i] === "(") callDepth++;
    else if (html[i] === ")") {
      callDepth--;
      if (callDepth === 0) { callArgsEnd = i; break; }
    }
  }
  if (callArgsEnd === -1) return null;

  const callStr = html.slice(callArgsStart + 1, callArgsEnd);
  const values  = parseArgList(callStr);

  if (!params.length || params.length !== values.length) return null;

  // Build substitution map
  const ctx = {};
  for (let i = 0; i < params.length; i++) ctx[params[i]] = values[i];

  // Substitute params in body
  // Sort by length desc so "aa" replaced before "a"
  const sortedParams = [...params].sort((a, b) => b.length - a.length);
  let resolved = bodyStr;
  for (const p of sortedParams) {
    const jsonVal = toJsonLiteral(ctx[p]);
    // Replace standalone identifiers that are NOT object keys (not followed by ':')
    const re = new RegExp(`(?<![\\w"'.$])${escapeRegex(p)}(?![\\w"'.$])(?!\\s*:)`, "g");
    resolved = resolved.replace(re, jsonVal);
  }

  // Fix JS → JSON:
  // 1. Quote unquoted object keys
  // 2. Remove trailing commas
  // 3. Replace remaining undefined references with null
  try {
    resolved = resolved
      .replace(/([{,]\s*)([a-zA-Z_$][\w$]*)(\s*:)/g, '$1"$2"$3')
      .replace(/:\s*undefined\b/g, ": null")
      .replace(/,(\s*[}\]])/g, "$1");
    return JSON.parse(resolved);
  } catch {
    return null;
  }
}

// Parse a JS primitive argument list into an array of native JS values.
// Handles: null, true, false, integers, floats, single/double-quoted strings.
function parseArgList(str) {
  const values = [];
  let i = 0;

  function skipWS() { while (i < str.length && /\s/.test(str[i])) i++; }

  function parseValue() {
    skipWS();
    if (i >= str.length) return undefined;
    const ch = str[i];

    // Quoted string
    if (ch === '"' || ch === "'") {
      const q = ch; let s = ""; i++;
      while (i < str.length) {
        if (str[i] === "\\" && i + 1 < str.length) {
          const e = str[i + 1];
          if (e === "u" && i + 5 < str.length) {
            s += String.fromCharCode(parseInt(str.slice(i + 2, i + 6), 16));
            i += 6;
          } else {
            s += ({ n:"\n",r:"\r",t:"\t","\\":"\\","'":"'",'"':'"',"/":"/" }[e] ?? e);
            i += 2;
          }
        } else if (str[i] === q) { i++; break; }
        else { s += str[i++]; }
      }
      return s;
    }

    if (str.startsWith("null",  i)) { i += 4; return null;  }
    if (str.startsWith("true",  i)) { i += 4; return true;  }
    if (str.startsWith("false", i)) { i += 5; return false; }

    const numM = str.slice(i).match(/^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/);
    if (numM) { i += numM[0].length; return parseFloat(numM[0]); }

    // Unknown token — skip to next comma
    const next = str.indexOf(",", i);
    i = next === -1 ? str.length : next;
    return undefined;
  }

  while (i < str.length) {
    values.push(parseValue());
    skipWS();
    if (str[i] === ",") i++;
  }
  return values;
}

function toJsonLiteral(val) {
  if (val === null || val === undefined) return "null";
  if (val === true)  return "true";
  if (val === false) return "false";
  if (typeof val === "number") return String(val);
  if (typeof val === "string") return JSON.stringify(val);
  return "null";
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
      result[sec.title] = (sec.hentai_video_ids || []).map((id) => hvMap[id]).filter(Boolean);
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
// HLS PLAYLIST RESOLVER
// Fetches an HLS master playlist → expands into quality variants.
// Falls back to original stream entry on any error.
// ════════════════════════════════════════════════════════════

function resolveHlsUrl(base, relative) {
  if (/^https?:\/\//i.test(relative)) return relative;
  try { return new URL(relative, base).href; } catch {
    const p = base.split("/"); p[p.length - 1] = relative; return p.join("/");
  }
}

function parseHlsMaster(text, baseUrl) {
  const lines    = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const variants = [];
  let   pending  = null;

  for (const line of lines) {
    if (line.startsWith("#EXT-X-STREAM-INF:")) {
      const attrs = {};
      const attrRx = /([A-Z0-9-]+)=("([^"]*)"|([\w@.,\-/]*))/g;
      let am;
      while ((am = attrRx.exec(line)) !== null)
        attrs[am[1]] = am[3] !== undefined ? am[3] : am[4];
      pending = attrs;
    } else if (!line.startsWith("#") && pending) {
      const url  = resolveHlsUrl(baseUrl, line);
      const res  = pending["RESOLUTION"] || null;
      let   w = null, h = null;
      if (res) { const p = res.split("x"); w = parseInt(p[0], 10) || null; h = parseInt(p[1], 10) || null; }
      variants.push({
        url, width: w, height: h, resolution: res,
        bandwidth:   parseInt(pending["BANDWIDTH"]  || "0", 10) || null,
        codecs:      pending["CODECS"]     || null,
        frame_rate:  pending["FRAME-RATE"] || null,
        kind:        "hls",
        mime_type:   "application/x-mpegURL",
        extension:   "m3u8",
        is_master:   false,
      });
      pending = null;
    } else { pending = null; }
  }
  return variants;
}

async function resolveStream(stream) {
  const isMaybeMaster = stream.extension === "m3u8" || stream.kind === "hls";
  if (!isMaybeMaster) return [{ ...stream, is_master: false }];

  try {
    const text = await fetchPage(stream.url, {
      Accept: "application/vnd.apple.mpegurl, application/x-mpegURL, */*",
      Referer: config.BASE_URL,
    });

    if (!text.includes("#EXT-X-STREAM-INF:"))
      return [{ ...stream, is_master: false }];

    const variants = parseHlsMaster(text, stream.url);
    if (!variants.length) return [{ ...stream, is_master: true }];

    return variants.map((v) => ({
      server_name:        stream.server_name,
      server_slug:        stream.server_slug,
      stream_id:          stream.stream_id,
      is_downloadable:    stream.is_downloadable,
      is_guest_allowed:   stream.is_guest_allowed,
      is_member_allowed:  stream.is_member_allowed,
      is_premium_allowed: stream.is_premium_allowed,
      filesize_mbs:       stream.filesize_mbs,
      ...v,
    }));
  } catch {
    return [{ ...stream, is_master: true, resolve_error: true }];
  }
}

// ════════════════════════════════════════════════════════════
// VIDEO DETAIL  https://hanime.tv/videos/hentai/:slug
// ════════════════════════════════════════════════════════════
async function parseVideoPage(html, slug) {
  const nuxt = extractNuxtState(html);
  const vd   = nuxt?.state?.data?.video;

  if (vd?.hentai_video) {
    const hv = vd.hentai_video;

    // ── Tags ─────────────────────────────────────────────────
    const enrichedTagMap = {};
    for (const t of vd.hentai_tags || []) enrichedTagMap[t.id] = t;
    const tags = (hv.hentai_tags || []).map((t) => {
      const rich = enrichedTagMap[t.id] || {};
      return {
        id: t.id, text: t.text,
        count:          rich.count          ?? null,
        description:    rich.description    ?? null,
        wide_image_url: rich.wide_image_url ?? null,
        tall_image_url: rich.tall_image_url ?? null,
        url: `${config.BASE_URL}/browse/tags/${encodeURIComponent(t.text)}`,
      };
    });

    // ── Alternate titles ──────────────────────────────────────
    const titles = (hv.titles || []).map((t) => ({ lang: t.lang, kind: t.kind, title: t.title }));

    // ── Streams — loop ALL servers dynamically ────────────────
    const rawStreams = [];
    for (const server of vd.videos_manifest?.servers || []) {
      for (const s of server.streams || []) {
        rawStreams.push({
          server_name:        server.name,
          server_slug:        server.slug        ?? null,
          stream_id:          s.id,
          url:                s.url,
          width:              s.width            || null,
          height:             s.height           || null,
          kind:               s.kind,
          mime_type:          s.mime_type,
          extension:          s.extension,
          filesize_mbs:       s.filesize_mbs     ?? null,
          is_downloadable:    s.is_downloadable  ?? false,
          is_guest_allowed:   s.is_guest_allowed   ?? true,
          is_member_allowed:  s.is_member_allowed  ?? true,
          is_premium_allowed: s.is_premium_allowed ?? true,
        });
      }
    }

    // Resolve HLS masters → quality variants (parallel, with fallback)
    const resolved = await Promise.all(rawStreams.map(resolveStream));
    const streams  = resolved
      .flat()
      .sort((a, b) => ((b.bandwidth || 0) - (a.bandwidth || 0)) || ((b.height || 0) - (a.height || 0)));

    // ── Storyboards ───────────────────────────────────────────
    const storyboards = (vd.hentai_video_storyboards || []).map((sb) => ({
      id: sb.id, url: sb.url,
      frame_width:           sb.frame_width,
      frame_height:          sb.frame_height,
      num_total_frames:      sb.num_total_frames,
      num_horizontal_frames: sb.num_horizontal_frames,
      num_vertical_frames:   sb.num_vertical_frames,
      num_total_storyboards: sb.num_total_storyboards,
      sequence:              sb.sequence,
    }));

    // ── Franchise ─────────────────────────────────────────────
    const franchise = vd.hentai_franchise ? {
      id:    vd.hentai_franchise.id,
      name:  vd.hentai_franchise.name,
      slug:  vd.hentai_franchise.slug,
      title: vd.hentai_franchise.title,
      episodes: (vd.hentai_franchise_hentai_videos || []).map(normaliseVideo),
    } : null;

    // ── Brand ─────────────────────────────────────────────────
    const brand = vd.brand ? {
      id:           vd.brand.id,
      title:        vd.brand.title,
      slug:         vd.brand.slug,
      upload_count: vd.brand.count ?? null,
      url:          `${config.BASE_URL}/browse/brands/${vd.brand.slug}`,
    } : null;

    // ── Player URL — uses hv.id (numeric ID), not slug ────────
    const player_url = vd.player_base_url
      ? `${vd.player_base_url}id=${hv.id}`
      : `https://player.hanime.tv/?id=${hv.id}`;

    return {
      ...normaliseVideo(hv),
      description: hv.description ?? null,
      tags, titles, streams, storyboards, franchise, brand, player_url,
      next_video:  vd.next_hentai_video        ? normaliseVideo(vd.next_hentai_video)        : null,
      next_random: vd.next_random_hentai_video ? normaliseVideo(vd.next_random_hentai_video) : null,
    };
  }

  // ── Regex fallback ─────────────────────────────────────────
  const titleM = html.match(/<h1 class="tv-title">([^<]+)<\/h1>/);
  const viewsM = html.match(/<div class="tv-views[^"]*">([\d,]+)\s*views<\/div>/);
  const coverM = html.match(/class="hvpi-cover"[^>]*src="([^"]+)"/);
  const descM  = html.match(/hvpist-description"[^>]*>([\s\S]*?)<\/div>/);
  const tags   = [...html.matchAll(/href="\/browse\/tags\/([^"]+)"[^>]*><div[^>]*>([^<]+)<\/div>/g)]
    .map((m) => ({ text: decodeURIComponent(m[1]), url: `${config.BASE_URL}/browse/tags/${m[1]}` }));
  const streams = [];
  const streamRx = /url:"(https:\/\/[^"]+\.m3u8[^"]*)",/g;
  let sm;
  while ((sm = streamRx.exec(html)) !== null) streams.push({ url: sm[1], kind: "hls", is_master: true });
  return {
    slug, url: `${config.BASE_URL}/videos/hentai/${slug}`,
    name:        titleM ? titleM[1].trim() : slug,
    views:       viewsM ? parseInt(viewsM[1].replace(/,/g, ""), 10) : 0,
    cover_url:   coverM ? coverM[1] : `${config.CDN_BASE}/images/covers/${slug}-cv1.webp`,
    description: descM  ? descM[1].replace(/<[^>]+>/g, "").trim() : null,
    tags, streams,
  };
}

// ════════════════════════════════════════════════════════════
// SEARCH  /search?search_text=…
// ════════════════════════════════════════════════════════════
function parseSearchPage(html) {
  const nuxt = extractNuxtState(html);
  if (nuxt?.state?.data?.search_results) return nuxt.state.data.search_results.map(normaliseVideo);
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
// Public API — same function names, same exports
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
  const html  = await fetchPage(`${config.BASE_URL}/videos/hentai/${slug}`);
  const video = await parseVideoPage(html, slug);  // async: resolves HLS playlists
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
