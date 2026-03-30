# cc-auto-switcher

> 基于月度 Token 额度自动切换 Claude Code 的 Provider。

[English Documentation](README.md)

---

当当前 Provider 的 Token 额度接近耗尽时，自动切换到 **Anthropic 官方 API**、**Amazon Bedrock**、**OpenRouter** 或 **OpenAI 兼容接口**，无需手动干预。同时提供完整的 CLI 用于手动切换、状态查看和配置管理。

## 工作原理

Claude Code 的 `PostToolUse` Hook 在每次工具调用后触发 `cc-switcher auto-check`。该命令从 Hook 的响应载荷中读取 Token 用量，更新本地月度计数器，并在当前 Provider 接近额度上限时（可配置阈值，默认 90%）自动切换到下一个可用 Provider。若 API 返回额度超限错误，无论本地计数器状态如何，都会立即触发切换。

所有 Provider 凭据和用量数据存储在 `~/.cc-switcher/` 目录。切换时，工具将对应 Provider 的配置写入 `~/.claude.json`，Claude Code 每次启动时都会读取该文件。

## 环境要求

- Node.js 18+
- Claude Code CLI

## 安装

```bash
git clone <repo-url>
cd cc-auto-switcher
npm install
npm link          # 将 cc-switcher 安装为全局命令
```

## 快速上手

### 第一步：配置 Provider

运行交互式向导：

```bash
cc-switcher config init
```

或逐项配置：

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

### 第二步：安装 Hook

```bash
cc-switcher install-hooks
```

此命令将在 `~/.claude/settings.json` 中添加一个 `PostToolUse` Hook，使 Claude Code 在每次工具调用后自动执行 `cc-switcher auto-check`。

### 第三步：验证配置

```bash
cc-switcher status
```

## 命令说明

| 命令 | 说明 |
|------|------|
| `cc-switcher use <provider>` | 手动切换到指定 Provider |
| `cc-switcher status` | 显示所有 Provider 的用量、额度和状态 |
| `cc-switcher config set <provider> <key> <value>` | 设置 Provider 的配置项 |
| `cc-switcher config init` | 启动交互式配置向导 |
| `cc-switcher auto-check` | 检查额度并按需自动切换（由 Hook 调用） |
| `cc-switcher install-hooks` | 将 PostToolUse Hook 写入 Claude Code 配置 |

**支持的 Provider：** `anthropic`、`bedrock`、`openrouter`、`openai`

## status 输出示例

```
Provider      Used        Limit       %      Status
────────────────────────────────────────────────────────────
● anthropic   570k tok    1,000k      57%    active
  bedrock     0 tok       5,000k       0%    available
  openrouter  100k tok    2,000k       5%    available
  openai      0 tok       500k         0%    available

Month: 2026-03
```

## 配置文件说明

| 文件 | 说明 |
|------|------|
| `~/.cc-switcher/config.json` | Provider 凭据、额度上限、优先级顺序 |
| `~/.cc-switcher/usage.json` | 月度 Token 用量计数（每月自动重置） |

### Provider 优先级

切换时按 `config.json` 中 `priority` 数组的顺序依次尝试（默认：`anthropic → bedrock → openrouter → openai`）。如需调整顺序，直接编辑该文件：

```json
{
  "priority": ["bedrock", "anthropic", "openrouter", "openai"]
}
```

### 切换阈值

每个 Provider 有独立的 `warningThreshold`（默认 `0.9`，即 90%）。当 `已用量 / 月度上限 >= 阈值` 时触发自动切换。按需调整：

```bash
cc-switcher config set anthropic warningThreshold 0.8
```

## 开发

```bash
npm test          # 运行全部 30 个单元测试
```

## License

MIT
