# 高并发可靠性：一手资料与 Veto 验证项

日期：2026-11-11

范围：Google SRE、AWS Builders’ Library、Slack 与 Discord 工程团队公开资料。本文用于设计验证，不判断 Veto 的已证根因，也不构成容量或可用性保证。

## 结论

降低压测压力后通过，只能证明被测配置、该次环境和流量模型下通过；它不能证明过载时服务会保护自身、恢复正确，或真实云端资源表现相同。Google SRE 建议在现实环境中逐组件压到失效点，观察失效形态、恢复以及状态正确性，并测试渐进爬坡和瞬时突发。[1]

Veto 的现有基线尤其需要分开解读：原始只读负载确有请求放大，随后已校准；但所谓“只读浏览”校准轮配置了 `observerEvery: 5`，`main.ts` 会让完成启动的 observer 运行 `reviewerLoop`，500 席中最多 100 席，所以它并非纯只读基线。该轮 500 个席位中 479 个认证成功、HTTP 失败率 11.6%、HTTP P95 7.8 秒；样本包含 700 个状态码 0 的传输失败、21 个认证 HTTP 500、12 个初始加载 HTTP 500，以及在线阶段 19 个状态码 0 的失败。1000 席校准轮则有 162 个认证 HTTP 500、HTTP 失败率 11.7%、P95 17.95 秒。Wrangler ProxyWorker 的连接流错误是同时观测到的现象，但现有证据既不能把所有传输失败一一归因于代理，也不能解释认证和读取 500 的根因。此前“没有顶层 5xx、最强定位为代理层”的表述过度确定，应撤回。云端根因仍待将请求、Worker 异常、D1 与 DO 指标在同一时间窗关联。详见 [`BASELINE-500.md`](../BASELINE-500.md) 及对应 `results/<run-id>/samples.json`、`metadata.json`。

## 关键原则

1. **测试过载行为和恢复，不只测目标负载下的成功率。** Google 建议逐组件加压直到失效：超出容量时，理想表现是拒绝额外请求或降级，而不显著拖垮已成功处理的请求；还要测渐进爬坡、瞬时突发、回到正常流量后的恢复，以及有状态服务高负载下的状态正确性。[1] 对 Veto，应分别测登录洪峰、稳定在线、混合业务和恢复过程；记录成功吞吐是否塌陷、拒绝是否快速、延迟/队列是否回落，并在断连、重连和重试后核对业务状态。

2. **按瓶颈资源和请求成本衡量容量，席位数或 QPS 都不够。** Google 指出不同请求的资源成本差异很大，仅用 QPS 或静态请求属性估算容量会失准；应直接观察 CPU、内存等资源，且连接池大小和连接 churn 也带来负荷。[2] 对 Veto，应在 500 个不同席位、同一大会的真实角色与操作分布下，把认证、初始列表读取、WebSocket 在线、心跳/通知、写入、审核、文件上传下载拆开计量，并对齐 Worker、D1、R2、Durable Object、代理和发压机的指标。500 个在线 WebSocket 与 500 个同时登录/读写是不同的容量问题。

3. **过载时有界排队、明确拒绝，优于延迟无限增长。** Google 说明饱和队列会同时增加延迟和内存；稳定负载通常宜保持较短队列并尽早拒绝，突发流量则按处理时长与突发尺度选队列。过载时可按 CPU、内存、在途数或队列长度限流，并传播请求 deadline，避免客户端早已放弃后服务器仍继续消耗资源。[3] 对 Veto，要验证过载时 HTTP/API 与实时通道分别如何受限；失败是否快速、可分类，重载解除后系统是否能自行回到正常状态。只有在产品契约允许时才降级非关键读取；共享状态写入须继续满足一致性和审计要求。

