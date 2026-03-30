# Claude Code Provider Auto-Switcher — Design Spec

**Date:** 2026-03-30
**Project:** cc-auto-switcher

---

## Overview

A Node.js CLI tool that automatically and manually switches Claude Code's active provider based on token quota usage. Supports Anthropic official API, Amazon Bedrock, OpenRouter, and OpenAI-compatible endpoints.

---

## Architecture

```
cc-auto-switcher/
├── src/
│   ├── cli.js          # Entry point, command parsing
│   ├── switcher.js     # Core: read/write ~/.claude.json, execute switch
│   ├── tracker.js      # Token usage tracking: read/write ~/.cc-switcher/usage.json
│   ├── providers.js    # Provider definitions and config schemas
│   └── config.js       # Read/write ~/.cc-switcher/config.json
├── hooks/
│   └── post-tool.sh    # CC post-tool hook, calls cc-switcher auto-check
└── package.json
```

### State Files

| File | Purpose |
|------|---------|
| `~/.cc-switcher/config.json` | All provider credentials, quota limits, priority order |
| `~/.cc-switcher/usage.json` | Per-provider monthly token usage counters |

---

## Data Flow

```
CC makes API request
    → post-tool hook fires
        → cc-switcher auto-check --usage <json> [--error <code>]
            → tracker.js accumulates token usage
            → check current provider remaining quota
            → if exhausted → switcher.js selects next available provider
                           → writes new config to ~/.claude.json

Manual:
cc-switcher use <provider>   → switcher.js switches immediately
cc-switcher status           → tracker.js reads usage, renders table
cc-switcher config set ...   → config.js writes credentials
```

---

## Provider Configuration

### `~/.cc-switcher/config.json`

```json
{
  "activeProvider": "anthropic",
  "priority": ["anthropic", "bedrock", "openrouter", "openai"],
  "providers": {
    "anthropic": {
      "apiKey": "sk-ant-...",
      "monthlyTokenLimit": 1000000,
      "warningThreshold": 0.9
    },
    "bedrock": {
      "awsProfile": "default",
      "awsRegion": "us-east-1",
      "monthlyTokenLimit": 5000000,
      "warningThreshold": 0.9
    },
    "openrouter": {
      "apiKey": "sk-or-...",
      "baseUrl": "https://openrouter.ai/api/v1",
      "monthlyTokenLimit": 2000000,
      "warningThreshold": 0.9
    },
    "openai": {
      "apiKey": "sk-...",
      "baseUrl": "https://api.openai.com/v1",
      "monthlyTokenLimit": 500000,
      "warningThreshold": 0.9
    }
  }
}
```

---

## Switching Logic (`switcher.js`)

Every switch updates both `~/.claude.json` (active credentials) and `config.json`'s `activeProvider` field (persistent state). Each provider requires different fields written to `~/.claude.json`:

| Provider | Fields written to `~/.claude.json` |
|----------|-------------------------------------|
| anthropic | `apiKey`, clear `apiBaseUrl`, clear Bedrock/Vertex flags |
| bedrock | `useBedrock: true`, AWS profile/region, clear `apiKey` |
| openrouter | `apiKey`, `apiBaseUrl` = OpenRouter base URL |
| openai | `apiKey`, `apiBaseUrl` = OpenAI base URL |

**Auto-switch selection:** Iterate `priority` array, skip providers where `usedTokens / monthlyTokenLimit >= warningThreshold`, select first available. If all exhausted, keep current provider and print warning.

**Error fallback:** If `auto-check` receives a rate-limit / quota-exceeded error code, trigger immediate switch regardless of local usage estimates.

---

## Token Usage Tracking

### `~/.cc-switcher/usage.json`

```json
{
  "month": "2026-03",
  "providers": {
    "anthropic":  { "inputTokens": 450000, "outputTokens": 120000 },
    "bedrock":    { "inputTokens": 0,      "outputTokens": 0 },
    "openrouter": { "inputTokens": 80000,  "outputTokens": 20000 },
    "openai":     { "inputTokens": 0,      "outputTokens": 0 }
  }
}
```

- Resets automatically when the calendar month changes.
- Token counts parsed from CC post-tool hook response: `usage.input_tokens` + `usage.output_tokens`.
- Total tokens = `inputTokens + outputTokens` compared against `monthlyTokenLimit`.

---

## CLI Commands

| Command | Description |
|---------|-------------|
| `cc-switcher use <provider>` | Manually switch to specified provider |
| `cc-switcher status` | Show all providers: usage, remaining quota, active indicator |
| `cc-switcher config set <provider> <key> <value>` | Set a provider config value |
| `cc-switcher config init` | Interactive setup wizard |
| `cc-switcher auto-check [--usage <json>] [--error <code>]` | Called by hook; checks quota and switches if needed |
| `cc-switcher install-hooks` | Write hooks into CC's settings.json automatically |

### `status` Output Example

```
Provider      Used        Limit       %      Status
─────────────────────────────────────────────────────
● anthropic   570k tok    1,000k      57%    active
  bedrock     0 tok       5,000k       0%    available
  openrouter  100k tok    2,000k       5%    available
  openai      0 tok       500k         0%    available
```

---

## Hook Integration

`cc-switcher auto-check` reads the hook payload from stdin directly (Claude Code pipes JSON to hooks via stdin). No wrapper shell script is needed.

`install-hooks` command adds the following to `~/.claude/settings.json`:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "",
        "hooks": [{ "type": "command", "command": "cc-switcher auto-check" }]
      }
    ]
  }
}
```

The `auto-check` command parses `usage.input_tokens` and `usage.output_tokens` from the stdin JSON payload, and inspects any error fields for rate-limit / quota-exceeded codes.

---

## Error Handling

- **File I/O errors** on `~/.claude.json` or `~/.cc-switcher/`: log and abort switch (do not corrupt existing config).
- **Missing provider config**: warn user to run `cc-switcher config init`.
- **All providers exhausted**: warn, stay on current provider, do not crash CC.
- **Invalid `--usage` JSON** in hook: skip usage update, proceed without switching.

---

## Out of Scope

- Real-time quota queries against provider APIs (Anthropic Console API, AWS Cost Explorer)
- Multi-model switching within a single provider
- GUI / web dashboard
