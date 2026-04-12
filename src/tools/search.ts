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
  validateRegion,
  validateSite,
  validateFiletype,
  validateDateParam,
  validateInurl,
  validateIntitle,
} from "../utils/validators.js";
import { resolveRegionUrl } from "../utils/region-resolver.js";

export interface SearchArgs {
  query: string;
  engines?: string[];
  categories?: string[];
  language?: string;
  time_range?: string;
  pageno?: number;
  max_results?: number;
  safesearch?: number;
  region?: string;
  site?: string;
  filetype?: string;
  after?: string;
  before?: string;
  inurl?: string;
  intitle?: string;
}

interface OperatorArgs {
  site?: string;
  filetype?: string;
  after?: string;
  before?: string;
  inurl?: string;
  intitle?: string;
}

const OPERATOR_SUPPORTED_ENGINES: Record<string, string[] | null> = {
  site: null,
  filetype: ["google", "bing", "duckduckgo", "brave", "yahoo"],
  after: ["google", "bing"],
  before: ["google", "bing"],
  inurl: ["google"],
  intitle: ["google", "bing", "brave", "yahoo"],
};

function resolveEngineRestrictions(
  operators: OperatorArgs,
  userEngines: string[] | undefined
): { engines: string[] | undefined; restrictions: string[] } {
  const restrictions: string[] = [];
  let resolved: string[] | undefined = undefined;

  for (const [op, supportedEngines] of Object.entries(OPERATOR_SUPPORTED_ENGINES)) {
    if (!(operators as Record<string, unknown>)[op]) continue;
    if (supportedEngines === null) continue;

    if (resolved === undefined) {
      resolved = [...supportedEngines];
    } else {
      resolved = resolved.filter((e) => supportedEngines.includes(e));
    }
    restrictions.push(`${op} requires: ${supportedEngines.join(", ")}`);
  }

  if (resolved !== undefined && userEngines) {
    const intersected = userEngines.filter((e) => resolved!.includes(e));
    if (intersected.length === 0) {
      const operatorsUsed = restrictions.map((r) => r.split(" ")[0]).join(", ");
      throw new Error(
        `Cannot use ${operatorsUsed} operator(s): none of the specified engines ` +
          `(${userEngines.join(", ")}) support them. ${restrictions.join("; ")}.`
      );
    }
    resolved = intersected;
  } else if (resolved !== undefined && resolved.length === 0) {
    const operatorsUsed = restrictions.map((r) => r.split(" ")[0]).join(", ");
    throw new Error(
      `Cannot combine ${operatorsUsed} operators: no engine supports all of them. ` +
        `${restrictions.join("; ")}.`
    );
  }

  return { engines: resolved ?? userEngines, restrictions };
}

function buildOperatorQuery(query: string, operators: OperatorArgs): string {
  const parts = [query];
  if (operators.site) parts.push(`site:${operators.site}`);
  if (operators.filetype) parts.push(`filetype:${operators.filetype}`);
  if (operators.after) parts.push(`after:${operators.after}`);
  if (operators.before) parts.push(`before:${operators.before}`);
  if (operators.inurl) parts.push(`inurl:${operators.inurl}`);
  if (operators.intitle) parts.push(`intitle:${operators.intitle}`);
  return parts.join(" ");
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
    const region = args.region ? validateRegion(args.region) : undefined;
    const baseUrlOverride = region ? resolveRegionUrl(region) : undefined;

    const site = args.site ? validateSite(args.site) : undefined;
    const filetype = args.filetype ? validateFiletype(args.filetype) : undefined;
    const after = args.after ? validateDateParam(args.after, "after") : undefined;
    const before = args.before
      ? validateDateParam(args.before, "before")
      : undefined;
    const inurl = args.inurl ? validateInurl(args.inurl) : undefined;
    const intitle = args.intitle ? validateIntitle(args.intitle) : undefined;

    const operatorArgs: OperatorArgs = {
      site,
      filetype,
      after,
      before,
      inurl,
      intitle,
    };
    const { engines: resolvedEngines, restrictions } =
      resolveEngineRestrictions(operatorArgs, engines);
    const modifiedQuery = buildOperatorQuery(query, operatorArgs);

    const response = await searxngSearch(
      {
        query: modifiedQuery,
        engines: resolvedEngines,
        categories,
        language,
        time_range,
        pageno,
        safesearch,
      },
      baseUrlOverride
    );

    const truncated = response.results.slice(0, maxResults);

    if (truncated.length === 0) {
      let msg = `No results found for: ${query}`;
      if (response.suggestions.length > 0) {
        msg += `\n\nSuggestions: ${JSON.stringify(response.suggestions)}`;
      }
      return { content: [{ type: "text" as const, text: msg }] };
    }

    const engineList = resolvedEngines
      ? resolvedEngines.join(", ")
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

    let text = `Found ${truncated.length} result(s) via SearXNG`;
    if (region) text += ` (region: ${region})`;
    text += ` (${engineList})`;
    if (response.number_of_results > truncated.length) {
      text += ` — ${response.number_of_results} total available`;
    }
    text += ":\n";

    if (restrictions.length > 0) {
      text += `\n[Engines restricted: ${resolvedEngines!.join(", ")} — ${restrictions.join("; ")}]\n`;
    }

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