4. **重试需要预算、退避、抖动和单一负责层；副作用写入必须具备幂等契约。** AWS 指出过短超时会制造额外重试，重试会占用失败服务更多资源；多层各重试会乘法放大，五层各三次重试可令底层请求增至 243 倍。AWS 建议为调用设合理超时、限制次数、指数退避加抖动，并通常只在一个栈层负责重试。[4] 对创建内容等副作用操作，AWS 使用调用方生成的请求 ID；去重令牌与写入需原子持久化，重复请求应返回语义等价结果，令牌相同但参数不同应报错。[5] 对 Veto，应检查登录/读取/连接各层的重试是否叠加；只有服务端能按稳定命令 ID 原子去重并复放结果时，才将内容写入纳入自动重试。现有负载说明也明确文件上传没有幂等重试契约，因此不自动重试上传。

5. **全体广播的主要成本是扇出与连接拓扑，必须以实际订阅分布测量。** Slack 描述的实时系统把频道映射到 Channel Server，再由其通知订阅该频道的 Gateway Server，最后转发给各在线 WebSocket；不同区域的广播倍数会随团队/频道规模而变。其一致性哈希、跨区域网关和快速替换服务是数千万连接量级的架构选择，不意味着 500 人产品必须照搬。[6] Veto 的新闻/局势全大会广播与定向委员会指令具有不同扇出。应分别验证单次发布对在线连接的发送量、通知延迟分布、慢客户端背压、重连后状态一致性，以及广播与列表读取同时发生时的后端资源峰值；不能只以“至少收到一个通知”推断逐事件送达完整。

6. **集中热读会造成单点热点，即使总请求率不高。** Discord 记录过频道与时间桶分区在热门公告后的集中读取；热点令节点延迟升高并影响同节点其他查询。其缓解办法是在 API 与数据库之间做按键路由和请求合并，同一行并发读取只查数据库一次。作者明确指出换数据库不能自动消除热分区，热点仍会存在。[7] 对 Veto，应专门构造同一大会/委员会、热门列表或同一通知关联数据被很多席位同时读取的情境，观察分区/对象级并发、查询数、延迟和邻近请求是否一起退化。只有测得同一键并发放大后，才考虑有界并发、缓存或请求合并；Discord 的 Rust 中介服务和数据库迁移属于其万亿消息规模背景，并不是 500 席的默认要求。

7. **同时做外部业务探针和内部资源观测。** Google 区分面向用户症状的 black-box 与内部原因分析的 white-box，关注延迟、流量、错误和饱和度。成功请求与失败请求的延迟需要分开，低延迟 500 不能改善“成功体验”；还应比较应用观察到的依赖耗时和依赖自己报告的执行耗时，区分网络/排队与实际执行慢。[9] 对 Veto，客户端完整工作流与服务端日志/指标必须用相同时间窗和 request ID 关联；连接 Gauge 的 `max=1` 是单次状态样本，不代表并发总人数，累计 ready 数也不能替代共同在线窗口。

8. **把数据库提交与异步投递的失败边界显式化。** AWS 的 transactional outbox 模式在同一数据库事务中保存业务变更与待投递事件，再由独立投递过程处理事件；投递可能重复，消费者仍需幂等，顺序与回滚也要明确。[10] Veto 文件通知已经和业务记录放在 D1 batch 中持久化，有恢复基础；但 `waitUntil` 内的一次广播并不是自动重试、已确认投递的持久任务。应验证补拉是否满足可接受的延迟，若不满足，再评估投递状态、重试和消费游标。Outbox 也不能使 R2+D1 成为跨资源原子事务，上传仍需单独的幂等和补偿设计。

9. **可靠性还包含发布和恢复路径。** Google 使用可重复构建、小步变更和小范围 canary 评价新版本，再决定扩大部署；可回滚是降低故障影响的组成部分。[11] Veto 会议前应记录已验证部署版本、实际套餐/绑定和数据库迁移，并演练重部署造成的 WebSocket 断开、重连后的状态恢复和备份恢复。代码回滚与数据库数据恢复是不同操作，不能用“回滚 Worker”承诺能撤销已执行的数据迁移。

## Veto 优先验证项

