import { spawn, spawnSync } from 'node:child_process'
import { createServer } from 'node:net'

const HOST = '127.0.0.1'
const DEFAULT_PORT = 5173
const PORT_ATTEMPTS = 20
const STARTUP_TIMEOUT_MS = 60_000

const children = new Set()
let stopping = false

function pnpmInvocation(args) {
  const execPath = process.env.npm_execpath
  if (execPath && /\.[cm]?js$/.test(execPath)) {
    return { command: process.execPath, args: [execPath, ...args] }
  }

  return {
    command: process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
    args,
    shell: process.platform === 'win32'
  }
}

function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = createServer()
    server.unref()
    server.once('error', () => resolve(false))
    server.listen({ host: HOST, port }, () => {
      server.close(() => resolve(true))
    })
  })
}

async function findAvailablePort() {
  const preferred = Number(process.env.VETO_DEV_PORT ?? DEFAULT_PORT)
  if (!Number.isInteger(preferred) || preferred < 1 || preferred > 65_535) {
    throw new Error(`无效的 VETO_DEV_PORT：${process.env.VETO_DEV_PORT}`)
  }

  const lastPort = Math.min(65_535, preferred + PORT_ATTEMPTS - 1)
  for (let port = preferred; port <= lastPort; port += 1) {
    if (await isPortAvailable(port)) return port
  }

  throw new Error(
    `从 ${preferred} 到 ${lastPort} 的端口均不可用，请设置 VETO_DEV_PORT。`
  )
}

function terminate(child) {
  if (child.exitCode !== null || child.signalCode !== null) return

  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
    return
  }

  child.kill('SIGTERM')
}

function stop(code) {
  if (stopping) return
  stopping = true

  for (const child of children) terminate(child)
  process.exitCode = code
  setTimeout(() => process.exit(code), 2_000).unref()
}

function start(name, args, env) {
  const invocation = pnpmInvocation(args)
  const child = spawn(invocation.command, invocation.args, {
    env,
    stdio: 'inherit',
    shell: invocation.shell ?? false,
    windowsHide: true
  })

  children.add(child)
  child.once('error', (error) => {
    console.error(`[dev] ${name} 启动失败：`, error)
    stop(1)
  })
  child.once('exit', (code, signal) => {
    children.delete(child)
    if (stopping) return

    const reason = signal ? `信号 ${signal}` : `退出码 ${code ?? 1}`
    console.error(`[dev] ${name} 已停止（${reason}）`)
    stop(code ?? 1)
  })

  return child
}

async function waitForServer(child, url) {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS

  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error('前端开发服务器在就绪前退出。')
    }

    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2_000) })
      if (response.ok) return
    } catch {
      // The server is still starting.
    }

    await new Promise((resolve) => setTimeout(resolve, 250))
  }

  throw new Error(`等待前端开发服务器超时：${url}`)
}

async function main() {
  const port = await findAvailablePort()
  const rendererUrl = `http://${HOST}:${port}`
  const env = {
    ...process.env,
    ELECTRON_RENDERER_URL: rendererUrl,
    VETO_DEV_PORT: String(port)
  }

  console.log(`[dev] 前端地址：${rendererUrl}`)
  const frontend = start('frontend', ['--filter', '@vetoexpress/frontend', 'dev'], env)

  try {
    await waitForServer(frontend, rendererUrl)
  } catch (error) {
    console.error(`[dev] ${error instanceof Error ? error.message : String(error)}`)
    stop(1)
    return
  }

  console.log('[dev] 前端已就绪，正在启动 Electron。')
  start('electron', ['--filter', '@vetoexpress/electron', 'dev'], env)
}

process.once('SIGINT', () => stop(130))
process.once('SIGTERM', () => stop(143))

main().catch((error) => {
  console.error('[dev] 启动失败：', error)
  stop(1)
})
