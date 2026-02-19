// ============================================================
//  lib/scraper.js — Shared fetch wrapper + response helpers
// ============================================================

import { CONFIG } from "../config.js";

/**
 * Fetch JSON from hanime.tv upstream API.
 * @param {string} endpoint  e.g. CONFIG.ENDPOINTS.HOME
 * @param {object} params    query string key/value pairs
 */
export async function fetchUpstream(endpoint, params = {}) {
  const url = new URL(`${CONFIG.API_BASE}${endpoint}`);

  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") {
      url.searchParams.set(k, String(v));
    }
  }

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: CONFIG.HEADERS,
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Upstream ${res.status} ${res.statusText}: ${text.slice(0, 200)}`);
  }

  return res.json();
}

/**
 * Send a JSON response with CORS headers.
 */
export function send(res, statusCode, body) {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.status(statusCode).json(body);
}

/**
 * Wrap a route handler with:
 *  - OPTIONS preflight support
 *  - GET-only enforcement
 *  - Automatic error catching
 */
export function withHandler(handler) {
  return async (req, res) => {
    // CORS preflight
    if (req.method === "OPTIONS") {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      return res.status(204).end();
    }

    if (req.method !== "GET") {
      return send(res, 405, { success: false, error: "Method not allowed. Use GET." });
    }

    try {
      await handler(req, res);
    } catch (err) {
      console.error("[handler error]", err.message);
      return send(res, 502, {
        success: false,
        error: "Failed to fetch upstream data",
        details: err.message,
      });
    }
  };
}
