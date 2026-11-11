import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const directories = process.argv.slice(2)
if (!directories.length || directories.length > 2)
  throw new Error('Usage: node report.mjs BASELINE_DIR [RETEST_DIR]')
const runs = await Promise.all(
  directories.map(async (directory) => {
    let source
    try {
      source = await readFile(path.join(directory, 'summary.corrected.json'), 'utf8')
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
      source = await readFile(path.join(directory, 'summary.json'), 'utf8')
    }
    return JSON.parse(source)
  })
)
const rows = [
  `# ${runs.at(-1).requiredSeats} 席${runs.at(-1).environment === 'cloudflare' ? ' Cloudflare' : '本地'}压测`,
  '',
  runs.some((run) => run.environment === 'cloudflare')
    ? '本报告包含实际 Cloudflare HTTPS/WSS 压测，使用部署版本及独立测试席位。短时测试不代表长期稳定性；本机发压网络也影响端到端延迟。'
    : '本报告仅适用于本机真实 Worker/D1/R2/DO。未进行 Cloudflare 线上容量验收。时长为短时容量诊断，不代表长时间稳定性。',
  ''
]
for (const run of runs) {
  rows.push(
    `## ${run.label}`,
    '',
    `大会 ${run.conferences} 个；目标 ${run.requiredSeats} 席；接入 ${run.rampSeconds}s；共同在线窗口 ${run.commonWindowSeconds}s；HTTP 并发上限 ${run.concurrency}。`,
    `环境 ${run.environment}；目标 ${run.target}；部署版本 ${run.deployment ?? '未指定'}。`,
    ...(run.corrections
      ? [
          `原始记录保留；四次下载 HTTP 500 从误标的 HASH_MISMATCH 纠正为 HTTP_500。不存在已证实的成功下载损坏。`
        ]
      : []),
    '',
    `认证成功 ${run.authenticated}；窗口结束仍就绪 ${run.finalReady}；完整共同在线 ${run.commonSeats}；文件完整性验证 ${run.verifiedFiles}/${run.plannedFiles}；验收 ${run.passed ? '通过' : '失败'}。`,
    '',
    '| 阶段 / 操作 | 成功 / 尝试 | 成功总耗时 P95 ms | 失败总耗时 P95 ms | 客户端排队 P95 ms | TTFB P95 ms | 响应体 P95 ms | Worker P95 ms | Worker 外 P95 ms |',
    '|---|---:|---:|---:|---:|---:|---:|---:|---:|'
  )
  for (const [name, op] of Object.entries(run.operations))
    rows.push(
      `| ${name} | ${op.succeeded}/${op.attempts} | ${op.successfulTotal.p95 ?? '无样本'} | ${op.failedTotal.p95 ?? '无样本'} | ${op.queue.p95 ?? '无样本'} | ${op.ttfb.p95 ?? '无样本'} | ${op.body.p95 ?? '无样本'} | ${op.server.worker?.p95 ?? '无样本'} | ${op.outsideWorker.p95 ?? '无样本'} |`
    )
  rows.push('', '### 服务端阶段与错误', '')
  for (const [name, op] of Object.entries(run.operations)) {
    rows.push(
      `- ${name}：${
        Object.entries(op.server)
          .map(([stage, d]) => `${stage} P95=${d.p95}ms (n=${d.n})`)
          .join('；') || '没有服务端计时样本'
      }。失败分类：${JSON.stringify(op.errors)}。`
    )
  }
  rows.push(
    '',
    `客户端 RSS 采样最大 ${(Math.max(...run.health.map((point) => point.rss)) / 1024 ** 2).toFixed(1)} MiB；事件循环 P95 采样最大 ${Math.max(...run.health.map((point) => point.loopP95Ms)).toFixed(1)}ms。`,
    ''
  )
}
rows.push(
  '## 计时口径',
  '',
  '- total：发起到完整响应结束，包含客户端并发门控排队。成功、失败分别统计，超时不混入成功延迟。',
  '- queue：明确测量的客户端门控等待。TTFB：发给 HTTP 连接池至收到响应头，可能包含连接池、连接建立、代理排队和服务器时间。',
  '- worker：Worker fetch 入口到响应头生成。db_*：数据库调用的等待与执行合计；r2_*：存储调用；password：密码验证。各分位数不能直接相加或相减。',
  '- outsideWorker：逐条请求 TTFB 减 Worker 时间后再统计，含客户端连接池、网络、边缘路由及本地测试时的代理等，不能进一步单独归为网络或代理。',
  '- 失败请求若没有 Server-Timing，就没有 Worker 内部耗时证据。不能把无样本写成 0ms。',
  ...(runs.length > 1
    ? [
        '- 本地历史基线错误码 23 是 Node DOMException 的 TimeoutError；复测改为记录错误名称，超时预算不变。历史基线 refresh.directives 的 404 来自脚本用了不存在的 /veto/directives，后改为 /veto/directives/mine。',
        '- 基线与复测使用同一批席位及持久化数据库，已有业务数据保留；本机资源也会变化，不能将全部差异归于 API 修改。'
      ]
    : []),
  '- 服务端阶段统计包含拿到计时头的失败响应；成功总耗时只使用成功请求。',
  '- Worker 计时不是 CPU 时间；下载 r2_get 只计取对象响应，不包含后续读取整个流。文件 body 耗时由客户端另记。',
  '- 业务变更会触发真实 WS 刷新；同一席位合并 250ms 内的同主题刷新，未启用所有席位轮询审核。固定每大会前五个认证成功席位写入文件。',
  '- 不自动重试认证、写入或连接；失败席位不会由另一个席位替换。整个共同窗口内就绪且心跳新鲜才计为共同在线。',
  ''
)
const output = path.join(directories.at(-1), 'comparison.md')
await writeFile(output, rows.join('\n'))
console.log(output)
