# @vetoexpress/auth

Veto 共用的认证客户端，提供登录、注册、邮箱验证码、密码重置、当前用户查询和用户缓存。仅依赖标准 Fetch 接口，不依赖 React、Svelte、Next.js 或 Electron。

```ts
import { createAuthClient, AuthError, type AuthUser } from "@vetoexpress/auth"

const auth = createAuthClient({ apiBaseUrl: "https://api.example.com" })
const token = await auth.login(email, password)
const user = await auth.fetchMe(token)
```

API 地址由调用方传入，也可通过 `fetch` 选项提供请求实现。每个客户端实例拥有独立的用户缓存；`readCachedUser(token)` 只返回匹配该 token 的缓存，`fetchMe(token)` 始终发起请求并更新缓存。

本包不持久化 token，不管理页面跳转或 UI 状态。各端负责凭据存储、登录状态绑定及未授权后的处理。用户账号认证与会议席位认证保持独立。

Platform 的 `lib/auth-client.ts` 是配置适配层，注入 `NEXT_PUBLIC_API_URL` 并保留现有导出；App 接入时创建自己的客户端实例即可。

桌面 App 的客户端运行在 Electron 主进程，由 `account-session.ts` 管理会话，API 地址通过构建时的 `VETO_ACCOUNT_API_URL` 配置（默认 `https://api.miaoyww.top`）。渲染页面通过 `window.veto.account` 登录、读取公开账号状态、刷新用户信息、退出及监听变化；接口类型从 `@vetoexpress/auth/desktop` 导出，状态不含 token。

凭据与用户缓存通过 Electron `safeStorage` 加密后写入用户数据目录的 `account-session.enc`。安全存储不可用时仅保留内存会话。重启后重新查询当前用户；网络故障保留已有信息并提示，401 清除会话。当前后端尚无刷新凭据或服务端退出接口，因此 `refresh()` 只刷新用户信息并校验当前凭据，退出只清除本机会话。内嵌 platform 的会话同步尚未接入。