- **分开定位路径：** 将本地直连 Worker 与 Wrangler ProxyWorker 对照，并在可用时对真实测试部署运行相同阶段和同一负载种子。将客户端失败、代理流断开、Worker 错误/CPU、D1 查询、R2 操作、DO/WebSocket 指标按时间窗关联。不要从本地代理错误推断云端根因，也不要从本地通过推断线上通过。
- **证明负载模型：** 使用同一大会内的独立真实席位、实际角色比例和业务频率；分别报告连接数、认证速率、API 到达率、读写比例、消息扇出和上传字节。对齐发压端 CPU、内存和带宽，避免把生成器饱和误判成服务容量。
- **测边界而非只测单点：** 从目标负载渐进爬坡，再做登录/广播/集中读取突发；有意超过已观测容量，确认拒绝/降级和恢复行为，并执行稳定负载 soak。每种失败场景都检查真实状态、审计记录、重复副作用、连接 ready/close 与重连收敛。
- **分别提出可验收目标：** 先为 500 席定义共同在线覆盖、各工作流正确性、P95/P99、失败分类、恢复时间和容量余量；按实际限额和指标验收，再决定是否需要隔离热点或拆分服务。一次测试通过仅适用于记录中的版本、部署、拓扑、数据集和负载分布。

上述资料能支持这些验证方法，不能证明 Veto 当前存在队列饱和、扇出瓶颈、热键、错误重试放大或任何特定根因，也不能承诺稳定可用性。

## Veto 实现对照：风险而非根因

以下是代码路径审阅得到、需要实验验证的容量风险，不是已复现的线上故障：

- **每个受保护 HTTP 请求都会访问 D1 验 token。** `src/lib/seat-auth.ts` 调用 `verifySeatToken()`；后者在 `src/lib/seat-token.ts` 对 `seat_tokens.token` 做索引查找。多数 route 随后还会用 `findFileAuthority()` 或对应领域的 `findAuthority()` 查询委员会、角色和 Capability。500 席集中首屏读取会产生“每席多 API × 每 API 多次 D1 操作”的到达量。token 查找有索引不等于 D1 能并行处理这些查询；但当前没有逐查询耗时和队列数据，不能断言 D1 已饱和。任何 token/session 缓存都必须先定义权限变更和会话立即撤销的失效语义，不能为降载而静默延长授权。
- **认证洪峰还有密码派生和令牌写入。** `src/routes/join/routes/authenticate.ts` 先查 `findJoinTarget()`，已设置密码时再调用 `verifyPassword()`，最后写 `seat_tokens`。`src/lib/password.ts` 使用 PBKDF2-SHA256、100,000 次迭代。500 个同时登录会把 D1 读取、密码派生和 token 写入叠在同一窗口。500/1000 席测试中的认证 500 是事实，但没有异常栈、Worker CPU 与 D1 操作的关联，不能据此说 PBKDF2 或 D1 是原因。
- **一个大会的实时连接和广播集中到一个 FileLive Durable Object。** `connectFileLive()` 与 `invalidateConference()` 都用 `idFromName(conferenceId)`。DO 通过 Hibernation API 接受 WebSocket，空闲连接可以休眠，因此“500 个空闲连接”本身不等于 500 req/s；真正需测的是集中重连、变更频率、每次广播扫描的 socket 数及同时到达的普通 HTTP 工作。
- **FileLive `/broadcast` 有可量化的放大路径。** `src/routes/file/live.ts` 对每个 socket 过滤整批 events；匹配后逐个 `await verifySeatToken()`。一次文件提交的 `notificationStatement()` 会为每个有 `review_files` 能力的席位生成通知，因此若有 R 个审核席位、S 个在线 socket、B 个同时提交的文件，按当前调用形状估算的筛选比较量为 O(B×S×R)。在压测使用的每席一个 socket、R 个审核席位均在线的前提下，目标席位 token 查找约 B×R 次；每次 DO 请求内这些 token 查询在 socket 循环中逐个 await。举例 B=500、S=500、R=100 得到约 2,500 万次候选比较和约 50,000 次 token 查询。此为源码推导的条件估算，并非实测、CPU 预测或 Cloudflare 限额结论；真实审核角色数、成功上传数、DO 调度及其他负载都会改变结果。这与 `/invalidate` 的一次批量会话校验不同。应分别对单文件通知和集中批量提交做实验，记录 DO 请求数、CPU/持续时间、D1 子调用数和逐事件送达结果。
- **持久通知和实时投递是两个阶段。** 文件通知先由业务 D1 batch 持久化，`pushFileNotifications()` 随后经 `waitUntil` 再查通知行并调用 DO；异常被 catch 后仅保留持久行供客户端重连读取。这提供了数据恢复路径，但在线投递是否及时、通知行是否被客户端游标追平以及恢复延迟没有当前压测指标。测试应注入 DO 失败/客户端断连，再验证通知游标最终收敛。
- **R2 与 D1 写入不构成跨资源事务。** 上传先 `FILES.put()`，再 `DB.batch()` 写文件、审计与通知记录，失败时尽力删除 R2 对象；这是补偿清理模式。需在 R2 成功后、D1 batch 前后注入失败，并核对对象孤儿、记录状态、审计和重试后的重复创建。现有上传不自动重试是合理约束，除非以后增加原子幂等键与可重放结果。

