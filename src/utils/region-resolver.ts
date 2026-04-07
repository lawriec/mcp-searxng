// Parses SEARXNG_REGIONS env var: "uk=http://localhost:8081,jp=http://localhost:8082"
// Returns a Map<string, string> of region name → SearXNG base URL

export function getRegionMap(): Map<string, string> | null {
  const raw = process.env.SEARXNG_REGIONS;
  if (!raw) return null;

  const map = new Map<string, string>();
  for (const pair of raw.split(",")) {
    const [region, url] = pair.split("=", 2);
    if (region && url) {
      map.set(region.trim().toLowerCase(), url.trim().replace(/\/+$/, ""));
    }
  }
  return map.size > 0 ? map : null;
}

export function resolveRegionUrl(region: string): string {
  const map = getRegionMap();
  if (!map) {
    throw new Error(
      "No regions configured. Set SEARXNG_REGIONS env var " +
        '(e.g. "uk=http://localhost:8081,jp=http://localhost:8082").'
    );
  }
  const url = map.get(region.toLowerCase());
  if (!url) {
    const available = [...map.keys()].join(", ");
    throw new Error(
      `Unknown region "${region}". Available regions: ${available}`
    );
  }
  return url;
}

export function hasRegions(): boolean {
  return getRegionMap() !== null;
}
