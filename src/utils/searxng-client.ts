import { getSearxngUrl } from "./validators.js";
import { rateLimiter } from "./rate-limiter.js";

const DEFAULT_TIMEOUT_MS = 30_000;

function getTimeoutMs(): number {
  const envVal = process.env.SEARXNG_TIMEOUT_MS;
  return envVal && Number.isFinite(Number(envVal))
    ? Math.max(1000, Number(envVal))
    : DEFAULT_TIMEOUT_MS;
}

// --- Types matching SearXNG JSON response ---

export interface SearxngResult {
  title: string;
  url: string;
  content: string;
  score: number;
  engine: string;
  engines: string[];
  category: string;
  publishedDate?: string;
  thumbnail?: string;
  img_src?: string;
}

export interface SearxngSearchResponse {
  query: string;
  results: SearxngResult[];
  number_of_results: number;
  suggestions: string[];
  infoboxes: unknown[];
}

export interface SearxngSearchParams {
  query: string;
  engines?: string[];
  categories?: string[];
  language?: string;
  time_range?: string;
  pageno?: number;
  safesearch?: number;
}

export interface SearxngEngineInfo {
  name: string;
  enabled: boolean;
  categories: string[];
  language_support: boolean;
  timeout: number;
  shortcut: string;
}

// --- Search ---

export async function searxngSearch(
  params: SearxngSearchParams
): Promise<SearxngSearchResponse> {
  const baseUrl = getSearxngUrl();

  const searchParams = new URLSearchParams();
  searchParams.set("q", params.query);
  searchParams.set("format", "json");

  if (params.engines && params.engines.length > 0) {
    searchParams.set("engines", params.engines.join(","));
  }
  if (params.categories && params.categories.length > 0) {
    searchParams.set("categories", params.categories.join(","));
  }
  if (params.language) {
    searchParams.set("language", params.language);
  }
  if (params.time_range) {
    searchParams.set("time_range", params.time_range);
  }
  if (params.pageno !== undefined) {
    searchParams.set("pageno", String(params.pageno));
  }
  if (params.safesearch !== undefined) {
    searchParams.set("safesearch", String(params.safesearch));
  }

  await rateLimiter.acquireSlot();

  const url = `${baseUrl}/search?${searchParams.toString()}`;
  const timeoutMs = getTimeoutMs();

  let response: Response;
  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new Error(
        `SearXNG request timed out after ${timeoutMs / 1000}s. ` +
          "The instance may be overloaded or an engine is slow."
      );
    }
    if (
      error instanceof TypeError &&
      (error.message.includes("ECONNREFUSED") ||
        error.message.includes("fetch failed"))
    ) {
      throw new Error(
        `Cannot connect to SearXNG at ${baseUrl}. ` +
          "Is the Docker container running? " +
          "Start it with: cd mcp-searxng/docker && docker compose up -d"
      );
    }
    throw error;
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    if (response.status === 403) {
      throw new Error(
        `SearXNG returned 403 Forbidden. ` +
          "Ensure 'json' is listed in the 'formats' section of settings.yml."
      );
    }
    throw new Error(
      `SearXNG returned HTTP ${response.status}: ${body.slice(0, 500)}`
    );
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new Error(
      "SearXNG returned invalid JSON. " +
        "Ensure 'json' is in the settings.yml formats list and the instance is healthy."
    );
  }

  const resp = data as SearxngSearchResponse;
  return {
    query: resp.query ?? params.query,
    results: Array.isArray(resp.results) ? resp.results : [],
    number_of_results: resp.number_of_results ?? 0,
    suggestions: Array.isArray(resp.suggestions) ? resp.suggestions : [],
    infoboxes: Array.isArray(resp.infoboxes) ? resp.infoboxes : [],
  };
}

// --- Engine list ---

interface SearxngConfigResponse {
  engines: Record<
    string,
    {
      enabled: boolean;
      categories: string[];
      language_support: boolean;
      timeout: number;
      shortcut: string;
    }
  >;
}

export async function searxngEngines(): Promise<SearxngEngineInfo[]> {
  const baseUrl = getSearxngUrl();
  const timeoutMs = getTimeoutMs();

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/config`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    if (
      error instanceof TypeError &&
      (error.message.includes("ECONNREFUSED") ||
        error.message.includes("fetch failed"))
    ) {
      throw new Error(
        `Cannot connect to SearXNG at ${baseUrl}. ` +
          "Is the Docker container running?"
      );
    }
    throw error;
  }

  if (!response.ok) {
    throw new Error(
      `SearXNG /config returned HTTP ${response.status}. ` +
        "The /config endpoint may be disabled on this instance."
    );
  }

  const data = (await response.json()) as SearxngConfigResponse;

  if (!data.engines || typeof data.engines !== "object") {
    throw new Error("SearXNG /config response missing engines field");
  }

  const engines: SearxngEngineInfo[] = [];
  for (const [name, info] of Object.entries(data.engines)) {
    engines.push({
      name,
      enabled: info.enabled ?? false,
      categories: Array.isArray(info.categories) ? info.categories : [],
      language_support: info.language_support ?? false,
      timeout: info.timeout ?? 0,
      shortcut: info.shortcut ?? "",
    });
  }

  engines.sort((a, b) => a.name.localeCompare(b.name));
  return engines;
}
