// ============================================================
//  api/pages/home.js — Homepage sliders / featured sections
//  Endpoint: GET /api/v1/home
// ============================================================

import { CONFIG } from "../../config.js";
import { fetchUpstream } from "../../lib/scraper.js";
import { formatVideo } from "../../lib/format.js";

export async function getHome() {
  const raw = await fetchUpstream(CONFIG.ENDPOINTS.HOME);

  const sliders = (raw.browse_sliders ?? []).map((slider) => ({
    title:       slider.title       ?? slider.name ?? "Unknown",
    slug:        slider.slug        ?? null,
    description: slider.description ?? null,
    videos:      (slider.hentai_videos ?? []).map(formatVideo),
  }));

  return {
    total_sections: sliders.length,
    sliders,
  };
}
