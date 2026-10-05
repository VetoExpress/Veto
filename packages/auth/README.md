# @vetoexpress/auth

Veto 共用的认证客户端，提供登录、注册、邮箱验证码、密码重置、当前用户查询和用户缓存。仅依赖标准 Fetch 接口，不依赖 React、Svelte、Next.js 或 Electron。

```ts
import { createAuthClient, AuthError, type AuthUser } from "@vetoexpress/auth"

const auth = createAuthClient({ apiBaseUrl: "https://api.example.com" })
const token = await auth.login(email, password)
const user = await auth.fetchMe(token)
```

API 地址由调用方传入，也可通过 `fetch` 选项提供请求实现。每个客户端实例拥有独立的用户缓存；`readCachedUser(token)` 只返回匹配该 token 的缓存，`fetchMe(token)` 始终发起请求并更新缓存。

`patchMe(token, { name, avatar })` 保存账号资料并更新相同缓存。浏览器头像工具从 `@vetoexpress/auth/avatar` 导入：`prepareAvatarUpload(src)` 将裁剪后的图片缩放至最长边 512 像素并压缩至 512 KB 内，返回预览用 `dataUrl` 与提交用纯 `base64`；`cropAvatarUpload(src, { zoom, x, y })` 支持居中正方形裁剪及缩放、位置调整。App 和 Platform 共用压缩、透明度保留、编码及上限逻辑，后端统一存 R2。此浏览器入口仅在用户选择图片后调用，不在 SSR 中执行。

本包不持久化 token，不管理页面跳转或 UI 状态。各端负责凭据存储、登录状态绑定及未授权后的处理。用户账号认证与会议席位认证保持独立。

Platform 的 `lib/auth-client.ts` 是配置适配层，注入 `NEXT_PUBLIC_API_URL` 并保留现有导出；App 接入时创建自己的客户端实例即可。

桌面 App 的客户端运行在 Electron 主进程，由 `account-session.ts` 管理会话，API 地址通过构建时的 `VETO_ACCOUNT_API_URL` 配置（默认 `https://api.miaoyww.top`）。渲染页面通过 `window.veto.account` 登录、读取公开账号状态、刷新用户信息、退出及监听变化；接口类型从 `@vetoexpress/auth/desktop` 导出，状态不含 token。

账号资料通过 `updateProfile({ name, avatar })` 保存。密码重置先调用 `sendPasswordCode()` 向当前账号的注册邮箱发送验证码，再调用 `resetPassword(code, password)` 验证并提交；渲染页面不能指定其他邮箱。成功后撤销所有服务端账号会话，并清除本机凭据、广播退出状态，需使用新密码重新登录。资料更新接口不接受密码。

凭据与用户缓存通过 Electron `safeStorage` 加密后写入用户数据目录的 `account-session.enc`。安全存储不可用时仅保留内存会话。重启后重新查询当前用户；网络故障保留已有信息并提示，401 清除会话。当前后端尚无刷新凭据或服务端退出接口，因此 `refresh()` 只刷新用户信息并校验当前凭据，退出只清除本机会话。

内嵌 platform 与 App 共用该会话。`getAccessToken()` 仅向可信顶层页面按需返回当前凭据，用于现有 Bearer API 请求；广播仍只包含公开账号状态。可信来源为 `veto://app` 和 `https://platform.miaoyww.top`，开发模式另允许本项目的 localhost 5173、4174、3000 端口。平台登录走主进程，注册后通过 `adoptToken()` 校验并接入主进程；已有平台 `localStorage` 凭据只在桌面未登录时迁移，成功后删除。内嵌平台不再把凭据写回网页存储。`signOut(expectedToken)` 防止旧账号请求的迟到 401 退出新账号。普通浏览器保留原来的网页会话。
