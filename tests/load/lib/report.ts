import type { LoadConfig, Summary } from './types.ts'

export function renderReport(data: Summary, config: LoadConfig, runId: string): string {
  const failures = Object.entries(data.metrics).flatMap(([name, metric]) =>
    Object.entries(metric.thresholds ?? {})
      .filter(([, threshold]) => !threshold.ok)
      .map(([rule]) => `${name}: ${rule}`)
  )
  const rows = Object.entries(data.metrics).map(([name, metric]) => {
    const values = Object.entries(metric.values)
      .map(([key, value]) => `${key}=${Number.isFinite(value) ? Number(value.toFixed(3)) : 'N/A'}`)
      .join(', ')
    return `| ${name} | ${values} |`
  })
  return [
    '# Veto 压测结果',
    '',
    `运行：${runId}`,
    `环境：${config.environment}；场景：${config.scenario}；配置：${config.profile}`,
    `计划席位：${config.vus}；持续时间：${config.durationSeconds}s；爬坡：${config.rampSeconds}s`,
    ...(config.onlineWindowSeconds
      ? [
          '认证、初始加载和在线窗口已按阶段写入 http_request_phase_ms/http_request_failures；逐阶段详情见 samples.json。'
        ]
      : []),
    ...(config.onlineWindowSeconds
      ? [
          `共同持续在线窗口：${config.onlineWindowSeconds}s；完整覆盖窗口的独立席位：${data.metrics.online_window_seats?.values.count ?? 0}/${config.vus}；任何迟到、掉线或提前结束均失败。`
        ]
      : []),
    `阈值结果：${failures.length ? '未通过' : '通过'}（需结合进程退出码、样本量及云端证据判断）`,
    '',
    '| 指标 | 统计 |',
    '| --- | --- |',
    ...rows,
    '',
    '## 计时与适用范围',
    '',
    '- 时间类指标单位为毫秒；Rate 是 0–1 比例；HTTP URL 按操作名归并，不保留令牌或资源 ID。',
    '- content_visible_ms：写请求发起至本会话首次读取观察到目标 ID/状态；后续仍检查当前列表，包含上传、审核等待与读取间隔，是观察延迟而非服务端提交耗时。',
    '- published_observed_ms：内容标记中的客户端开始时间至其他读取观察到发布内容；依赖发压端时钟同步，包含审核等待，不等同于纯 WS 传播延迟。',
    '- *.verify 为每 500ms 的业务正确性探针，与客户端通知触发的列表读取分别标记；会增加额外读负载。',
    '- refresh_ms 是一次订阅刷新涉及的 HTTP 读取耗时。invalidate 没有事件 ID，不能据此精确报告每条广播的漏收率或单向延迟。',
    '- 本地 Worker 联调通过不代表 Cloudflare 容量通过。云端验收还需记录部署版本、套餐、资源配置、发压地点及 Cloudflare Metrics/Logs。',
    '- 阈值是可配置的初始目标，不是已承诺的产品 SLA。results/metadata.json 记录实际进程结果。',
    '',
    ...(failures.length
      ? ['## 未通过阈值', '', ...failures.map((failure) => `- ${failure}`), '']
      : [])
  ].join('\n')
}
