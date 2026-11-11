# 本地真实 Worker 压测环境

在 Veto 根目录执行：

```powershell
node tests/load/local/start.mjs --seats 100 --port 8787 --api-dir ../veto-api
```

需要 Node.js 22 或以上，以及已安装依赖的 `veto-api` 工作区。脚本直接使用其
`node_modules/wrangler/wrangler-dist/cli.js`，不安装工具、不改后端文件。默认后端路径
是与 Veto 同级的 `veto-api`，默认 2 席、8787 端口。

出现 `[local] READY http://127.0.0.1:8787/v1` 后，在其他终端运行主压测 runner，
基地址使用输出的完整 `/v1` 地址。启动进程需要保持运行；Ctrl+C 或输入 `q` 回车停止。
Windows 子进程使用隐藏窗口，停止时按本进程持有的 PID 终止其 Wrangler/workerd 子进程树。

```powershell
node tests/load/local/start.mjs --help
node tests/load/local/start.mjs --dry-run --seats 100 --port 8787
```

`--dry-run` 只检查只读后端路径并打印命令计划，不写文件、不启动 Worker。
未知选项、非法数值、端口占用会直接报错。`--seats 1` 会补足为 2 席；
最多 2000 席，超过 500 席的同类委员会自动拆分。

## 隔离范围

- 所有 Wrangler 命令显式指定 `--local --persist-to <绝对路径>/tests/load/local/.state`。
- 独立的 `.state/wrangler.json` 指向后端原始入口、别名与迁移目录，保留真实
  `DB`、`FILES`、`FILE_LIVE`、`ANALYTICS` 绑定名称与 Durable Object 类。
  D1 使用专用本地数据库标识，R2 使用专用本地桶名；后端绑定配置不作修改。
- Wrangler 工作目录、构建产物、CLI 日志、Worker 日志和数据库均位于 `.state`。
  不使用后端 `.wrangler` 或已有数据。
- 不加载后端 `.dev.vars` 或 `.env`；清除继承的 Cloudflare、SES、AWS 和 Wrangler
  配置变量，只传入本地 `ALLOWED_ORIGINS`。业务测试不需要邮件、统计查询或任何云端密钥。
- 运行真实本地 workerd 和本地 D1/R2/Durable Object 存储；所有 API、鉴权、
  SQL、R2 读写、WebSocket 和事件投递都执行后端代码，没有业务 mock。
- 没有 remote、deploy、删除或重置命令。每次启动新建一个组织者和大会，旧的隔离数据保留。
  本入口不负责真实邮件验证码、Cloudflare Analytics SQL 或生产性能测量。

同一 `.state` 只允许一个启动实例。异常强制终止可能留下 `.state/start.lock`；
先检查其中 PID 对应的进程已经退出，再删除这个锁文件。不要与仍运行的实例同时迁移。
`.state/ready.json` 仅为成功初始化记录，退出后不保证服务仍存活，runner 仍应检查健康。

## 初始化与输出

1. 对隔离 D1 应用后端全部迁移。
2. 只向隔离 D1 插入一个组织者账号。密码严格使用后端
   `src/lib/password.ts` 格式：PBKDF2 / SHA-256 / 100000 次 / 16 字节随机盐 /
   32 字节派生值，`pbkdf2$100000$<salt hex>$<hash hex>`。
3. 真实 `POST /auth/login`，创建大会，再 `PUT /conferences/:id/runtime`
   配置 Timeline，带真实版本 `If-Match` 激活大会。
4. 创建 MPC 和 IPC 委员会，为每个席位真实 `POST /veto/join/claim`；
   再对两个代表席位真实 authenticate，验证密码哈希与会话刷新。
5. 运行下述业务与 WS 验证，成功后才写凭据和 ready 记录。负载运行时可通过 Wrangler Local Explorer 查询实时 Worker request spans，以对齐客户端请求名、状态与服务端 wall/CPU 时间；本地模式只辅助归因，不能替代线上观测。

凭据文件为 `tests/load/fixtures/local.seats.json`，不提交到 Git：

```json
{
  "seats": [
    {
      "inviteCode": "由真实 API 生成",
      "password": "本次启动生成的随机密码",
      "seatId": "真实 canonical ID",
      "conferenceId": "真实 canonical ID",
      "committeeId": "来源委员会 ID",
      "targetCommitteeId": "另一类型委员会 ID",
      "expectedCapabilities": ["view_conference", "send_files", "review_files"]
    }
  ]
}
```

实际能力包含所有业务查看、文件发送/审核、新闻审核、指令提交/处理、
撤回及主席能力；MPC 另有 `draft_news`，IPC 另有 `publish_situation`、
`control_timeline`。fixture 交替排列 MPC、IPC，每席只出现一次。
上例能力列表是缩略示意，runner 应读取实际数组。

