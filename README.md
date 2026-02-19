# Hanime API — Vercel Scraper

A zero-dependency Vercel serverless API that proxies & shapes data from **hanime.tv**.

## Project Structure

```
hanime-api/
├── config.js               ← Central config (base URL, endpoints, headers)
├── vercel.json             ← Rewrites all traffic → /api
├── package.json
├── lib/
│   └── scraper.js          ← Shared fetch wrapper + helpers
└── api/
    ├── index.js            ← Single Vercel handler / router
    └── pages/
        ├── home.js         ← Homepage sliders
        ├── trending.js     ← Trending videos
        ├── search.js       ← Search
        ├── browse.js       ← Browse / catalog
        ├── video.js        ← Single video + streams
        ├── tags.js         ← All tags
        └── brands.js       ← Studios / brands
```

## Endpoints

| Method | Route | Params |
|--------|-------|--------|
| GET | `/api/v1/health` | — |
| GET | `/api/v1/home` | — |
| GET | `/api/v1/trending` | `time` (day\|week\|month), `page`, `limit` |
| GET | `/api/v1/search` | `q`, `page`, `limit`, `tags`, `brands`, `order_by`, `ordering` |
| GET | `/api/v1/browse` | `page`, `limit`, `tags`, `brands`, `blacklist`, `order_by`, `ordering` |
| GET | `/api/v1/video` | `slug` (required) |
| GET | `/api/v1/tags` | — |
| GET | `/api/v1/brands` | — |

## Quick Start

```bash
npm i -g vercel
vercel dev        # local dev on http://localhost:3000
vercel --prod     # deploy
```

## Configuration

All URLs, endpoints, headers, and pagination defaults live in **`config.js`**.
To point to a different API host or add a new endpoint, only edit that one file.

### Example — change base URL

```js
// config.js
BASE_URL: "https://hanime.tv",
API_BASE: "https://hanime.tv/api/v8",   // ← update here
```

### Example — add a new endpoint

```js
// 1. config.js
ENDPOINTS: {
  ...
  NEWEST: "/newest",    // ← add here
}

// 2. api/pages/newest.js  ← create page module
// 3. api/index.js          ← add route case
```

## Response Shape

All endpoints return:

```json
{
  "success": true,
  "data": { ... }
}
```

Errors return:

```json
{
  "success": false,
  "error": "Human-readable message",
  "details": "Raw upstream error (optional)"
}
```
