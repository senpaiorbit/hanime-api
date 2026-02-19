// ============================================================
// lib/cors.js — CORS & response helpers for Vercel functions
// ============================================================

const config = require("../config");

function setCORSHeaders(res) {
  const { CORS } = config;
  res.setHeader("Access-Control-Allow-Origin",  CORS.allowedOrigins.join(","));
  res.setHeader("Access-Control-Allow-Methods", CORS.allowedMethods.join(","));
  res.setHeader("Access-Control-Allow-Headers", CORS.allowedHeaders.join(","));
  res.setHeader("Content-Type", "application/json");
}

function handleOptions(req, res) {
  if (req.method === "OPTIONS") {
    setCORSHeaders(res);
    res.status(204).end();
    return true;
  }
  return false;
}

function sendJSON(res, statusCode, data) {
  setCORSHeaders(res);
  res.status(statusCode).json(data);
}

function sendError(res, statusCode, message, details = null) {
  setCORSHeaders(res);
  res.status(statusCode).json({
    ok:      false,
    error:   message,
    details: details,
  });
}

module.exports = { setCORSHeaders, handleOptions, sendJSON, sendError };
