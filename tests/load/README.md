# Veto 压力测试

本套件使用 **k6 v2.3.0 + TypeScript**，对现有 HTTP API、原生 WebSocket 通知和真实文件字节发压。
本地联调使用同级 `veto-api` 的真实 Worker、D1、R2 和 Durable Object；没有业务 mock，不接入 KV。
本地验证和 Cloudflare 验收是两项独立结果，任何本地通过都不能替代真实 Cloudflare 部署的测试。

## 300 人会议的 500 人验收

本次会议以 **至少 500 个独立席位同时在线**为验收规模，比预计 300 人多 200 人（约 67%）。
使用以下两个专用 profile；smoke 和原有小规模探索配置不能代替此次验收：

| profile          | 同时在线要求                        | 业务压力                                                                                      |
| ---------------- | ----------------------------------- | --------------------------------------------------------------------------------------------- |
| `conference-500` | 同一大会 500 席共同连续在线 30 分钟 | 混合业务；每第 5 席只观察/审核，400 席各上传一个文件，其余时间每 30 秒尝试业务操作            |
| `files-500`      | 同一大会 500 席共同连续在线 10 分钟 | 500 席在共同开始时间各提交 4 文件，合计 2,000 文件，每席最多 2 个上传在途；发布后逐个下载校验 |

两者默认分 10 批、用 180 秒建连，随后留 120 秒准备，才开始共同窗口。
每个席位必须在共同窗口开始时已收到 WS ready，并完整覆盖同一个绝对时间区间；
迟到、短暂掉线后恢复、提前退出都使该席位失败，`online_window_seats` 必须等于计划人数，
`online_window_ok` 必须为 100%，完整会话数也必须等于计划人数。不会将累计连接数作为并发证明。
凭据必须为同一 `conferenceId`，每席提供唯一 `seatId`；认证时还会与服务端身份比对。
500 人 profile 禁止将人数降到 500 以下，缩短试跑必须同时显式调整 duration 与 online-window。

先准备本地 500 席：

```powershell
pnpm test:load:local --seats 500 --port 8797
```

另一个终端先做 60 秒在线试跑，再执行默认的完整混合业务：

```powershell
pnpm test:load --profile conference-500 --scenario browse `
  --target http://127.0.0.1:8797/v1 --credentials tests/load/fixtures/local.seats.json `
  --duration 60s --online-window 60s

pnpm test:load --profile conference-500 `
  --target http://127.0.0.1:8797/v1 --credentials tests/load/fixtures/local.seats.json
```

Cloudflare 正式验收必须使用实际已部署的测试服务和至少 500 个独立测试席位，依次运行：

```powershell
pnpm test:load --profile conference-500 `
  --environment cloudflare --target https://YOUR-TEST-API.example.com/v1 `
  --credentials tests/load/fixtures/cloudflare.seats.json --revision DEPLOYMENT-VERSION

pnpm test:load --profile files-500 `
  --environment cloudflare --target https://YOUR-TEST-API.example.com/v1 `
  --credentials tests/load/fixtures/cloudflare.seats.json --revision DEPLOYMENT-VERSION
```

文件压力默认交替 64KiB/1MiB，2,000 文件约 1.04GiB 上传，另有相同数量的下载字节。
最多 1,000 个上传在途是计划上限，实际峰值取决于接口和网络；500 在线检查不等同于证明上传峰值达到 1,000。
20MiB 大文件另由 `files-burst` 覆盖，可显式修改 `--file-sizes` 做专项测试，注意发压端内存和带宽。
`online-window.json` 记录共同窗口起止毫秒时间戳、计划人数和完成窗口人数。
真实大会的角色、委员会分布和操作频率应由测试凭据与覆盖配置复现；本地种子席位权限较广，读取和审核负载较重。

## 安装与检查

需要 Node.js 22+、项目依赖，以及 k6 v2.3.0：

```powershell
pnpm install
node tests/load/install-k6.mjs
pnpm typecheck:load
pnpm test -- tests/load/lib
```

安装入口下载 Grafana 官方固定版本并校验发布页的 SHA-256，二进制放在被 Git 忽略的 `.tools/`。
也可以自行安装相同版本，通过 `--k6 /absolute/path/to/k6` 指定。
不在运行时下载 JavaScript 依赖，也不需要 Grafana Cloud 账号。

## 本地真实服务联调

在第一个终端启动测试服务，保持运行：

```powershell
pnpm test:load:local --seats 4 --port 8797
```

等待 `[local] READY`。入口自动应用迁移，创建独立测试账号、大会、委员会和已认领席位，
并验证正向业务与 WS 协议。账号和数据仅进入 `tests/load/local/.state/`，
不修改后端工作区、不加载其密钥、不连接云端资源。
详细隔离机制与接口依据见 [local/README.md](local/README.md)。

在第二个终端运行：

```powershell
pnpm test:load --profile smoke --scenario mixed `
  --environment local --target http://127.0.0.1:8797/v1 `
  --credentials tests/load/fixtures/local.seats.json
