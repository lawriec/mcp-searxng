# Design: Remove Engine Selection, Enable VPN Rotation

## Context

Testing revealed that many search engines (Google, DuckDuckGo, Brave, Yahoo) are blocked or rate-limited when accessed through a single VPN IP. Meanwhile, LLM clients selecting specific engines via the `engines` parameter often makes things worse — narrowing to a broken engine yields 0 results when SearXNG's default aggregation across all engines would have worked fine.

This change removes direct engine selection from the tool interface and documents VPN rotation via SearXNG's built-in proxy round-robin as the recommended resilience strategy.

## MCP Server Changes

### 1. Remove `engines` from tool schema

Remove the `engines` property from `searxng_search`'s `inputSchema.properties` in `src/index.ts`. The field stays in `SearchArgs` internally — operator restrictions (filetype, inurl, etc. from the `feat/native-search-operators` branch) continue to set `engines` under the hood.

Update the tool description to remove references to engine selection. Replace mentions of "use the engines parameter to target specific engines" with guidance to use `categories` for filtering by type.

**Files:** `src/index.ts`

### 2. Remove `searxng_engines` tool

Remove the `searxng_engines` tool definition from `src/index.ts` and its handler from the `switch` statement. The tool's sole purpose was to inform engine selection, which is no longer exposed.

Remove `handleEngines` from the import in `src/index.ts`. The implementation file (`src/tools/engines.ts`) and its export from `src/tools/index.ts` can be deleted.

**Files:** `src/index.ts`, `src/tools/engines.ts` (delete), `src/tools/index.ts`

### 3. No changes to search logic

`src/tools/search.ts` is unchanged. The `engines` field in `SearchArgs` remains. When no engines are passed (which is now always the case from external callers), `resolveEngineRestrictions()` computes engine lists solely from operator requirements. When no operators restrict engines, `engines` stays `undefined` and SearXNG uses its full default engine set.

`src/utils/searxng-client.ts`, `src/utils/validators.ts`, `src/utils/rate-limiter.ts`, `src/utils/region-resolver.ts` are all unchanged.

## Docker/VPN Changes

### Multi-VPN per region with per-request rotation

SearXNG supports multiple SOCKS5 proxies with built-in round-robin — each search request gets a different proxy. Instead of one VPN container per region, `setup-regions.sh` will spin up one VPN container per `.ovpn` file and wire them all into SearXNG's proxy list.

For a region folder with 3 `.ovpn` files, the generated config looks like:

```yaml
# generated/settings-uk.yml
outgoing:
  proxies:
    all://:
      - socks5://vpn-uk-0:1080
      - socks5://vpn-uk-1:1080
      - socks5://vpn-uk-2:1080
  request_timeout: 10.0
```

No extra host ports needed — VPN containers communicate with SearXNG over the Docker network only.

The same approach applies to the default (non-region) instance. If the top-level VPN config directory contains `.ovpn` files directly (not in subfolders), each gets its own container, and `settings-vpn.yml` lists them all.

**Files:** `docker/setup-regions.sh`, `docker/docker-compose.vpn.yml`, `docker/settings-vpn.yml` (template)

### VPN container self-healing

Currently, if OpenVPN dies the entrypoint exits and Docker restarts the whole container. Improve this: on OpenVPN failure, pick a different random `.ovpn` profile from the config directory and reconnect in-place, without a container restart. Only exit if reconnection fails repeatedly (e.g. 3 consecutive failures).

This avoids the Docker restart delay and means a single bad `.ovpn` profile doesn't keep crashing the container in a restart loop.

**Files:** `docker/vpn/entrypoint.sh`

## What Stays

- `categories` param — the right abstraction for type-based filtering
- `region` param — explicit geo-targeting
- `language` param — content language preference
- `time_range`, `safesearch`, `pageno`, `max_results` — unchanged
- All operator params (site, filetype, after, before, inurl, intitle) — unchanged, with internal engine restrictions
- `searxng_vpn_regions` tool — still useful for discovering regions

## Verification

1. `npm run build` — TypeScript compiles
2. Confirm `searxng_search` tool schema no longer includes `engines`
3. Confirm `searxng_engines` tool no longer appears in tool list
4. Test search with operators — engine restrictions still work internally
5. Test search without any params — uses SearXNG's full engine set
6. `searxng_vpn_regions` tool still works
