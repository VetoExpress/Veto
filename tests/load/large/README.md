# 10000 席分大会诊断

本入口用 Node.js、后端工作区已安装的 `undici` 和 `ws` 建立独立席位的真实 HTTP/WS 会话。
原 k6 套件仍保留。该入口只允许 loopback 的本地 Worker，不能作为 Cloudflare 线上验收。

```powershell
node tests/load/local/start.mjs --seats 10000 --conferences 10 --port 8797 --claim-concurrency 8
# 另一个终端，等待 READY 后执行
node tests/load/large/run.mjs --label baseline --seats 10000 --ramp 240 --window 120 --concurrency 128
```

长时间运行可使用 `supervise.mjs` 替代 `run.mjs`，参数相同。它直接写入进程日志和
退出码记录，避免终端输出丢失；发生原生进程退出时仍能区分未完成运行。
本次对照使用 Node 24.22.1，后端工作区依赖为 undici 7.29.0、ws 8.21.0。

每个席位认证一次、建立一条 WS、加载当前委员会，接入结束后开始共同在线窗口。
所有认证成功席位每 30 秒浏览一个文件/新闻/局势列表；每大会前五个认证成功席位各上传一个文件，审批并下载校验 SHA-256，然后提交新闻或发布局势。
文件交替使用 64 KiB、1 MiB，所有用户共享两份不可变源数据；下载采用增量哈希。
WS 通知按席位合并 250ms 内的主题，再执行真实列表刷新。此负载不是 10000 人同时上传。
种子角色仍是现有 MPC/IPC 广权限角色，包含审核权限，不能代表真实会议角色比例。

HTTP 在连接池前设置明确并发门控，排队也计入 30 秒总超时。10000 条 WS 不受 HTTP 并发门控约束。
不重试失败的登录、连接或写入，不以其他席位替换失败者。完整在线窗口要求一直就绪且心跳新鲜。
连接失败、超时、HTTP 错误、响应格式、身份与文件完整性失败均计为失败。
验收要求 10000 席完成共同窗口、请求全成功、计划文件全部校验，成功请求总体 P95 小于 2000ms。

结果位于忽略提交的 `tests/load/results/<时间>-<label>/`：

- `requests.jsonl`：逐请求耗时、操作、阶段、状态与错误码；不写 token、密码或响应正文。
- `summary.json`：按阶段/操作分组的成功和失败耗时、Worker/数据库/R2 阶段、WS 与客户端资源采样。
- `comparison.md`：下述命令生成的前后对照。

```powershell
node tests/load/large/report.mjs <baseline目录> <retest目录>
```

修复后停止本地启动器，使用同一持久化目录、同一批席位重启：

```powershell
node tests/load/local/start.mjs --seats 10000 --conferences 10 --port 8797 --reuse
node tests/load/large/run.mjs --label retest --seats 10000 --ramp 240 --window 120 --concurrency 128
```

复测使用相同凭据和负载参数。已有业务数据会保留，因此数据库不是全新快照，报告必须说明这个限制。
本地 `LOAD_DIAGNOSTICS=1` 开启 Server-Timing，默认线上绑定不启用。Worker 时钟用于 I/O wall time，不能当作 CPU profiler。
`outsideWorker` 包含客户端连接池、连接建立、网络及本地代理，不能仅凭此字段断言其中某个组件是根因。