```

默认 smoke 为 2 席；如果增加 `--vus`，凭据数量必须足够。再次登录同一席位会替换旧 token，
因此不同并行运行必须使用互不重叠的席位。退出本地环境可在第一个终端输入 `q` 后回车。
不要对共享的后端开发数据库运行清空或重置命令。

## Cloudflare 上的验收

k6 在本机或独立发压服务器运行，请求**已部署的 Cloudflare HTTPS/WSS 入口**；
不把 k6 部署进 Worker。

1. 准备配置与目标部署一致的 Cloudflare 测试服务，以及独立测试大会、委员会和已认领席位。
2. 根据 `fixtures/seats.example.json` 填写真实凭据，保存为 `fixtures/cloudflare.seats.json`。
   邀请码、密码、席位 ID、委员会和能力必须对应；目标大会应为 active，文件保存期限有效。
3. 从小流量 smoke 开始，确认真实认证、子协议协商、通知、文件审核及下载通过。
4. 再执行所需负载 profile，并对照同一时间窗口的 Cloudflare Metrics/Logs。
5. 记录部署版本、套餐与资源配置、发压机器/地点、带宽、开始结束时间、阈值和实际失败分类。

示例中的域名必须替换为实际测试入口，套件没有默认生产目标：

```powershell
pnpm test:load --profile smoke --scenario mixed `
  --environment cloudflare --target https://YOUR-TEST-API.example.com/v1 `
  --credentials tests/load/fixtures/cloudflare.seats.json --revision DEPLOYMENT-VERSION `
  --dry-run
```

移除 `--dry-run` 后才会发送请求。`--environment cloudflare` 要求 HTTPS，
认证返回的 WS 必须使用 WSS，且主机必须匹配目标或 `--ws-allowed-hosts` 中明确允许的主机。
`dry-run` 不认证席位，不验证服务在线，也不证明云端兼容性。

云端重点核对 Worker 的请求/CPU/错误，D1 查询与错误，R2 请求/上传/下载，
Durable Object 请求、WS 连接与错误，以及自定义域名入口的拦截/限流。
客户端观测到的 `413`、`429`、5xx 和资源超限会分类；KV 不在测试范围。
大文件发压要同时记录发压端 CPU、内存和上行带宽，以区分发压端瓶颈。

所有报告的 `cloudflareVerified` 初始均为 `false`：单凭 k6 退出码不足以证明部署配置和云端资源达标。
真实部署测试通过后仍须结合上述云端证据作验收结论，不能修改一个布尔值代替验证。
本套件不会自动创建远程组织者、大会或修改部署，也不会读取开发目录中的云端账号密钥。

## 场景和负载配置

`--scenario` 决定用户操作，`--profile` 决定规模、时长、文件大小和初始阈值，二者独立：

| 场景        | 操作与正确性检查                                                                                                         |
| ----------- | ------------------------------------------------------------------------------------------------------------------------ |
| `browse`    | 认证、WS 就绪、按能力读取新闻/指令/局势/文件/Timeline，持续心跳与通知刷新。                                              |
| `mixed`     | 上传文件并验证发布下载；按能力提交新闻、向真实目标委员会提交指令、发布局势；审核者处理本次运行的队列；作者检查最终状态。 |
| `files`     | 在共同开始时间后上传指定数量的真实二进制文件，支持同席位并发；并行审核、通知刷新、记录校验和发布后 SHA-256 下载校验。    |
| `reconnect` | 就绪后主动断开客户端 WS，按退避和抖动重新连接，验证再次 ready 与刷新；不等同于服务端宕机、网络分区或重新部署测试。       |
| `display`   | 连接真实 Chair 的独立本地 WS，每 VU 一组隔离委员会标签，检查投影转发；不需要席位凭据，不启动 Electron，也不衡量渲染。    |

`mixed` 和 `files` 需要 `send_files`、`view_files` 的业务席位和 `review_files` 审核席位配合。
`--observer-every N` 可让每第 N 席只观察/审核而不上传或创建内容，其余业务席位必须有发送能力。
新闻需要 MPC 起草者和新闻审核者，指令需要接收 Committee 中的处理者，
局势发布需要相应 IPC 席位。套件以认证返回的真实 Capability 决定操作，
`expectedCapabilities` 用于防止测试数据权限配置错误。
缺少某类角色时不能宣称覆盖该工作流；报告中通过操作子指标查看实际样本。