还应测量 **写入 → 广播失效通知 → 多客户端重读 → D1** 的反馈放大。当前 `/invalidate` 只按 topic Capability 过滤，文件变更会通知具有文件能力的 live sockets；客户端再经鉴权 API 读取可见列表。这样不会直接泄漏文件内容，但委员会内的变更也可能触发其他委员会的空读取。若每秒变更率为 W、每次有效通知有 N 个接收者、每次刷新需 A 个 API、每 API 平均 Q 次数据库操作，未合并时附加 D1 到达量的条件估算为 W×N×A×Q。客户端已有 250ms 合并与低频补同步，应量测合并后的真实请求量，不能假设每次变更必然导致上述全部请求，也不能把跨用户合并建立在不同权限结果可共享的假设上。

Cloudflare 当前文档给出的边界也不支持用“连接数”单一推容量：单个 D1 数据库一次处理一个 query，队列满会返回 overloaded；read replicas 只能服务读，且应用要使用 Sessions API 才走副本；Durable Object 单对象的约 1,000 请求/秒是软上限，简单工作约 500–1,000 req/s，实际能力受每次工作量影响；WebSocket Hibernation API 每个 DO 的连接上限为 32,768，但 CPU/内存可能先成为实际限制；Workers isolate 内存为 128 MB，极高负载时运行时可能取消部分入站请求。[8] 这些是平台事实，不是 Veto 在 500 席时已经触及这些限制的证据。

## 下一轮定位实验

优先收集能区分竞争假设的证据，再决定是否改架构：

1. **先让失败可追踪。** Worker 为每个请求记录随机 request ID、route/operation、状态、异常类型和 stack（不记 token、密码、请求体）；响应带 request ID。把同一 ID 和时间戳写入客户端样本及 Wrangler/Cloudflare 日志。独立统计 HTTP 500 与 status 0；对每次失败查到负责的 Worker/DO 日志或明确记为“无服务器记录”。
2. **拆开本地传输层和应用层。** 在同一版本、数据集、发压机和负载种子下，比较 Wrangler ProxyWorker 入口与可获得的直接 UserWorker 路径。直接入口如果不能保持相同路由、绑定和 WebSocket 拓扑，就只作为局部对照，不把它当等价环境。此项用于判断 700 个状态码 0 的传输错误分布，不能替代解释 21 个认证 500。
3. **做能隔离资源的递进实验。** A：500 席认证洪峰；B：认证后只做一次首页读取；C：500 空闲 WS + 正常心跳；D：空闲 WS 上逐步增加全会广播频率；E：单文件与批量文件通知；F：500 席同时小文件上传。每轮同时看 Worker CPU/错误、D1 query count/duration/rows/error、DO request rate/CPU/exception、R2 操作以及发压端 CPU/内存/网络。逐步爬坡和瞬时突发分开，另做负载解除后的恢复与业务状态校验。
4. **把角色模型改成真实分布并验证脚本。** 先修正 `observerEvery` 隐式开启 reviewer loop 的测试口径，分别定义“只读代表”“审核者”“内容生产者”的能力与占比。保留更重的 worst-case profile，但不能把它称作典型会议负载。500 席全会广播与委员会定向工作流也应分别报扇出。
5. **根据可观测瓶颈选择架构措施。** 若 D1 query 到达数/队列确为瓶颈，先用索引计划、批处理减少每请求操作，再评估 read replica（只影响可安全从副本读取的查询，且不解决写入及授权撤销时效）；若 DO 持续热点，先按真实变更频率做 topic 合并/批量广播并测背压，之后才考虑按委员会或主题分片；若是认证 CPU，单独测密码验证与入会速率保护。过载验收应看系统快速、可分类地拒绝额外负载，同时已接收业务维持正确、负载下降后自动恢复，而不是只把全局失败率调到 1% 以下。

