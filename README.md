# ZenTao Tools

禅道认证与任务工作流 Skill，支持 Codex、Claude 和 OpenCode。它提供安全登录恢复、任务查询、创建、指派、完成、工时倒推和质量门槛；任务写入依赖当前客户端的禅道 MCP 或已登录的 `zentao-cli`。

## 环境要求

- Node.js 22.20 或更新版本、Git
- Windows：PowerShell 5.1
- macOS：系统 Keychain 和 `security` 命令，不需要 PowerShell
- 可访问的禅道实例及账号
- 已安装并登录 `zentao-cli`，或已配置可用的禅道 MCP

## 安装

```sh
npx -y skills add chrisstarr7/zentao-tools -g -a codex
```

`-g` 表示全局安装。其他客户端替换 `-a` 后的标识即可，例如 `claude` 或 `opencode`。安装后重启客户端或新建会话。

支持范围：

- Codex：禅道 MCP 或 `zentao-cli`
- Claude：禅道 MCP 或 `zentao-cli`
- OpenCode：`zentao-cli` 本地 MCP，Token 过期时重新登录

## 连接禅道

配置脚本使用固定的公司禅道地址，不适用于其他实例。

Windows：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "$HOME\.agents\skills\zentao-tools\setup.ps1"
```

macOS：

```sh
node "$HOME/.agents/skills/zentao-tools/setup.mjs"
```

按提示选择客户端并输入账号。Windows 用当前用户 DPAPI 保存密码，macOS 用 Keychain 保存密码；密码不会写入 MCP 配置。脚本会先验证配置、备份现有文件，只修改 `zentao` 条目。

OpenCode 使用 `zentao-cli` 的本地 MCP：

```sh
opencode mcp add zentao-cli --global -- zentao mcp
opencode mcp list
```

Token 过期后执行 `zentao login`，然后重连 MCP。OpenCode 当前没有与 Codex、Claude 等价的动态 Header Helper 自动续期路径。

## 任务规则

- 创建任务必须同时提供预估工时和需求 ID。
- 负责人默认取当前禅道登录账号；用户明确指定时才改用其他人。
- 任务类型为开发，需求通过原生字段关联，不能只在描述里写 ID。
- 描述首次展示和正式写入前必须达到真实 5/5，且禁止代码类名、方法名、文件名、路径和包名。
- 完成记录必须包含完成状态、实际完成内容、实现过程、需求符合、验证结果和遗留问题，并达到真实 5/5。
- 完成写入后必须读取 `zentao task <id> --format raw`，核对最后一次完成动作、本次工时和累计工时变化。
- 用户提供实际工时时，从当前北京时间对齐半小时后倒推，自动扣除午休和非工作时间。
- 任务拆解按业务模块、独立交付、依赖和验收边界判断，不以固定工时机械拆成碎片任务。

完整规范见 [`references/team-task-standards.md`](references/team-task-standards.md)。

## 验证连接

- Codex：运行 `codex mcp list`，再执行只读任务查询。
- Claude：运行 `claude mcp list`，再在新会话中执行只读任务查询。
- OpenCode：运行 `opencode mcp list`，再执行只读任务查询。
- CLI：运行 `zentao profile --effective --format json`，并执行当前账号可访问的只读查询。

不要用真实任务写入或手动令生产 Token 过期来测试认证恢复。

## Token 与安全

ZenTao API V2 登录不是 OAuth refresh-token。自动恢复取决于客户端是否把认证失败暴露给 Header Helper、服务端返回的状态以及新 Token 是否有效。普通工具结果中包装的 `401` 不保证会触发客户端自动重放。

401 或 Token 过期时优先执行安全登录恢复；403 按权限不足处理；429、5xx 和网络异常只对只读请求有限重试；创建或完成超时后先查询实际状态，禁止盲目重复写入。

## 更新与卸载

更新：

```sh
npx skills update zentao-tools -g -y
```

卸载：

```sh
npx skills remove zentao-tools -g -y
```

卸载 Skill 不会删除 MCP 配置或本地凭据。清除凭据时使用对应平台脚本：

Windows：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "$HOME\.agents\skills\zentao-tools\scripts\zentao\remove-credentials.ps1"
```

macOS：

```sh
node "$HOME/.agents/skills/zentao-tools/scripts/zentao/macos.mjs" remove
```

认证细节见 [`references/client-compatibility.md`](references/client-compatibility.md)。
