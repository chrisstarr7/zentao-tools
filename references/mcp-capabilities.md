# MCP 能力与失败处理

## 实时检查

任务工作流开始前检查当前 MCP 或 CLI 的真实 schema。至少需要读取需求、执行、任务详情，以及创建和完成任务的能力。字段名、类型和响应结构以当前服务为准。

如果使用 CLI，先运行对应 `--help`。如果使用 MCP，先检查实时工具列表和参数；不要把 Codex MCP 的名称直接套到 OpenCode 的本地 CLI MCP。

## 写入结果

创建或完成错误分为：

- 明确的业务失败：任务未创建或未完成。
- 认证失败：进入安全登录恢复。
- 权限失败：报告权限原因。
- 网络或服务异常：请求可能成功，也可能失败，结果不明确。

后两类写入必须先查询任务状态。创建结果不明时按需求、负责人、名称和近期时间查找；完成结果不明时读取状态、工时和备注。无法确认时停止，禁止盲目重试。

## 认证边界

Codex `http_headers_helper` 用于本地 HTTP MCP 提供动态请求头。客户端是否在 Token 过期后重新调用帮助器并重试，取决于客户端版本和外层 MCP HTTP 响应。普通 HTTP 200 工具结果中夹带的 `401` 不保证触发帮助器。

Claude `headersHelper` 只在客户端按文档把认证错误暴露给帮助器时生效。OpenCode 的 CLI MCP 不提供同等自动续期，需要 `zentao login` 后重连。

CLI 路径可使用：

```sh
zentao login --web
zentao login --no-browser
zentao profile --effective --format json
```

恢复后先做只读查询。写操作再按上面的“写入结果”重新检查状态。

## 错误策略命令

```sh
node "$HOME/.agents/skills/zentao-tools/scripts/zentao/error-policy.mjs" --status 401 --source tool-result --operation create
node "$HOME/.agents/skills/zentao-tools/scripts/zentao/error-policy.mjs" --status 403 --operation update
node "$HOME/.agents/skills/zentao-tools/scripts/zentao/error-policy.mjs" --status 504 --operation finish
```

策略会区分认证、权限、限流、服务端、网络、超时和业务错误，并标记是否允许登录、是否可重试、写入结果是否未知。
`--operation` 使用 `read`、`create`、`update`、`start`、`finish`、`upload` 或 `assign`；无法识别的操作按写入失败处理，要求先查状态。

## 附件上传

当前 MCP 缺少 multipart 上传时，可对用户明确指定的需求文档使用平台原生帮助器。上传是创建后的独立步骤；任务创建成功但上传失败时保留任务并分别报告。

Windows：

```powershell
& "$HOME\.agents\skills\zentao-tools\scripts\zentao\upload-attachment.ps1" -FilePath "<文档>" -TaskID <任务ID>
```

macOS：

```sh
node "$HOME/.agents/skills/zentao-tools/scripts/zentao/macos.mjs" upload "<文档>" <任务ID>
```

帮助器复用 DPAPI 或 Keychain 凭据，限制文件类型、任务 ID 和 50 MiB 本地安全上限；不得打印或记录密码和 Token。
