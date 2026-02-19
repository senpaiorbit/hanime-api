// ============================================================
//  api/index.js — Single Vercel serverless entry point
//  All traffic is rewritten here via vercel.json rewrites.
//
//  Routes:
//    GET /api/v1/home
//    GET /api/v1/trending      ?time=week|day|month&page=0&limit=20
//    GET /api/v1/search        ?q=...&page=0&tags=...&order_by=...
//    GET /api/v1/browse        ?page=0&tags=...&brands=...&order_by=...
//    GET /api/v1/video         ?slug=...
//    GET /api/v1/tags
//    GET /api/v1/brands
//    GET /api/v1/health
// ============================================================

import { withErrorHandler, send } from "../lib/scraper.js";
import { getHome }     from "./pages/home.js";
import { getTrending } from "./pages/trending.js";
import { searchVideos }from "./pages/search.js";
import { browse }      from "./pages/browse.js";
import { getVideo }    from "./pages/video.js";
import { getTags }     from "./pages/tags.js";
import { getBrands }   from "./pages/brands.js";

// ── Router ───────────────────────────────────────────────────
async function router(req, res) {
  const url      = new URL(req.url, `https://${req.headers.host}`);
  const pathname = url.pathname.replace(/\/$/, "");
  const q        = (key, def = "") => url.searchParams.get(key) ?? def;
  const qi       = (key, def = 0)  => parseInt(q(key, String(def)), 10) || def;

  // ── Health check ──────────────────────────────────────────
  if (pathname === "/api/v1/health" || pathname === "/health") {
    return send(res, 200, {
      success: true,
      status:  "ok",
      version: "1.0.0",
      timestamp: new Date().toISOString(),
    });
  }

  // ── Home ──────────────────────────────────────────────────
  if (pathname === "/api/v1/home") {
    const data = await getHome();
    return send(res, 200, { success: true, data });
  }

  // ── Trending ──────────────────────────────────────────────
  if (pathname === "/api/v1/trending") {
    const data = await getTrending({
      time:  q("time", "week"),
      page:  qi("page", 0),
      limit: qi("limit", 20),
    });
    return send(res, 200, { success: true, data });
  }

  // ── Search ────────────────────────────────────────────────
  if (pathname === "/api/v1/search") {
    const data = await searchVideos({
      query:    q("q"),
      page:     qi("page", 0),
      limit:    qi("limit", 20),
      tags:     q("tags"),
      brands:   q("brands"),
      order_by: q("order_by", "created_at_unix"),
      ordering: q("ordering", "desc"),
    });
    return send(res, 200, { success: true, data });
  }

  // ── Browse ────────────────────────────────────────────────
  if (pathname === "/api/v1/browse") {
    const data = await browse({
      page:      qi("page", 0),
      limit:     qi("limit", 20),
      tags:      q("tags"),
      brands:    q("brands"),
      blacklist: q("blacklist"),
      order_by:  q("order_by", "created_at_unix"),
      ordering:  q("ordering", "desc"),
    });
    return send(res, 200, { success: true, data });
  }

  // ── Single Video ──────────────────────────────────────────
  if (pathname === "/api/v1/video") {
    const slug = q("slug");
    if (!slug) {
      return send(res, 400, { success: false, error: "slug query param is required" });
    }
    const data = await getVideo({ slug });
    return send(res, 200, { success: true, data });
  }

  // ── Tags ──────────────────────────────────────────────────
  if (pathname === "/api/v1/tags") {
    const data = await getTags();
    return send(res, 200, { success: true, data });
  }

  // ── Brands ────────────────────────────────────────────────
  if (pathname === "/api/v1/brands") {
    const data = await getBrands();
    return send(res, 200, { success: true, data });
  }

  // ── 404 fallback ──────────────────────────────────────────
  return send(res, 404, {
    success: false,
    error:   "Route not found",
    available_routes: [
      "GET /api/v1/health",
      "GET /api/v1/home",
      "GET /api/v1/trending?time=week|day|month&page=0&limit=20",
      "GET /api/v1/search?q=...&page=0&tags=...&order_by=...&ordering=...",
      "GET /api/v1/browse?page=0&tags=...&brands=...&order_by=...&ordering=...",
      "GET /api/v1/video?slug=...",
      "GET /api/v1/tags",
      "GET /api/v1/brands",
    ],
  });
}

export default withErrorHandler(router);
