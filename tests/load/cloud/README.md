# Cloudflare 2000 席实测

部署已有 API，准备四个独立测试大会、每大会 500 席。使用 HTTPS/WSS、真实 D1/R2/DO，不接入 KV。
准备脚本只允许显式的 Veto 域名，创建专用测试组织者；只向已有 D1 增加该测试账号，随后通过公开 API 创建大会及认领席位。
密码与邀请码保存在 Git 忽略的 `fixtures/cloud.seats.json`、`results/cloud-setup/manifest.json`，不应提交。

```powershell
# veto-api 工作区；先完成类型检查、测试与部署构建检查
npx wrangler deploy --keep-vars --var LOAD_DIAGNOSTICS:1
npx wrangler deployments status

# Veto 工作区，使用稳定的 Node 运行时
node tests/load/cloud/prepare.mjs https://api.miaoyww.top/v1
node tests/load/large/supervise.mjs --label cf-2000 --environment cloudflare `
  --deployment <已核验版本ID> --target https://api.miaoyww.top/v1 `
  --credentials tests/load/fixtures/cloud.seats.json `
  --seats 2000 --ramp 180 --window 300 --concurrency 128
```

准备阶段恢复认领前先查询席位状态；不会盲目重试不确定的写入。准备请求及恢复重试不计入正式压测。
正式负载不自动重试认证、连接或写入。每个席位每 30 秒浏览一种文件/新闻/局势列表；每大会五个写入席位，合计 20 次文件上传，交替 64 KiB/1 MiB，随后审批和下载 SHA-256 校验，再提交新闻或发布局势。
实际 WebSocket 通知触发列表刷新。该负载是 2000 席在线与部分业务操作，不是 2000 人同时上传。
同一席位全程保持连接且心跳新鲜，才计入共同在线。结果记录部署 ID、请求明细、分段延迟及测试端资源采样。
Server-Timing 只提供 I/O wall time，Worker 时钟不能用于推断纯 CPU 时间。没有计时头的失败不会被记成服务端 0ms。

```powershell
node tests/load/large/report.mjs <结果目录>
node tests/load/cloud/cleanup.mjs
# 回到 veto-api，关闭临时计时
npx wrangler deploy --keep-vars --var LOAD_DIAGNOSTICS:0
```

清理脚本只处理 manifest 内且带测试标记的四个大会：撤回已发布文件以删除 R2 对象，关闭并软删除大会，撤销组织者会话。
测试账号和大会审计记录保留；不会删除业务表或真实大会。清理结果记录于 `results/cloud-setup/cleanup.json`。
`cloudflareVerified` 表示在实际云端目标执行过，容量是否通过以 `passed`、实际共同在线数及操作成功率为准。
