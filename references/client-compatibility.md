# 客户端兼容性

| 客户端 | 推荐接入 | Token 过期处理 |
| --- | --- | --- |
| Codex | 禅道 MCP，或已登录 `zentao-cli` | MCP 连接级 401 可能由 `http_headers_helper` 恢复；普通工具结果中的 401 不保证自动重放。CLI 路径执行 `zentao login --web`。 |
| Claude | 禅道 MCP，或已登录 `zentao-cli` | MCP 在客户端支持的 HTTP 401/403 流程下可调用 `headersHelper`；无法确认时改用 CLI 登录。 |
| OpenCode | `zentao-cli` 本地 stdio MCP | Token 过期后执行 `zentao login` 并重连 MCP；当前不支持等价动态 Header Helper 自动续期。 |

## Codex

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "$HOME\.agents\skills\zentao-tools\setup.ps1"
```

```sh
node "$HOME/.agents/skills/zentao-tools/setup.mjs"
```

Windows 和 macOS 都只配置当前用户的 `zentao` MCP 条目。密码存入 DPAPI 或 Keychain。

## Claude

使用同一 `setup.ps1` 或 `setup.mjs` 并选择 Claude。配置写入 `headersHelper`，不在 MCP 配置中保存 Token。

帮助器必须在客户端超时限制内输出所需 JSON。服务端必须返回客户端可识别的认证状态；普通工具结果中的错误文本不保证触发重试。

## OpenCode

```sh
zentao login
opencode mcp add zentao-cli --global -- zentao mcp
opencode mcp list
```

OpenCode 通过 CLI 保存的 Profile 连接，不把 Token 写入 OpenCode 配置。Token 失效后重新登录并重连本地 MCP。

## 共同限制

Skill 不能修改 MCP 传输层、后台监控 Token 或强制客户端重放请求。遇到包装认证错误时，安全登录入口可以恢复认证，但原写入仍要先检查实际状态。

## 官方参考

- Codex MCP：https://learn.chatgpt.com/docs/extend/mcp?surface=cli
- Codex Skills：https://learn.chatgpt.com/docs/build-skills
- Claude MCP 认证：https://code.claude.com/docs/en/mcp
- Claude Skills：https://code.claude.com/docs/en/skills
- OpenCode MCP：https://opencode.ai/docs/mcp-servers
- ZenTao API V2 登录：https://www.zentao.net/book/api/post-users-login-2142.html
