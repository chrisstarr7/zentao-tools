# MCP Client Compatibility

Check current vendor documentation before configuration because client behavior can change. Distinguish the agent host that connects to MCP from the model provider that generates tool calls.

| Product | Role | Native relevant behavior | What that means for renewal |
|---|---|---|---|
| Codex | MCP client/agent host | Local Streamable HTTP MCP supports `http_headers_helper`. The current public configuration reference documents the helper setting but does not establish a retry guarantee for every version or gateway response. No helper for stdio or remote-executor connections. | Suitable for supplying fresh custom headers when Codex invokes the helper. Treat automatic retry as unverified until tested against the installed Codex version and the gateway's outer MCP HTTP response. The bundled ZenTao scripts support Windows and macOS. |
| Claude Code | MCP client/agent host | Supports OAuth with automatic refresh/reconnect/retry after an expired OAuth token. For custom headers, `headersHelper` runs on connect and after tool-call HTTP 401/403, then reconnects and retries once. It runs fresh (not cached) and has a 10-second timeout. | Suitable for custom token renewal via a fast local helper. Keep secrets in the operating system credential store rather than relying on environment variables that may be stripped for project/plugin scoped servers. Do not assume every MCP error reaches the helper; confirm the server returns the documented HTTP status. The bundled ZenTao scripts support Windows and macOS. |
| Claude Desktop / Claude web connectors | MCP client/agent host | Remote MCP connectors support authless and OAuth connections, configured through Claude's connector UI. The documented flow does not expose a local command-based header helper. | Use the service's compatible OAuth flow. The Claude Code `headersHelper` approach does not transfer to Claude Desktop/web connectors; custom ZenTao token renewal is not established through this UI. |
| OpenCode | MCP client/agent host | Remote MCP supports headers and OAuth. OpenCode can start OAuth when a server returns 401 and securely stores OAuth credentials. Header values can use environment-variable references. | Native automatic renewal is suitable when the server supports OAuth. The documented remote-header configuration does not provide an arbitrary command helper; custom API-key/login-token renewal needs an external refresh mechanism or adapter. |
| DeepSeek API | Model provider | Supports function/tool calls; the application must execute the selected function and return its result. Its Responses API documents function tools and says MCP tool types are ignored. | Use DeepSeek through an MCP-capable host such as OpenCode. That host owns MCP connections and credentials. DeepSeek API tool calling alone is not an MCP client or token refresh manager. |

## Host/provider examples

- **Codex + ZenTao:** run `setup.ps1` on Windows or `setup.mjs` on macOS, select Codex, and enter credentials in the local prompt/Keychain prompt. Windows stores the password with DPAPI; macOS uses Keychain. It configures the local `http_headers_helper`. The helper setting alone does not prove the installed Codex version will retry a tool call after an expired token; confirm using a mock gateway or supported test environment, not by expiring a production token.
- **Claude Code + ZenTao:** run `setup.ps1` on Windows or `setup.mjs` on macOS, select Claude Code, and enter credentials in the local prompt/Keychain prompt. Windows stores the password with DPAPI; macOS uses Keychain. It configures the HTTP MCP server's `headersHelper`. The helper must finish within Claude Code's 10-second timeout and print only the required JSON header object. Claude Code reruns it after a tool-call 401/403 and retries once; this does not prove ZenTao's gateway returns that status for an expired token.
- **OpenCode + OAuth MCP:** use OpenCode's built-in remote MCP OAuth flow if the server advertises and implements compatible OAuth endpoints. For a custom `token` header based on ZenTao API V2 login, environment substitution alone is not automatic renewal.
- **OpenCode + DeepSeek model + ZenTao MCP:** OpenCode remains the MCP host. DeepSeek supplies model responses/tool-call requests. OpenCode's documented MCP config has no custom command header helper for this ZenTao login flow; do not imply this Skill enables automatic API-token renewal there, and do not configure the DeepSeek API key as the ZenTao token.
- **Direct DeepSeek API integration:** the application must translate MCP tool definitions into DeepSeek function tools and dispatch calls itself. This is an application integration, not a DeepSeek MCP setting.

## Shared Skill installation

Codex and OpenCode discover shared Agent Skills under `~/.agents/skills`. Claude Code discovers personal Skills under `~/.claude/skills` and supports symlinked Skill folders. On Windows, a single canonical folder under `%USERPROFILE%\.agents\skills\zentao-tools` can be linked from `%USERPROFILE%\.claude\skills\zentao-tools` so these hosts use the same Skill and helper scripts. This Skill-folder integration applies to Claude Code; Claude Desktop's remote connectors are configured separately through its UI.

## Official references

- Codex MCP configuration: https://learn.chatgpt.com/docs/extend/mcp?surface=cli
- Codex Skills: https://learn.chatgpt.com/docs/build-skills
- Claude Code MCP authentication and `headersHelper`: https://code.claude.com/docs/en/mcp#authenticating-with-remote-mcp-servers
- Claude Code Skills: https://code.claude.com/docs/en/skills
- Claude Desktop remote MCP connectors: https://support.anthropic.com/en/articles/11503834-building-custom-connectors-via-remote-mcp-servers
- OpenCode MCP servers and OAuth: https://opencode.ai/docs/mcp-servers
- DeepSeek tool calls: https://api-docs.deepseek.com/guides/tool_calls
- DeepSeek Responses API tool support: https://api-docs.deepseek.com/guides/responses_api
- ZenTao API V2 login: https://www.zentao.net/book/api/post-users-login-2142.html
- ZenTao MCP setup: https://www.zentao.net/book/zentaopms/mcp-2536.html