| profile          | 默认席位 | 持续时间 | 用途                                                  |
| ---------------- | -------: | -------: | ----------------------------------------------------- |
| `smoke`          |        2 |      60s | 正向业务与协议验证                                    |
| `load`           |       50 |    10min | 分批建连后保持业务负载                                |
| `stress`         |      200 |    15min | 较高并发探索，结合错误与资源指标定位上限              |
| `soak`           |       30 |       2h | 持续运行与长连接稳定性                                |
| `spike`          |      150 |     3min | 同时开始建连的突发流量                                |
| `files-burst`    |       50 |     5min | 每业务席位 4 文件、并发 2，混合 64KiB/1MiB/5MiB/20MiB |
| `conference-500` |      500 |    30min | 本次会议验收：共同持续在线窗口、混合业务              |
| `files-500`      |      500 |    10min | 本次会议集中提交验收：2,000 个文件、共同持续在线窗口  |

准确值以 `config/*.json` 为准。默认值是实验起点，不表示 Veto 已能承载相应规模。
每个 VU 只运行一次完整会话；爬坡通过延迟真实认证与建连实现。
`vus` 指已分配的 k6 VU，不等于当时全部连接已就绪；`rampSteps` 大于 1 时按批次建连。
500 人专用 profile 额外通过 `online_window_seats` 和 `online_window_ok` 检查共同在线窗口。
持续时间控制常规操作窗口，文件验证和审核排空会延长实际运行；报告记录实际耗时。
套件不在阶梯结束时强制杀掉上传；不同峰值应分别运行，保留各自报告。

集中提交示例（需要至少 100 个有效席位）：

```powershell
pnpm test:load --profile files-burst --scenario files `
  --environment cloudflare --target https://YOUR-TEST-API.example.com/v1 `
  --credentials tests/load/fixtures/cloudflare.seats.json `
  --vus 100 --files-per-vu 10 --upload-concurrency 2
```

这是最多 1,000 个文件、最多 200 个同时上传的请求，实际并发取决于建连、网络和接口耗时。
它不是一次 HTTP 请求提交 1,000 个文件：当前客户端与后端均为每请求一个文件。
`startDelaySeconds` 是爬坡后留给认证的准备时间，使用共同绝对开始时间；
认证过慢的用户会迟到，不伪装成准确同步发压。
文件有 20MiB 业务上限；该限制来自当前真实接口。不同尺寸 payload 每 VU 保留一份，
应结合 `vus × 文件尺寸总和 + 进行中的下载` 估算发压机器内存。

单席连续上传使用 `--vus 1 --upload-concurrency 1`，但必须有独立审核流程或该席位有审核能力；
单席接口并发则提高 `--upload-concurrency`，该行为超过当前 UI 单文件提交方式，报告需注明。

覆盖配置示例：

```json
{
  "rampSteps": 5,
  "observerEvery": 5,
  "fileSizesBytes": [65536, 1048576],
  "thresholds": {
    "httpP95Ms": 2000,
    "uploadP95Ms": 10000,
    "visibleP95Ms": 15000,
    "errorRate": 0.01
  }
}
```

保存到自己的 JSON，通过 `--config PATH` 使用。优先级为默认值 < profile < JSON 配置 < CLI。
所有参数、单位和取值见 `pnpm test:load --help`。

## 指标、计时与报告

每次运行产生独立 `results/<run-id>/`：

- `metadata.json`：脱敏目标、配置、k6/Git/Node/OS 版本、进程结果、诊断分类。
- `summary.json`：k6 聚合统计与阈值结果。
- `report.md`：可阅读的指标和通过情况。
- `events.log`：受限、脱敏、数量有界的业务诊断；不会持久化原始 k6 内部日志。
- `online-window.json`：启用共同在线窗口时输出，记录同一窗口的起止时间和完整覆盖人数。

Git revision 是运行时工作区 HEAD，不能代表未提交改动已包含在该提交中；云端部署版本另由 `--revision` 标注。
报告不保存密码、邀请码、token、原始响应或原始请求头。
读写使用稳定操作名，排除 URL 指标标签，避免凭据泄漏和资源 ID 产生大量时间序列。

