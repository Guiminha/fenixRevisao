export interface ParsedVimeo {
  videoId: string;
  hash: string;
  embedUrl: string;
  isValid: boolean;
}

/**
 * Parses any Vimeo input string (Video ID, Vimeo URL, Private Vimeo URL, Player URL, or Iframe code)
 * and generates a clean, anti-redirect Vimeo API Embed URL.
 */
export function parseVimeoInput(input: string): ParsedVimeo {
  if (!input) return { videoId: "", hash: "", embedUrl: "", isValid: false };
  let trimmed = input.trim();

  // Extract src if full iframe embed code was pasted
  if (trimmed.includes("<iframe")) {
    const srcMatch = trimmed.match(/src=["']([^"']+)["']/);
    if (srcMatch && srcMatch[1]) {
      trimmed = srcMatch[1];
    }
  }

  let videoId = "";
  let hash = "";

  if (trimmed.includes("player.vimeo.com/video/")) {
    const parts = trimmed.split("player.vimeo.com/video/")[1] || "";
    const [idPart, queryPart] = parts.split("?");
    videoId = idPart?.split("/")[0] || "";
    if (queryPart) {
      const params = new URLSearchParams(queryPart);
      hash = params.get("h") || "";
    }
  } else if (trimmed.includes("vimeo.com/")) {
    const path = trimmed.split("vimeo.com/")[1]?.split("?")[0] || "";
    const segments = path.split("/").filter(Boolean);
    if (segments.length >= 1) {
      videoId = segments[0];
    }
    if (segments.length >= 2) {
      hash = segments[1];
    }
  } else if (/^\d+$/.test(trimmed)) {
    videoId = trimmed;
  }

  if (!videoId) {
    return { videoId: "", hash: "", embedUrl: "", isValid: false };
  }

  const hQuery = hash ? `h=${hash}&` : "";
  // Anti-redirect parameters for Vimeo API Embed:
  // title=0: hides video title bar (prevents clicking title to open vimeo.com)
  // byline=0: hides author byline
  // portrait=0: hides author avatar
  // badge=0: hides badge
  // autopause=0: keeps playing smoothly
  // transparent=0, dnt=1
  const embedUrl = `https://player.vimeo.com/video/${videoId}?${hQuery}title=0&byline=0&portrait=0&badge=0&autopause=0&player_id=0&app_id=58479&transparent=0&dnt=1`;

  return {
    videoId,
    hash,
    embedUrl,
    isValid: true
  };
}

export function formatSecondsToTime(seconds: number): string {
  if (!seconds || isNaN(seconds)) return "00:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const formattedMins = String(mins).padStart(2, "0");
  const formattedSecs = String(secs).padStart(2, "0");
  return `${formattedMins}:${formattedSecs}`;
}
