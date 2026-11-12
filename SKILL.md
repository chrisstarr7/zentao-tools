---
name: zentao-tools
description: 管理禅道 MCP 或 CLI 认证，并查询、创建、更新、指派和完成禅道任务；用于登录失效恢复、团队任务规范、工时倒推和任务质量校验。
---

# 禅道工具

用于禅道认证、任务查询和任务写入。任务操作的权威规范是 [团队任务标准](references/team-task-standards.md)；本文件只规定统一入口、硬门槛和执行顺序。

## 执行优先级

1. 先读取当前客户端实际暴露的工具和字段，或执行 `zentao <命令> --help`。不得凭示例猜测工具名、字段或能力。
2. 任务查询和写入优先使用已登录的 `zentao-cli`（命令 `zentao`）。如果用户明确要求使用禅道 MCP，则使用当前 MCP 的实时 schema，并在同一数据源完成写后核验。
3. 创建、更新、完成、指派和失败恢复都遵循 [团队任务标准](references/team-task-standards.md)。工时和日期遵循 [工作日历](references/work-calendar.md)；身份匹配见 [任务与人员匹配](references/task-matching.md)。
4. 认证配置和异常边界见 [MCP 能力与失败处理](references/mcp-capabilities.md) 与 [客户端兼容性](references/client-compatibility.md)。

## 硬门槛

- 创建任务必须有用户明确给出的**预估工时**和**需求 ID**。缺少任一项时只询问缺口，不创建。
- 开发任务类型固定为 `devel`。负责人默认使用当前禅道登录账号；用户明确指定他人时才覆盖。
- 正式展示或写入任务前，描述必须通过安装目录下的 `scripts/zentao/task-quality.mjs description`，结果为真实 `5/5`。
- 正式展示或写入完成备注前，必须通过安装目录下的 `scripts/zentao/task-quality.mjs completion`，结果为真实 `5/5`。
- 任务描述写业务规则、处理流程、数据规则、异常和验收，不写类名、方法名、文件路径、包名或代码组织信息。
- 任务拆解按业务模块、独立交付和依赖关系判断。4 小时只用于评估工作量，不是机械拆分上限。
- 用户给出实际工时时，以当前北京时间向下对齐半小时后向前倒推，跳过午休和非工作时间；不得再询问起止时间。
- 创建和完成写入后必须重新读取，核验需求关联、指派人、状态、实际工时和完成备注。

## 认证与恢复

- API V2 登录会重新签发 Token，不是 OAuth refresh-token。
- Codex 的 `http_headers_helper` 和 Claude 的 `headersHelper` 只有在客户端收到可识别的连接级认证失败时才能提供新的请求头；Skill 不能监控 MCP 流量，也不能保证普通工具结果中的 `401` 会触发自动重放。
- 401、Token 过期或身份失效时，优先调用已配置的安全帮助器；CLI 路径执行 `zentao login --web`，无图形环境时使用 `zentao login --no-browser`。
- 登录成功后重新执行原只读操作。写操作必须先查询原任务状态，确认没有生效后才能重试。
- 403 按权限不足处理；429、5xx 和网络异常只对只读请求有限退避；超时或响应不明时先查状态，禁止重复创建或完成。
- 使用 [错误策略脚本](scripts/zentao/error-policy.mjs) 处理难以判断的认证、权限、重试和写入结果问题。

## 安全

- 不得在聊天、仓库、日志、命令行历史或明文客户端配置中写入密码和 Token。
- Windows 使用当前用户 DPAPI，macOS 使用 Keychain。上传帮助器复用同一凭据保护机制。
- 只向固定配置的 HTTPS 禅道地址发送凭据；停止意外重定向。
- 不读取或上传用户未指定的文件。附件上传失败时保留已创建任务，并分别报告任务和附件状态。
- 不通过破坏生产 Token、反复登录或操作真实任务来测试续期。

## 安装后的使用入口

- 配置脚本：Windows 使用 `setup.ps1`，macOS 使用 `setup.mjs`，不需要安装 PowerShell。
- 任务操作：先用只读命令确认身份、需求和任务状态，再按团队任务标准生成最终草稿。
- 任务质量检查：

```sh
node "$HOME/.agents/skills/zentao-tools/scripts/zentao/task-quality.mjs" description --file task.md --story 2796
node "$HOME/.agents/skills/zentao-tools/scripts/zentao/task-quality.mjs" completion --file completion.md
node "$HOME/.agents/skills/zentao-tools/scripts/zentao/task-policy.mjs" assignee --profile-account panglei
node "$HOME/.agents/skills/zentao-tools/scripts/zentao/work-calendar.mjs" --hours 2.5 --interval
```

退出码非零表示未达到写入门槛。根据 JSON 中的 `issues` 修正后重新检查，不得直接修改分数。
