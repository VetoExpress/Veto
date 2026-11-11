# Electron 语言同步

主进程在 `app.whenReady()` 后、账号恢复和窗口创建前初始化语言，无需等待 renderer。
首次启动按系统首选语言顺序选择支持的中文或英文，未匹配时使用应用 locale 的解析结果，
默认 `zh-CN`。后续启动优先读取本机偏好。

语言偏好复用 `data/store.ts`，保存在 `{appData}/Veto/store/preferences.json` 的 `locale`
字段。该域仅由主进程维护，通用 store IPC 不允许读取、写入、删除或迁移该域。

## Preload API

```ts
type Locale = 'zh-CN' | 'en-US'

window.veto.i18n.getLocale(): Promise<Locale>
window.veto.i18n.setLocale(locale: Locale): Promise<void>
window.veto.i18n.onLocaleChanged(callback: (locale: Locale) => void): () => void
```

对应 IPC 为 `veto:i18n:get-locale`、`veto:i18n:set-locale` 和
`veto:i18n:locale-changed`。事件负载仅为 locale，preload 不暴露 Electron event。
`onLocaleChanged` 不自动发送初值；renderer 应先订阅，再读取当前语言，卸载时取消订阅。

读写请求复用账号 IPC 的顶层 frame 来源白名单：`veto://app`、正式平台域名，以及开发模式
下既有本地开发来源和配置的开发服务器来源。子 frame、空 frame、第三方来源和非精确
`zh-CN` / `en-US` 参数会被拒绝，Promise reject。

切换语言立即更新主进程内存，向所有现存、未销毁且来源可信的窗口广播语言事件，同时更新
内置窗口标题。调用者传入的 Display label 保留原文。重复设置当前语言会重试保存，但不重播
语言事件。保存失败会记录 locale、操作影响和原始错误，本次会话仍使用新语言，Promise resolve；
这不保证重启后的偏好已保存。

账号持有的长期 warning 保存消息 key，读取快照时使用当前语言。语言切换同时通过
`veto:account:changed` 重播当前账号快照，不等待在途账号请求，也不重新验证账号。
已识别的共享认证客户端错误翻译为当前语言，未知服务端或第三方错误保持原文。

## 集成验证

Electron 文案位于 `packages/i18n/catalogs/electron/{zh-CN,en-US}.json`，使用平铺
`electron_` key。增加或修改 catalog 后，集成方需要先编译共享包，生成 messages 和 key 类型：

```sh
pnpm --filter @vetoexpress/i18n compile
```

定向回归覆盖 `i18n.test.ts`、`preload-i18n.test.ts`、`account-session.test.ts`、
`account-ipc.test.ts`、`account-storage.test.ts` 和 `display-window.test.ts`。
