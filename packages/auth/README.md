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
