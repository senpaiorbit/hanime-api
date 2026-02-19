// ============================================================
//  scraper.js — Shared fetch wrapper for upstream requests
// ============================================================

import { CONFIG } from "../config.js";

/**
 * Fetch data from hanime.tv upstream API.
 * @param {string} endpoint  - e.g. CONFIG.ENDPOINTS.HOME
 * @param {object} params    - query string params
 * @returns {Promise<object>}
 */
export async function fetchUpstream(endpoint, params = {}) {
  const url = new URL(`${CONFIG.API_BASE}${endpoint}`);

  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") {
      url.searchParams.set(k, String(v));
    }
  });

  const res = await fetch(url.toString(), {
    headers: CONFIG.HEADERS,
    // Vercel serverless has a 10 s default; keep it snappy
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Upstream ${res.status} ${res.statusText}: ${text.slice(0, 200)}`
    );
  }

  return res.json();
}

/**
 * Send a standard JSON reply from a Vercel handler.
 * @param {object} res   - Vercel response object
 * @param {number} code  - HTTP status
 * @param {object} body  - payload
 */
export function send(res, code, body) {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.status(code).json(body);
}

/**
 * Wrap a handler with error handling + OPTIONS pre-flight.
 */
export function withErrorHandler(handler) {
  return async (req, res) => {
    if (req.method === "OPTIONS") {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      return res.status(204).end();
    }
    if (req.method !== "GET") {
      return send(res, 405, { success: false, error: "Method not allowed" });
    }
    try {
      await handler(req, res);
    } catch (err) {
      console.error("[scraper error]", err.message);
      send(res, 502, {
        success: false,
        error: "Failed to fetch upstream data",
        details: err.message,
      });
    }
  };
}
