# cc-auto-switcher

> Auto-switch Claude Code's provider based on monthly token quota.

[中文文档](README.zh.md)

---

Automatically switches between **Anthropic API**, **Amazon Bedrock**, **OpenRouter**, and **OpenAI-compatible** endpoints when your token quota runs low — no manual intervention needed. Also provides a full CLI for manual control, status inspection, and configuration.

## How it works

A Claude Code `PostToolUse` hook calls `cc-switcher auto-check` after every tool invocation. The command reads the token usage from the hook payload, updates a local monthly counter, and switches to the next available provider when the current one is near exhaustion (configurable threshold, default 90%). If a quota-exceeded error is returned by the API, switching is triggered immediately regardless of the local counter.

All provider credentials and usage state are stored in `~/.cc-switcher/`. The active provider is applied by writing the appropriate fields to `~/.claude.json`, which Claude Code reads on every invocation.

## Requirements

- Node.js 18+
- Claude Code CLI

## Installation

```bash
git clone <repo-url>
cd cc-auto-switcher
npm install
npm link          # installs cc-switcher as a global command
```

## Setup

### 1. Configure providers

Run the interactive wizard:

```bash
cc-switcher config init
```

Or set values individually:

```bash
cc-switcher config set anthropic apiKey sk-ant-...
cc-switcher config set anthropic monthlyTokenLimit 1000000

cc-switcher config set bedrock awsProfile default
cc-switcher config set bedrock awsRegion us-east-1
cc-switcher config set bedrock monthlyTokenLimit 5000000

cc-switcher config set openrouter apiKey sk-or-...
cc-switcher config set openrouter monthlyTokenLimit 2000000

cc-switcher config set openai apiKey sk-...
cc-switcher config set openai monthlyTokenLimit 500000
```

### 2. Install the hook

```bash
cc-switcher install-hooks
```

This adds a `PostToolUse` hook to `~/.claude/settings.json` that calls `cc-switcher auto-check` after every Claude Code tool use.

### 3. Verify

```bash
cc-switcher status
```

## Commands

| Command | Description |
|---------|-------------|
| `cc-switcher use <provider>` | Manually switch to a provider |
| `cc-switcher status` | Show all providers with usage, quota, and status |
| `cc-switcher config set <provider> <key> <value>` | Set a provider config value |
| `cc-switcher config init` | Interactive setup wizard |
| `cc-switcher auto-check` | Check quota and auto-switch (called by hook) |
| `cc-switcher install-hooks` | Install PostToolUse hook in Claude Code |

**Supported providers:** `anthropic`, `bedrock`, `openrouter`, `openai`

## Status output

```
Provider      Used        Limit       %      Status
────────────────────────────────────────────────────────────
● anthropic   570k tok    1,000k      57%    active
  bedrock     0 tok       5,000k       0%    available
  openrouter  100k tok    2,000k       5%    available
  openai      0 tok       500k         0%    available

Month: 2026-03
```

## Configuration files

| File | Description |
|------|-------------|
| `~/.cc-switcher/config.json` | Provider credentials, quota limits, priority order |
| `~/.cc-switcher/usage.json` | Monthly token usage counters (auto-resets each month) |

### Provider priority

Providers are tried in the order defined in `config.json`'s `priority` array (default: `anthropic → bedrock → openrouter → openai`). To change the order, edit the file directly:

```json
{
  "priority": ["bedrock", "anthropic", "openrouter", "openai"]
}
```

### Warning threshold

Each provider has a `warningThreshold` (default `0.9`). Auto-switching triggers when `used / limit >= threshold`. To adjust per-provider:

```bash
cc-switcher config set anthropic warningThreshold 0.8
```

## Development

```bash
npm test          # run all 30 unit tests
```

## License

MIT
