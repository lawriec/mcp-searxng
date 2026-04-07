import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { searxngEngines } from "../utils/searxng-client.js";
import { getSearxngUrl } from "../utils/validators.js";

export async function handleEngines(): Promise<CallToolResult> {
  try {
    const baseUrl = getSearxngUrl();
    const engines = await searxngEngines();

    // Group by category
    const byCategory = new Map<string, typeof engines>();
    for (const engine of engines) {
      for (const cat of engine.categories) {
        if (!byCategory.has(cat)) {
          byCategory.set(cat, []);
        }
        byCategory.get(cat)!.push(engine);
      }
    }

    const enabledCount = engines.filter((e) => e.enabled).length;

    let text = `SearXNG instance at ${baseUrl} — ${engines.length} engines configured (${enabledCount} enabled):\n`;

    const sortedCategories = [...byCategory.keys()].sort();
    for (const cat of sortedCategories) {
      const catEngines = byCategory.get(cat)!;
      const enabled = catEngines.filter((e) => e.enabled);
      const disabled = catEngines.filter((e) => !e.enabled);

      text += `\n${cat} (${enabled.length} enabled, ${disabled.length} disabled):\n`;

      if (enabled.length > 0) {
        text += `  enabled: ${enabled.map((e) => e.name).join(", ")}\n`;
      }
      if (disabled.length > 0) {
        text += `  disabled: ${disabled.map((e) => e.name).join(", ")}\n`;
      }
    }

    text += `\n${JSON.stringify(engines, null, 2)}`;

    return { content: [{ type: "text" as const, text }] };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { content: [{ type: "text" as const, text: msg }], isError: true };
  }
}
