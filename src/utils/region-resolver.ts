import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// Parses SEARXNG_REGIONS from env var or ~/.mcp-searxng-regions file.
// Format: "uk=http://localhost:8081,jp=http://localhost:8082"
// Returns a Map<string, string> of region name → SearXNG base URL

const REGIONS_FILE = join(homedir(), ".mcp-searxng-regions");

function readRegionsString(): string | null {
  // Env var takes priority
  const envVal = process.env.SEARXNG_REGIONS;
  if (envVal) return envVal;

  // Fall back to ~/.mcp-searxng-regions
  try {
    const content = readFileSync(REGIONS_FILE, "utf-8").trim();
    // File may contain SEARXNG_REGIONS=... or just the value
    const match = content.match(/^(?:SEARXNG_REGIONS=)?(.+)$/m);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

function parseRegions(raw: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const pair of raw.split(",")) {
    const [region, url] = pair.split("=", 2);
    if (region && url) {
      map.set(region.trim().toLowerCase(), url.trim().replace(/\/+$/, ""));
    }
  }
  return map;
}

export function getRegionMap(): Map<string, string> | null {
  const raw = readRegionsString();
  if (!raw) return null;

  const map = parseRegions(raw);
  return map.size > 0 ? map : null;
}

export function resolveRegionUrl(region: string): string {
  const map = getRegionMap();
  if (!map) {
    throw new Error(
      "No regions configured. Set SEARXNG_REGIONS env var or run " +
        "setup-regions.sh to generate ~/.mcp-searxng-regions."
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
