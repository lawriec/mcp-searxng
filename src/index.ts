#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { handleSearch, handleEngines, handleVpnRegions } from "./tools/index.js";
import type { SearchArgs } from "./tools/search.js";
import { hasRegions } from "./utils/region-resolver.js";

const server = new Server(
  { name: "searxng", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "searxng_search",
      description:
        "Search the web using a self-hosted SearXNG meta-search engine. " +
        "Queries multiple search engines (Google, Bing, Brave, DuckDuckGo, Yahoo, etc.) simultaneously " +
        "and returns aggregated results with engine attribution. " +
        "Supports engine-native operators — Google operators (site:, intitle:, filetype:, " +
        '"exact phrase", before:/after:) work when Google is in the engine list. ' +
        "Use the engines parameter to target specific engines, or categories to search " +
        "videos, images, files, news, science, music, or social media. " +
        "You can also pass an image URL as the query to trace where an image already appears online — " +
        "engines will text-match pages whose HTML embeds that exact URL. Note this is not visual " +
        "similarity matching; it only finds images that are already indexed on other pages.",
      inputSchema: {
        type: "object" as const,
        properties: {
          query: {
            type: "string",
            description:
              "Search query. Supports engine-native operators — e.g. Google operators " +
              '(site:, intitle:, filetype:, "exact phrase", before:/after:) work when ' +
              "Google is in the engine list. The query is passed through verbatim to each engine.",
          },
          engines: {
            type: "array",
            items: { type: "string" },
            description:
              'Specific engines to query (e.g. ["google", "bing", "brave"]). ' +
              "If omitted, SearXNG uses its default enabled engine set. " +
              "Use searxng_engines to see available engines and their categories.",
          },
          categories: {
            type: "array",
            items: { type: "string" },
            description:
              "Search categories: general, images, videos, news, music, files, " +
              "social_media, science, it, map. " +
              'Use ["files"] for torrents/downloads, ["science"] for academic papers, ' +
              '["videos"] for video platforms. If omitted, defaults to general.',
          },
          language: {
            type: "string",
            description:
              'Language code (e.g. "en", "ja", "fr", "de") or "all" for no language filter.',
          },
          time_range: {
            type: "string",
            description: 'Time filter: "day", "month", or "year".',
          },
          pageno: {
            type: "number",
            description: "Page number, starting at 1 (default 1).",
          },
          max_results: {
            type: "number",
            description:
              "Maximum number of results to return (default 20, max 100). " +
              "Controls how many results are included in the response.",
          },
          safesearch: {
            type: "number",
            description:
              "Safe search level: 0 (off), 1 (moderate), 2 (strict).",
          },
          ...(hasRegions()
            ? {
                region: {
                  type: "string",
                  description:
                    "VPN exit region for this search. Routes the query through a SearXNG instance " +
                    "connected to a VPN in that region. Use searxng_vpn_regions to see available regions. " +
                    "Useful for geo-filtered results (e.g. Google returns different results from UK vs Japan exit).",
                },
              }
            : {}),
        },
        required: ["query"],
      },
    },
    {
      name: "searxng_engines",
      description:
        "List available search engines on the SearXNG instance, grouped by category. " +
        "Shows which engines are enabled and their categories. " +
        "Use this to discover what engines are available before searching, " +
        "or to verify the SearXNG instance is running and healthy.",
      inputSchema: {
        type: "object" as const,
        properties: {},
      },
    },
    ...(hasRegions()
      ? [
          {
            name: "searxng_vpn_regions",
            description:
              "List available VPN regions. Each region routes searches through a SearXNG instance " +
              "connected to a VPN exit in that region. Use the region parameter on searxng_search " +
              "to target a specific region.",
            inputSchema: {
              type: "object" as const,
              properties: {},
            },
          },
        ]
      : []),
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case "searxng_search":
      return handleSearch(args as unknown as SearchArgs);
    case "searxng_engines":
      return handleEngines();
    case "searxng_vpn_regions":
      return handleVpnRegions();
    default:
      throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("mcp-searxng MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
