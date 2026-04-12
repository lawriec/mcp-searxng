const VALID_CATEGORIES = [
  "general",
  "images",
  "videos",
  "news",
  "music",
  "files",
  "social_media",
  "science",
  "it",
  "map",
] as const;

const VALID_TIME_RANGES = ["day", "month", "year"] as const;

export function validateQuery(query: string): string {
  const trimmed = query.trim();
  if (!trimmed) {
    throw new Error("Search query must not be empty");
  }
  if (trimmed.length > 2000) {
    throw new Error("Search query must be 2000 characters or fewer");
  }
  return trimmed;
}

export function validateEngines(engines: string[]): string[] {
  if (!Array.isArray(engines) || engines.length === 0) {
    throw new Error("engines must be a non-empty array of engine names");
  }
  if (engines.length > 20) {
    throw new Error("engines must contain 20 or fewer entries");
  }
  for (const name of engines) {
    const trimmed = name.trim().toLowerCase();
    if (!trimmed) {
      throw new Error("Engine name must not be empty");
    }
    if (!/^[a-z0-9_ .'\-]+$/.test(trimmed)) {
      throw new Error(
        `Invalid engine name: "${name}". Only lowercase letters, digits, underscores, spaces, hyphens, dots, and apostrophes are allowed.`
      );
    }
  }
  return engines.map((e) => e.trim().toLowerCase());
}

export function validateCategories(categories: string[]): string[] {
  if (!Array.isArray(categories) || categories.length === 0) {
    throw new Error("categories must be a non-empty array");
  }
  for (const cat of categories) {
    const trimmed = cat.trim().toLowerCase();
    if (!(VALID_CATEGORIES as readonly string[]).includes(trimmed)) {
      throw new Error(
        `Invalid category: "${cat}". Valid categories: ${VALID_CATEGORIES.join(", ")}`
      );
    }
  }
  return categories.map((c) => c.trim().toLowerCase());
}

export function validateTimeRange(range: string): string {
  const trimmed = range.trim().toLowerCase();
  if (!(VALID_TIME_RANGES as readonly string[]).includes(trimmed)) {
    throw new Error(
      `Invalid time_range: "${range}". Must be one of: ${VALID_TIME_RANGES.join(", ")}`
    );
  }
  return trimmed;
}

export function validatePageno(pageno: number): number {
  if (!Number.isInteger(pageno) || pageno < 1) {
    throw new Error("pageno must be a positive integer");
  }
  return pageno;
}

export function validateMaxResults(max: number): number {
  if (!Number.isInteger(max) || max < 1 || max > 100) {
    throw new Error("max_results must be an integer between 1 and 100");
  }
  return max;
}

export function validateSafesearch(level: number): number {
  if (level !== 0 && level !== 1 && level !== 2) {
    throw new Error("safesearch must be 0 (off), 1 (moderate), or 2 (strict)");
  }
  return level;
}

export function validateLanguage(lang: string): string {
  const trimmed = lang.trim().toLowerCase();
  if (trimmed === "all") return trimmed;
  if (!/^[a-z]{2}(-[a-z]{2})?$/.test(trimmed)) {
    throw new Error(
      `Invalid language code: "${lang}". Use a code like "en", "ja", "fr", "de-de", or "all".`
    );
  }
  return trimmed;
}

export function validateRegion(region: string): string {
  const trimmed = region.trim().toLowerCase();
  if (!trimmed) {
    throw new Error("region must not be empty");
  }
  if (!/^[a-z0-9_-]+$/.test(trimmed)) {
    throw new Error(
      `Invalid region: "${region}". Use lowercase letters, digits, hyphens, underscores.`
    );
  }
  return trimmed;
}

export function validateSite(site: string): string {
  const trimmed = site.trim().toLowerCase();
  if (!trimmed) {
    throw new Error("site must not be empty");
  }
  // Strip protocol prefix if provided
  const cleaned = trimmed.replace(/^https?:\/\//, "");
  if (/\s/.test(cleaned)) {
    throw new Error(
      `Invalid site: "${site}". Must be a domain (e.g. "example.com", "docs.example.com").`
    );
  }
  if (!/^[a-z0-9]([a-z0-9\-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9\-]*[a-z0-9])?)*$/.test(cleaned)) {
    throw new Error(
      `Invalid site: "${site}". Must be a domain (e.g. "example.com", "docs.example.com").`
    );
  }
  return cleaned;
}

export function validateFiletype(filetype: string): string {
  const trimmed = filetype.trim().toLowerCase().replace(/^\./, "");
  if (!trimmed) {
    throw new Error("filetype must not be empty");
  }
  if (!/^[a-z0-9]{1,10}$/.test(trimmed)) {
    throw new Error(
      `Invalid filetype: "${filetype}". Must be a file extension like "pdf", "docx", "csv".`
    );
  }
  return trimmed;
}

export function validateDateParam(date: string, paramName: string): string {
  const trimmed = date.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw new Error(
      `Invalid ${paramName} date: "${date}". Must be YYYY-MM-DD format (e.g. 2025-01-01).`
    );
  }
  const parsed = new Date(trimmed);
  if (isNaN(parsed.getTime())) {
    throw new Error(
      `Invalid ${paramName} date: "${date}". Not a valid date.`
    );
  }
  return trimmed;
}

export function validateInurl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("inurl must not be empty");
  }
  if (/\s/.test(trimmed)) {
    throw new Error(
      `Invalid inurl: "${value}". Must be a single term without spaces.`
    );
  }
  if (trimmed.length > 200) {
    throw new Error("inurl must be 200 characters or fewer");
  }
  return trimmed;
}

export function validateIntitle(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("intitle must not be empty");
  }
  if (trimmed.length > 200) {
    throw new Error("intitle must be 200 characters or fewer");
  }
  return trimmed;
}

export function getSearxngUrl(): string {
  const url = process.env.SEARXNG_URL || "http://localhost:8080";
  const trimmed = url.trim().replace(/\/+$/, "");
  if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
    throw new Error(
      `SEARXNG_URL must start with http:// or https:// (got: "${trimmed}")`
    );
  }
  return trimmed;
}