文件场景要求**成功上传数和校验下载数达到计划值**，且每个会话至少收到通知，
防止只有少量成功样本时整个场景误报通过。
所有场景还要求完整执行的 iteration 数等于计划 VU 数；被强制截断的会话不能因其他会话成功而通过。
下载验证使用实际二进制 SHA-256，还核对文件来源、标题、大小和重复 ID。
当前文件列表最多返回 200 条，套件给测试文件类型附加本次运行、席位和每 100 文件一组的后缀，
并通过真实 `fileType` 查询校验所有组；常规页面刷新仍读取未筛选列表。
因此大批量完整性校验不会把列表截断误判为对象丢失，也不宣称客户端未筛选列表能展示全部文件。
并发审核的预期 `409` 单独计数，并由作者最终状态验证；其他 HTTP 错误和响应契约错误会失败。
上传不自动重试，因为当前上传接口没有幂等重试契约，网络失败可能意味着服务端已创建文件。

| 指标                                                      | 含义                                                                 |
| --------------------------------------------------------- | -------------------------------------------------------------------- |
| `http_req_duration`、`http_req_failed`                    | HTTP 耗时与非预期状态；按 `name` 分操作                              |
| `seat_auth_ok`、`ws_ready_ok`、`ws_ready_ms`              | 席位认证、实时通道就绪                                               |
| `online_window_seats`、`online_window_ok`                 | 完整覆盖同一绝对在线窗口的人数与比例；必须全部成功                   |
| `file_upload_ms`、`files_uploaded`、`file_bytes_uploaded` | 真实上传耗时、成功文件数、字节数                                     |
| `files_downloaded`、`file_download_integrity_ok`          | 已发布文件下载数及内容完整性                                         |
| `content_visible_ok`、`content_visible_ms`                | 写请求发起至本会话首次读取观察到目标 ID/状态；之后仍检查当前记录     |
| `live_notifications`、`live_delivery_ok`                  | 接收消息数、会话是否至少收到一次通知；不等于逐事件广播完整率         |
| `published_observed_ms`                                   | 内容标记开始时间至读取到发布内容，包含审核等待；跨发压机器需同步时钟 |
| `refresh_ms`、`refreshes`                                 | 通知合并后刷新 HTTP 的耗时与次数                                     |
| `reconnect_ok`、`reconnect_ms`                            | 断开后再次 ready 的结果与耗时                                        |
| `workflow_conflicts`、`load_errors`                       | 预期审核竞争与非预期错误                                             |

当前 `invalidate` 只有主题，没有事件 ID 或发布时间，无法精确计算每条通知的单向传播延迟或漏收率。
不能用“收到通知”“有过 200 响应”代替新数据可见、审核成功和文件完整。
正确性探针每 500ms 重读，使用 `*.verify` 操作名；这部分读取会增加负载，应与模拟页面刷新区分。
常规刷新复现 250ms 合并、串行读取、文本心跳和退避重连；
前后台延迟机制有单元验证，但实际场景默认所有窗口处于前台，不宣称已覆盖后台用户比例。
本地协议探针还检查委员会投影与 Timeline；主业务负载不反复控制 Timeline。

任何阈值未通过、样本数不足或执行失败都返回非零退出码。中断时独立 metadata 仍会保存；
若 k6 来不及完成退出处理，可能没有聚合报告，不能标记为通过。

## 数据与限制

凭据、工具、结果、本地状态均被 `.gitignore` 忽略；`seats.example.json` 只是模板。
只审核带本次 run-id 标记的内容，不处理其他用户的待办。
测试内容保留在独立测试大会中，不自动删除审计记录；可通过组织者平台结束测试大会并按现有保留策略处理。
`display` 会向真实 Chair 的转发通道发数据，仅针对测试 Chair 运行。
不覆盖 Electron 渲染耗时、多地区自动调度、服务端重部署注入、邮件供应商或 Cloudflare 账号配额管理；
若没有真实云端测试凭据，本地完成后仍须补齐 Cloudflare 实测。

## 实现依据

- 客户端：`apps/frontend/src/lib/classes/clients/cloud-*-client.ts`，
  `stores/cloud/file-notification-store.svelte.ts`，`services/live-refresh.ts`。
- 服务端：同级 `veto-api/src/routes/{join,file,news,directive,situation}`，
  `file/live.ts`；本地入口显式校验所需源码文件。
- Grafana 官方：[WebSockets](https://grafana.com/docs/k6/latest/javascript-api/k6-websockets/)、
  [异步 HTTP](https://grafana.com/docs/k6/latest/javascript-api/k6-http/asyncrequest/)、
  [数据分配](https://grafana.com/docs/k6/latest/examples/data-parameterization/)、
  [阈值](https://grafana.com/docs/k6/latest/using-k6/thresholds/)。

`@types/k6` 的子协议和关闭事件类型落后于固定版本实现，`lib/websocket.ts` 只补充对应类型，
不替换运行时；真实本地 Worker 联调验证多子协议握手与 ready。
