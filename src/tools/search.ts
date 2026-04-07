import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { searxngSearch } from "../utils/searxng-client.js";
import {
  validateQuery,
  validateEngines,
  validateCategories,
  validateTimeRange,
  validatePageno,
  validateMaxResults,
  validateSafesearch,
  validateLanguage,
} from "../utils/validators.js";

export interface SearchArgs {
  query: string;
  engines?: string[];
  categories?: string[];
  language?: string;
  time_range?: string;
  pageno?: number;
  max_results?: number;
  safesearch?: number;
}

const DEFAULT_MAX_RESULTS = 20;

export async function handleSearch(args: SearchArgs): Promise<CallToolResult> {
  try {
    const query = validateQuery(args.query);
    const engines = args.engines ? validateEngines(args.engines) : undefined;
    const categories = args.categories
      ? validateCategories(args.categories)
      : undefined;
    const language = args.language
      ? validateLanguage(args.language)
      : undefined;
    const time_range = args.time_range
      ? validateTimeRange(args.time_range)
      : undefined;
    const pageno = args.pageno ? validatePageno(args.pageno) : undefined;
    const maxResults = args.max_results
      ? validateMaxResults(args.max_results)
      : DEFAULT_MAX_RESULTS;
    const safesearch =
      args.safesearch !== undefined
        ? validateSafesearch(args.safesearch)
        : undefined;

    const response = await searxngSearch({
      query,
      engines,
      categories,
      language,
      time_range,
      pageno,
      safesearch,
    });

    const truncated = response.results.slice(0, maxResults);

    if (truncated.length === 0) {
      let msg = `No results found for: ${query}`;
      if (response.suggestions.length > 0) {
        msg += `\n\nSuggestions: ${JSON.stringify(response.suggestions)}`;
      }
      return { content: [{ type: "text" as const, text: msg }] };
    }

    const engineList = engines
      ? engines.join(", ")
      : "default engines";

    const results = truncated.map((r) => ({
      title: r.title || "(no title)",
      url: r.url || "",
      content: r.content || "",
      score: typeof r.score === "number" ? Number(r.score.toFixed(3)) : 0,
      engines: Array.isArray(r.engines) ? r.engines : [r.engine || "unknown"],
      category: r.category || "",
      publishedDate: r.publishedDate || undefined,
    }));

    let text = `Found ${truncated.length} result(s) via SearXNG (${engineList})`;
    if (response.number_of_results > truncated.length) {
      text += ` — ${response.number_of_results} total available`;
    }
    text += ":\n";

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