## 一手来源

[1] Google SRE, [Addressing Cascading Failures](https://sre.google/sre-book/addressing-cascading-failures/)，尤其 “Testing for Cascading Failures” 与 “Test Until Failure and Beyond”：过载拒绝、爬坡与突发、有状态高负载正确性、恢复测试。

[2] Google SRE, [Handling Overload](https://sre.google/sre-book/handling-overload/)：“The Pitfalls of Queries per Second”讨论请求成本和资源指标；“Client-Side Throttling”讨论过载反馈与客户端自限；“Per-Customer Limits”讨论隔离不同客户负载。

[3] Google SRE, [Addressing Cascading Failures](https://sre.google/sre-book/addressing-cascading-failures/)，尤其 “Queue Management”、“Load Shedding and Graceful Degradation” 与 “Latency and Deadlines”。

[4] AWS Builders’ Library, [Timeouts, retries, and backoff with jitter](https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/)：超时、重试负载、多层重试乘法、抖动与重试预算。

[5] AWS Builders’ Library, [Making retries safe with idempotent APIs](https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-apis/)：调用方请求 ID、原子记录与副作用、语义等价响应及参数不匹配处理。

[6] Slack Engineering, [Real-time Messaging](https://slack.engineering/real-time-messaging/)（2023-04-11）：频道分区、Gateway/Channel Server、WebSocket 订阅和实时广播路径。

[7] Discord Engineering, [How Discord Stores Trillions of Messages](https://discord.com/blog/how-discord-stores-trillions-of-messages)（2023-03-06）：热分区影响、公告后的集中读、按频道路由与 request coalescing；属于万亿消息系统案例。

[8] Cloudflare 官方文档：[D1 limits](https://developers.cloudflare.com/d1/platform/limits/)、[D1 read replication](https://developers.cloudflare.com/d1/best-practices/read-replication/)、[Durable Objects limits](https://developers.cloudflare.com/durable-objects/platform/limits/)、[Durable Object State](https://developers.cloudflare.com/durable-objects/api/state/)、[Rules of Durable Objects](https://developers.cloudflare.com/durable-objects/best-practices/rules-of-durable-objects/)、[Durable Objects WebSocket best practices](https://developers.cloudflare.com/durable-objects/best-practices/websockets/)、[Workers limits](https://developers.cloudflare.com/workers/platform/limits/)、[D1 query insights](https://developers.cloudflare.com/d1/observability/find-expensive-queries/)。

[9] Google SRE, [Monitoring Distributed Systems](https://sre.google/sre-book/monitoring-distributed-systems/)：black-box/white-box、四个核心信号、成功/失败延迟与应用端/依赖端耗时对照。

[10] AWS Prescriptive Guidance, [Transactional outbox pattern](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html)：数据库提交与事件投递的双写风险、持久 outbox、重复消费、顺序和回滚约束。

[11] Google SRE Workbook, [Canarying Releases](https://sre.google/workbook/canarying-releases/)：可重复构建、小步部署、可回滚和小范围版本评价。
