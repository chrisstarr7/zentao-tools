# 任务与人员匹配

## 当前禅道账号

CLI 路径优先执行：

```sh
zentao profile --effective --format json
```

使用返回的 `account` 作为默认负责人。`profile` 能读取配置并不等于 Token 已在线验证；随后执行一次当前账号有权限的只读查询。

纯 MCP 路径优先使用实时 schema 中可信的当前用户接口。没有该接口时，只有能确认当前 MCP 使用本 Skill 的安全帮助器和同一固定服务地址，才可读取本地账号元数据。不得使用 Windows 用户名、Git 用户名或其他身份猜测禅道账号。

账号确定后直接默认指派，不再询问。只有账号无法读取、多个候选冲突或用户指定人员无法唯一识别时才询问。

Windows 账号元数据：

```powershell
& "$HOME\.agents\skills\zentao-tools\scripts\zentao\account.ps1"
```

macOS：

```sh
node "$HOME/.agents/skills/zentao-tools/scripts/zentao/macos.mjs" account
```

## 任务和需求

- 用户提供任务 ID 或需求 ID 时，先用准确 ID 读取，避免无目的全局搜索。
- 创建任务必须用原生字段关联用户指定需求，并确认返回详情中的关联 ID 一致。
- “指派给我”筛选不能单独证明 Token 身份；最终按返回的 `assignedTo` 和状态核验。
- 查询当前任务时只返回可访问、未删除且属于已确认账号的 `wait`、`doing` 任务；候选较多时让用户选择。
- 新任务查重比较需求、执行、负责人、业务范围、名称和未完成状态。
- 多个需求、执行或任务都合理时展示 3–5 个候选及匹配依据，不擅自选第一个。

## 重试

创建或完成结果不明时，先按任务 ID、需求、负责人、名称和近期时间查询。无法确认写入状态时停止并报告，不重复写。
