import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { getRegionMap } from "../utils/region-resolver.js";

export async function handleVpnRegions(): Promise<CallToolResult> {
  const map = getRegionMap();
  if (!map) {
    return {
      content: [
        {
          type: "text" as const,
          text: "No VPN regions configured. Set SEARXNG_REGIONS env var to enable multi-region support.",
        },
      ],
    };
  }

  const regions = [...map.entries()].map(([name, url]) => ({ name, url }));
  let text = `${regions.length} VPN region(s) available:\n`;
  for (const r of regions) {
    text += `  ${r.name} → ${r.url}\n`;
  }
  text +=
    '\nUse the "region" parameter on searxng_search to route queries through a specific region.';

  return { content: [{ type: "text" as const, text }] };
}
