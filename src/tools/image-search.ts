import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { searxngSearch } from "../utils/searxng-client.js";
import {
  validateImageUrl,
  validateEngines,
  validateMaxResults,
  validateSafesearch,
  validateRegion,
} from "../utils/validators.js";
import { resolveRegionUrl } from "../utils/region-resolver.js";

export interface ImageSearchArgs {
  image_url: string;
  engines?: string[];
  max_results?: number;
  safesearch?: number;
  region?: string;
}

const DEFAULT_MAX_RESULTS = 20;

/**
 * Default engines for reverse image search.
 * SearXNG's online_url_search processor detects that the query is a URL
 * and routes it to engines that support reverse image lookup.
 * TinEye is the primary reverse image search engine in SearXNG.
 * Google Images also supports reverse image search when the query is a URL.
 */
const DEFAULT_REVERSE_IMAGE_ENGINES = ["tineye", "google images"];

export async function handleImageSearch(
  args: ImageSearchArgs
): Promise<CallToolResult> {
  try {
    const imageUrl = validateImageUrl(args.image_url);
    const engines = args.engines
      ? validateEngines(args.engines)
      : DEFAULT_REVERSE_IMAGE_ENGINES;
    const maxResults = args.max_results
      ? validateMaxResults(args.max_results)
      : DEFAULT_MAX_RESULTS;
    const safesearch =
      args.safesearch !== undefined
        ? validateSafesearch(args.safesearch)
        : undefined;
    const region = args.region ? validateRegion(args.region) : undefined;
    const baseUrlOverride = region ? resolveRegionUrl(region) : undefined;

    // Pass the image URL as the query — SearXNG's online_url_search processor
    // detects URL-shaped queries and routes them to reverse image search engines.
    const response = await searxngSearch(
      { query: imageUrl, engines, safesearch },
      baseUrlOverride
    );

    const truncated = response.results.slice(0, maxResults);

    if (truncated.length === 0) {
      return {
        content: [
          {
            type: "text" as const,
            text:
              `No reverse image search results found for: ${imageUrl}\n\n` +
              "Tips:\n" +
              "- Ensure the image URL is publicly accessible\n" +
              "- Try a different image format (JPEG, PNG, WebP)\n" +
              "- The image may not exist in any reverse image search index",
          },
        ],
      };
    }

    const engineList = engines.join(", ");

    const results = truncated.map((r) => ({
      title: r.title || "(no title)",
      url: r.url || "",
      content: r.content || "",
      score: typeof r.score === "number" ? Number(r.score.toFixed(3)) : 0,
      engines: Array.isArray(r.engines) ? r.engines : [r.engine || "unknown"],
      category: r.category || "",
      thumbnail: r.thumbnail || undefined,
      img_src: r.img_src || undefined,
    }));

    let text = `Found ${truncated.length} reverse image search result(s) via SearXNG`;
    if (region) text += ` (region: ${region})`;
    text += ` (${engineList})`;
    if (response.number_of_results > truncated.length) {
      text += ` — ${response.number_of_results} total available`;
    }
    text += `\nImage URL searched: ${imageUrl}\n`;

    if (response.suggestions.length > 0) {
      text += `\nSuggestions: ${JSON.stringify(response.suggestions)}\n`;
    }

    text += `\n${JSON.stringify(results, null, 2)}`;

    return { content: [{ type: "text" as const, text }] };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { content: [{ type: "text" as const, text: msg }], isError: true };
  }
}