每 VU 使用独立席位。**再次 authenticate 会替换该席位旧 token**；并行场景不能共享
同一席位凭据反复登录。按能力筛选新闻起草与局势发布的席位，不要让所有 VU
无条件执行两种操作。处理指令必须由 `committeeId === directive.targetCommitteeId`
的席位执行；`targetCommitteeId` 不能写成 `ipc` 字符串或席位 ID。

## 已核对的真实接口契约

以下路径均相对基地址 `/v1`：

| 操作     | 请求与返回注意事项                                                                                                                                                                                                                                                         |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 登录     | `POST /veto/join/authenticate`，JSON `{inviteCode,password}`。返回 `token`、`identity`、顶层 `capabilities` 和 `wsUrl`。                                                                                                                                                   |
| 席位投影 | `GET /veto/committee/current`。主席投影位于 `/veto/chair/committee`，需 `control_conference`。                                                                                                                                                                             |
| 新闻提交 | MPC + `draft_news`，`POST /veto/news`，JSON `{source,title,content}`，必须 `Idempotency-Key`。无 Timeline 时还必须提供整数毫秒 `contentTime`；此入口已配置 Timeline。返回 `{news}`。                                                                                       |
| 新闻审核 | `GET /veto/news/workflow`；`POST /veto/news/:id/approve` 或 `/reject`，JSON `{note}`。拒绝必须有非空 note。                                                                                                                                                                |
| 指令     | `POST /veto/directives`，JSON `{title,content,targetCommitteeId}`，必须 `Idempotency-Key`。返回 `{directive}`。目标委员会处理者先 POST `/:id/claim`，再 POST `/:id/approve` 或 `/reject`，两种决定都要求 `{note}`。                                                        |
| 局势     | IPC + `publish_situation`，`POST /veto/situations`，JSON `{content}`。无 Timeline 时提供 `contentTime`；返回 `{situation}`。                                                                                                                                               |
| 文件上传 | `POST /veto/files`，body 是原始字节。必需 `Content-Type`、`X-File-Name`、`X-File-Title`、`X-File-Type`、`X-File-Size`，文本头使用 `encodeURIComponent`；字节数必须匹配，1 字节至 20 MiB。可选 `X-File-Visibility: committee/conference`。返回 `{file}`，初始 `submitted`。 |
| 文件审核 | `POST /veto/files/:id/approve`，JSON `{note,visibility}`；可缩小范围，不能扩大原申请。`/reject` 要求 `{note}`。                                                                                                                                                            |
| 文件下载 | `GET /veto/files/:id/download` 返回原始字节。发布前仅审核者能下载；发布后按 visibility 控制。                                                                                                                                                                              |
| Timeline | `GET /veto/timeline`；IPC 控制者 `PATCH /veto/timeline`，`{action:"resume"/"pause"}`、`{action:"set_ratio",ratio}` 或 `{action:"jump",contentTime}`。                                                                                                                      |
| WS       | 使用认证响应 `wsUrl`。子协议 `["veto","token."+token,"live.v1"]`，服务端协商 `veto` 并发送 `{"type":"ready"}`。无 `live.v1` 不发 ready。`ping` 文本得到 `pong`；实时刷新是 `{"type":"invalidate","topics":[...]}`，文件通知另为 `{id,fileId,kind,createdAt}`。             |

`wsUrl` 由后端 `src/routes/join/helpers.ts` 从实际 HTTP 请求 URL 构造。本入口固定
loopback IP 和 HTTP 协议，并在冒烟中断言返回 host/port、路径及 WS 协议，未在 fixture 中猜测地址。

## 自动冒烟的实际覆盖

每次成功 READY 都已通过：

- 全量迁移、组织者密码登录、大会创建/Timeline 配置/激活、所有席位 claim 与能力核对；
- 两种席位重新认证；真实 WS 101 握手、`veto` 协商、ready、ping/pong、
  新闻提交后收到 `news` invalidate；
- 委员会投影，Timeline 查看与恢复/暂停；
- 新闻提交、审核发布、列表确认；跨委员会指令提交、认领、批准；
- IPC 局势发布、MPC 列表读取；
- 真实 R2 上传、审核、跨委员会 conference 可视范围下载并逐字节比对，以及持久通知查询。

冒烟会留下已发布新闻、局势和文件，以及一条已批准指令。这些都是本次新大会的隔离内容，
runner 不应假设列表最初为空。默认 Timeline 验证后暂停；内容仍能正常发布。
这不是 k6 负载结果，主 runner 负责并发、争抢、负向分支和性能统计。
