# hanime.tv Scraper API — Vercel

A zero-dependency Vercel-hosted API that scrapes hanime.tv and exposes
structured JSON endpoints, plus a browser dashboard to test them live.

## Project Structure

```
hanime-scraper/
├── api/
│   ├── home.js        GET /api/home
│   ├── video.js       GET /api/video?slug=<slug>
│   ├── search.js      GET /api/search?q=<query>&tags=<t1,t2>
│   └── trending.js    GET /api/trending
├── lib/
│   ├── scraper.js     Core scraping & parsing logic
│   └── cors.js        CORS helpers
├── public/
│   └── index.html     Browser dashboard UI
├── config.js          Centralised configuration
├── vercel.json        Vercel routing & function settings
└── package.json
```

## Endpoints

| Endpoint | Params | Description |
|---|---|---|
| `GET /api/home` | — | All home-page sections |
| `GET /api/trending` | — | Trending videos (past 30 days) |
| `GET /api/search` | `q=`, `tags=` | Search results |
| `GET /api/video` | `slug=` | Single video details |

### Example responses

**GET /api/home**
```json
{
  "ok": true,
  "source": "live",
  "sections": {
    "Recent Uploads": [ { "id": 3399, "name": "...", "slug": "...", "views": 872548, "cover_url": "...", "url": "..." } ],
    "Trending": [ ... ],
    "New Releases": [ ... ],
    "Random": [ ... ]
  },
  "scraped_at": "2026-02-19T..."
}
```

**GET /api/video?slug=natsu-to-hako-1**
```json
{
  "ok": true,
  "source": "live",
  "video": {
    "id": 3393,
    "name": "Natsu to Hako 1",
    "slug": "natsu-to-hako-1",
    "views": 2516350,
    "cover_url": "https://hanime-cdn.com/images/covers/natsu-to-hako-1-cv1.webp",
    "tags": ["romance", "vanilla"],
    "url": "https://hanime.tv/videos/hentai/natsu-to-hako-1"
  },
  "scraped_at": "2026-02-19T..."
}
```

## Deploy to Vercel

```bash
# 1. Install Vercel CLI
npm i -g vercel

# 2. Clone / enter project
cd hanime-scraper

# 3. Deploy
vercel

# 4. For production
vercel --prod
```

## Local Development

```bash
vercel dev
# Open http://localhost:3000
```

## config.js

Edit `config.js` to adjust:
- `CACHE.ttl` — per-endpoint cache TTL (seconds)
- `RATE_LIMIT_MS` — delay between outbound requests
- `HEADERS` — request headers sent to hanime.tv
- `VERCEL.maxDuration` — max serverless function timeout

## How it works

1. Each `/api/*.js` file is a Vercel Serverless Function.
2. `lib/scraper.js` fetches the target page, extracts the embedded
   `window.__NUXT__` state (a compressed IIFE), evaluates it to get
   structured video data, then falls back to regex parsing if that fails.
3. Results are cached in-memory per function instance for the TTL
   configured in `config.js`.
4. The dashboard at `/` lets you test all endpoints visually.
