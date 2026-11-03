# ZenTao Tools

ZenTao 认证与任务工作流 Skill，支持 Codex、Claude 和 OpenCode。任务查询和写入依赖 `zentao-cli` Skill（命令 `zentao`）；本 Skill 提供团队任务规范，不包含 CLI。

## 环境要求

- Node.js 22.20 或更新版本、Git
- Windows：PowerShell 5.1
- macOS：系统自带的 Keychain 和 `security` 命令
- ZenTao 账号及允许使用 API V2 登录的实例
- 已安装并登录 `zentao-cli` Skill，命令 `zentao`（所有客户端的任务操作都需要）

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

OpenCode 通过 `zentao-cli` 登录并续期 Token。Token 过期后运行 `zentao login`，然后重连 MCP：

```sh
opencode mcp add zentao-cli --global -- zentao mcp
opencode mcp list
```

## 验证连接

- Codex：运行 `codex mcp list`，再执行只读查询。
- Claude：运行 `claude mcp list`，再在新会话中执行只读查询。
- OpenCode：运行 `opencode mcp list`，再执行只读查询。

不要通过真实任务写入或手动令 Token 过期来测试认证恢复。

## 任务工作流

任务操作包括拆解创建、更新、开始、完成和指派；所有禅道查询和写入必须通过 `zentao-cli`。操作前查阅当前版本的 CLI `--help`，缺少命令或字段时停止并说明。团队任务、确认、批量失败和工时规则见 [`references/team-task-standards.md`](references/team-task-standards.md)。
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

更多认证细节见 [`references/client-compatibility.md`](references/client-compatibility.md)，任务规范见 [`references/team-task-standards.md`](references/team-task-standards.md)。
