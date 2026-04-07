# mcp-searxng

MCP server for multi-engine web search via a self-hosted [SearXNG](https://docs.searxng.org/) instance. Query Google, Bing, Brave, DuckDuckGo, Yahoo, and 250+ other engines through a single JSON API with full operator pass-through and engine attribution.

## Prerequisites

- **Node.js 18+**
- **Docker** (for running SearXNG)

## SearXNG Setup

### Quick Start (Recommended)

The `docker/` directory contains a pre-configured Docker Compose setup with curated engines for lost media research:

```bash
cd docker
docker compose up -d
```

This starts **SearXNG** on port 8080 with JSON API enabled and research-relevant engines activated.

Verify it's working:

```bash
curl "http://localhost:8080/search?q=test&format=json" | head -c 200
```

### Manual Docker

If you prefer to configure SearXNG yourself:

```bash
docker run -d -p 8080:8080 --name searxng searxng/searxng:latest
```

Then enable the JSON API (required — disabled by default):

```bash
docker exec searxng sh -c \
  "sed -i 's/formats:/formats:\n    - json/' /etc/searxng/settings.yml"
docker restart searxng
```

### First Run

After starting Docker, edit `docker/settings.yml` and change `secret_key` from `"change-me-on-first-run"` to a random string.

## VPN Recommendation

Self-hosting means your IP is directly visible to upstream search engines (Google, Bing, etc.) when SearXNG queries them. **Strongly recommend**:

- Route SearXNG's outgoing traffic through a **VPN** (add a VPN container to `docker-compose.yml`)
- Or host SearXNG on a **cloud server** with a non-residential IP
- Or configure proxy rotation in SearXNG's `outgoing.proxies` setting

This protects your IP from being flagged by upstream engines during intensive research sessions.

## Installation

Add to your `.mcp.json`:

```json
{
  "mcpServers": {
    "searxng": {
      "command": "npx",
      "args": ["-y", "github:lawriec/mcp-searxng"],
      "env": {
        "SEARXNG_URL": "http://localhost:8080"
      }
    }
  }
}
```

Or install from source:

```bash
git clone https://github.com/lawriec/mcp-searxng.git
cd mcp-searxng
npm install
npm run build
```

## Tools

### searxng_search

Multi-engine web search with engine selection, category filtering, and operator pass-through.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | Yes | Search query. Engine-native operators work — Google's `site:`, `filetype:`, `intitle:`, `before:/after:` pass through when Google is in the engine list. |
| `engines` | string[] | No | Specific engines to query (e.g. `["google", "bing", "brave"]`). Omit for default set. |
| `categories` | string[] | No | Categories: `general`, `images`, `videos`, `news`, `music`, `files`, `social_media`, `science`, `it`, `map` |
| `language` | string | No | Language code (`"en"`, `"ja"`, `"fr"`) or `"all"` |
| `time_range` | string | No | `"day"`, `"month"`, or `"year"` |
| `pageno` | number | No | Page number (default 1) |
| `max_results` | number | No | Max results returned (default 20, max 100) |
| `safesearch` | number | No | 0 (off), 1 (moderate), 2 (strict) |

**Examples:**

```
# Multi-engine general search
searxng_search(query: "lost cartoon 1980s")

# Target specific engines with Google operators
searxng_search(query: '"lost episode" site:archive.org filetype:pdf', engines: ["google"])

# Search for torrents/files
searxng_search(query: "rare VHS rip", categories: ["files"])

# Japanese content via Yahoo Japan
searxng_search(query: "幻のアニメ", engines: ["yahoo"], language: "ja")

# Academic papers
searxng_search(query: "media preservation archival", categories: ["science"])

# Video platforms
searxng_search(query: "deleted youtube video", categories: ["videos"])
```

### searxng_engines

List available engines grouped by category. Doubles as a health check.

No parameters. Returns all configured engines with enabled/disabled status.

## Engine Reliability Guide

| Engine | Reliability | Notes |
|--------|------------|-------|
| Brave, Mojeek, Bing | High | Rarely block self-hosted instances |
| DuckDuckGo | Medium-High | Occasional CAPTCHAs |
| Google | Medium | Rate-limits aggressively; self-hosted single-user is much better than public instances |
| Yahoo | Medium | Intermittent issues |
| Wikipedia, Wikidata | Always | Never rate-limited |
| Yandex | Broken | Removed from SearXNG entirely (API changes) |

## Customizing Engines

Edit `docker/settings.yml` to enable or disable engines. The file uses SearXNG's `use_default_settings` feature — all default engines are inherited, and you override specific ones:

```yaml
# Enable an engine that's disabled by default
engines:
  - name: nyaa
    disabled: false

# Disable an engine
  - name: google
    disabled: true

# Change an engine's timeout
  - name: google
    timeout: 8.0
```

After editing, restart SearXNG:

```bash
cd docker && docker compose restart searxng
```

See [SearXNG engine docs](https://docs.searxng.org/admin/settings/settings_engines.html) for all per-engine settings.

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SEARXNG_URL` | Yes | — | URL of your SearXNG instance (e.g. `http://localhost:8080`) |
| `SEARXNG_MIN_INTERVAL_MS` | No | `2000` | Minimum milliseconds between requests to SearXNG |
| `SEARXNG_TIMEOUT_MS` | No | `30000` | HTTP request timeout in milliseconds |

## Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| "Cannot connect to SearXNG" | Docker container not running | `cd docker && docker compose up -d` |
| "SearXNG returned 403" | JSON format not enabled | Add `json` to `search.formats` in `settings.yml`, restart |
| "SearXNG returned 429" | Rate limiter blocking API clients | Set `server.limiter: false` in `settings.yml`, restart. The MCP server has its own rate limiter. |
| "SearXNG request timed out" | Instance overloaded or engine slow | Check `docker logs searxng`, increase `SEARXNG_TIMEOUT_MS` |
| "SearXNG returned invalid JSON" | HTML returned instead of JSON | Verify JSON is enabled: `curl "http://localhost:8080/search?q=test&format=json"` |
| No results from Google | Google rate-limiting the instance | Use Brave/Bing instead, or wait and try again. Consider VPN. |
| Empty engine list | `/config` endpoint disabled | Unusual — check SearXNG settings |

## License

MIT
