import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    // Node 环境（不需要 DOM），主进程代码测试
    environment: 'node',
    // 测试文件位置
    include: ['src/main/**/*.test.ts'],
    // 全局 API（describe/it/expect 无需显式 import）
    globals: true
  },
  resolve: {
    alias: {
      // 如果测试文件用相对路径 import，不需要特殊 alias
    }
  }
})
