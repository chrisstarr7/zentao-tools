# ZenTao Tools

ZenTao MCP 认证与任务工作流 Skill，支持 Codex、Claude 和 OpenCode。它为客户端提供操作规范，不是独立 MCP 服务。

## 环境要求

- Node.js 22.20 或更新版本、Git
- Windows：PowerShell 5.1
- macOS：系统自带的 Keychain 和 `security` 命令
- ZenTao 账号及允许使用 API V2 登录的实例
- OpenCode：已安装并登录 `zentao-cli`

## 安装

```sh
npx -y skills add chrisstarr7/zentao-tools -g -a codex
```

`-g` 表示全局安装。此处以 Codex 为例；安装到其他客户端时，将 `-a` 后的 `codex` 替换为对应客户端标识。Windows 和 macOS 使用相同命令，安装后重启客户端或新建会话。

## 支持范围

Codex、Claude、OpenCode。

## 连接 ZenTao

本仓库配置脚本使用固定的公司 ZenTao 地址，不能直接用于其他实例。

### Codex 和 Claude

Windows：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "$HOME/.agents/skills/zentao-tools/setup.ps1"
```

macOS：

```sh
node "$HOME/.agents/skills/zentao-tools/setup.mjs"
```

按提示选择客户端并输入账号。Windows 使用当前用户 DPAPI 保存密码；macOS 使用 Keychain。配置脚本会备份现有设置，只修改 `zentao` MCP 条目；遇到不支持的配置格式或地址冲突时会停止。密码不会写入 MCP 配置。

### OpenCode

OpenCode 不支持本 Skill 使用的命令型 Header Helper。使用已登录的 `zentao-cli` 启动本地 stdio MCP：

```sh
opencode mcp add zentao-cli --global -- zentao mcp
opencode mcp list
```

MCP 进程读取 CLI 保存的 Profile，不需要把 Token 写入 OpenCode 配置。首次登录或 Token 过期时运行 `zentao login`，然后重连 MCP。避免使用会将 Token 写入客户端配置的接入方式。

## 验证连接

- Codex：运行 `codex mcp list`，再执行只读查询。
- Claude：运行 `claude mcp list`，再在新会话中执行只读查询。
- OpenCode：运行 `opencode mcp list`，再执行只读查询。

不要通过真实任务写入或手动令 Token 过期来测试认证恢复。

## 任务工作流

可用自然语言查询、创建、更新和完成禅道任务。创建任务必须提供预计工时和需求 ID；Skill 会通过当前 MCP 核实需求，并使用支持的原生字段写入。各客户端工具名和参数可能不同，操作前以当前 MCP Schema 为准。模板与限制见 [`references/`](references/)。

附件上传仅针对用户明确提供的需求文档。若当前 MCP 不支持上传，可使用随附脚本；脚本使用固定 HTTPS 地址，不跟随重定向，本地文件上限为 50 MiB。上传成功与禅道任务关联验证会分别报告。

## Token 与安全

ZenTao API V2 登录会重新签发 API Token，不是 OAuth refresh-token 流程。Header Helper 不会后台定时刷新；自动恢复取决于客户端是否调用 Helper、服务端是否返回客户端可处理的 MCP 认证状态，以及新 Token 是否有效。OpenCode 使用 CLI Profile，Token 过期时重新登录并重连。

不要在聊天、仓库或明文客户端配置中写入密码或 Token。示例登录地址为 `https://pms.daoyoudao.com/api.php/v2/users/login`，使用前请确认这是可信的禅道实例。

## 更新与卸载

更新：

```sh
npx skills update zentao-tools -g -y
```

卸载 Skill：

```sh
npx skills remove zentao-tools -g -y
```

卸载 Skill 不会删除 MCP 配置或本地凭据。若要清除凭据，请先恢复配置备份，再运行对应平台命令。

Windows：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$HOME\.agents\skills\zentao-tools\scripts\zentao\remove-credentials.ps1"
```

macOS：

```sh
node "$HOME/.agents/skills/zentao-tools/scripts/zentao/macos.mjs" remove
```

更多认证细节见 [`references/client-compatibility.md`](references/client-compatibility.md)，任务流程见 [`references/task-workflow.md`](references/task-workflow.md) 和 [`references/mcp-capabilities.md`](references/mcp-capabilities.md)。
