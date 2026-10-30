# ZenTao Tools

为 Codex、Claude Code 等客户端提供 ZenTao MCP 认证和自然语言任务工作流的 Skill。它复用当前客户端已有的 ZenTao MCP，不是新的 MCP 服务。

## 功能

- 指导为支持动态 Header Helper 的 MCP 客户端配置认证续期。
- 指导 Codex 查询、匹配、创建和完成禅道任务，并避免重复写入或虚构工时。
- 提供可配置工作日历的预计开始/完成日期与按班次、休息时间倒推的工时区间计算。
- 在当前 MCP 缺少附件上传时，可用平台原生脚本将明确指定的需求文档上传到已创建任务。
- 提供 Codex 和 Claude Code 的 ZenTao API V2 登录示例。
- 使用 Windows DPAPI 或 macOS Keychain 保存登录密码，不把密码写入 MCP 配置。

任务匹配和写入取决于当前 MCP 实际暴露的工具与字段。若无法可靠确认当前账号、需求/执行或任务状态，Skill 会列出候选或停止写入；创建任务时必须提供预计工时，除非用户配置了默认值。

## 支持范围

| 客户端或服务 | 支持情况 |
| --- | --- |
| Codex（Windows、macOS） | 支持 ZenTao Header Helper 配置 |
| Claude Code（Windows、macOS） | 支持 ZenTao Header Helper 配置 |
| OpenCode | 当前配置示例不支持命令型 Header Helper |
| DeepSeek API | 模型服务，不是 MCP 客户端；需通过支持 MCP 的客户端连接服务 |

ZenTao 示例使用固定的公司服务地址，不能直接用于其他 ZenTao 实例。其他 MCP 服务请先确认其认证方式、客户端重试行为和令牌签发规则，再按 Skill 指引配置。

## 环境要求

- Windows 或 macOS
- Node.js 18+、npm 和 Git
- Windows PowerShell 5.1（Windows）
- macOS 自带的 Keychain 与 `security` 命令（macOS；无需安装 PowerShell）
- Codex 或 Claude Code
- ZenTao 账号，并且该实例允许使用 API V2 登录

## 安装

```sh
npx -y skills add chrisstarr7/zentao-tools -g -a codex -y
```

macOS 和 Windows 使用同一条命令。它会将 Skill 安装到当前用户的 Codex；如需同时安装到 Claude Code，将 `-a codex` 改为 `-a codex claude-code`。安装后重启客户端或开启新会话。

Codex 会从用户级 Skill 目录自动发现本 Skill，相关任务会按需读取，不需要手动加载。ZenTao 连接仍需运行一次下面的配置脚本以安全保存账号凭据；安装过程不会自动读取或猜测账号密码。

从旧名称 `mcp-token-renewal` 或 `zentao-token-renewal` 升级时，请安装新名称后重新运行一次配置脚本，以更新客户端中的 helper 路径。已保存的 macOS Keychain 凭据会继续使用。

## 配置 ZenTao

运行对应平台的配置入口。

Windows：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "$HOME/.agents/skills/zentao-tools/setup.ps1"
```

macOS：

```powershell
node "$HOME/.agents/skills/zentao-tools/setup.mjs"
```

脚本会让你选择 Codex、Claude Code 或两者，检查客户端配置后，在本机提示输入禅道账号。Windows 使用隐藏密码提示并通过当前用户的 DPAPI 加密保存；macOS 使用系统 Keychain 密码提示保存密码，并由 Node.js helper 获取 token。写入前会备份已有配置；遇到不支持的配置格式或已有不同的 `zentao` 地址时会停止。

配置完成后重启所选客户端。不要在聊天中输入或发送账号密码。

## 验证

- Codex：运行 `codex mcp list`，确认 `zentao` 已加载；再执行只读查询确认工具可用。
- Claude Code：运行 `claude mcp list` 检查 MCP 配置，并在新会话中确认禅道工具可用。

验证时使用只读查询，不要通过生产写操作或手动让令牌过期来测试。

## 任务与附件

安装并配置后，可直接用自然语言要求 Codex 查询、创建或完成任务。创建请求应提供预计工时；如果需求、执行或目标任务有多个候选，Codex 会先展示候选。模板、匹配规则与完成前检查见 `references/`。

附件 helper 使用同一套 DPAPI/Keychain 凭据，不新增密码存储。它只接受明确提供的文档文件（当前本地上限 50 MiB），调用固定的公司 HTTPS 地址，不跟随重定向。ZenTao 官方文件 API 文档要求 v22+；公司实例的版本和权限需要单独验证。POST 成功与附件关联回读验证会分别报告。

## 续期行为与限制

ZenTao API V2 登录接口会重新登录并签发 API Token；这属于重新登录，不是 refresh-token 流程。客户端何时调用本地 Header Helper、是否重试，取决于客户端版本和服务端的 MCP 传输响应。上游 API 的 401 若被包装成普通工具文本，不等于 MCP 传输层 401，也不能据此声称自动恢复有效。Header Helper 不会在后台定时刷新令牌。

## 安全说明

ZenTao 示例将账号密码发送到固定的 HTTPS 登录地址：`https://pms.daoyoudao.com/api.php/v2/users/login`。使用前请确认这是你信任的禅道实例。脚本禁止自动跟随重定向，不会把密码或令牌写入仓库或 MCP 配置。

## 常见问题

- **配置脚本提示地址冲突：** 检查客户端现有的 `zentao` MCP 配置。脚本不会覆盖指向其他地址的条目。
- **登录失败：** 确认账号密码正确，并向禅道管理员确认 API V2 登录是否可用，以及账号是否需要验证码或多因素认证。
- **工具未加载：** 重启客户端，检查 MCP 配置中的服务地址，并确认客户端版本支持对应的 Header Helper。

## 更新与卸载

修改禅道密码后，再次运行配置脚本并输入新密码。

更新 Skill：

```powershell
npx skills update zentao-tools -g
```

卸载 Skill：

```powershell
npx skills remove zentao-tools -g -y
```

卸载不会删除客户端中的 MCP 配置或本机凭据。停止使用时，先恢复客户端配置备份，再运行下面的命令清除本机凭据。

Windows：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$HOME\.agents\skills\zentao-tools\scripts\zentao\remove-credentials.ps1"
```

macOS：

```powershell
node "$HOME/.agents/skills/zentao-tools/scripts/zentao/macos.mjs" remove
```

更多客户端认证细节见 [`references/client-compatibility.md`](references/client-compatibility.md)。

任务流程与已核对的 MCP 限制见 [`references/task-workflow.md`](references/task-workflow.md) 和 [`references/mcp-capabilities.md`](references/mcp-capabilities.md)。
