// 生成 public/og-image.png（1200×630 Open Graph 分享图）。
// 需要根目录 node_modules 中的 sharp；Windows 上经 FONTCONFIG_FILE 使用系统字体。
// 用法: FONTCONFIG_FILE=<指向含 C:\Windows\Fonts 的 fonts.conf> node scripts/generate-og-image.mjs
import path from "node:path"
import { fileURLToPath } from "node:url"

import sharp from "sharp"

const appRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const faviconPath = path.join(appRoot, "public", "favicon.png")
const outPath = path.join(appRoot, "public", "og-image.png")

const { data, info } = await sharp(faviconPath)
  .raw()
  .toBuffer({ resolveWithObject: true })

function pixelAt(x, y) {
  const offset = (y * info.width + x) * info.channels
  return [data[offset], data[offset + 1], data[offset + 2]]
}

// 从 logo 内部取样品牌米色作为标题文字颜色
const [r, g, b] = pixelAt(100, 1000)
const cream = `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`

const title = "云Veto"
const subtitle = "组织者平台 · 云端模拟联合国大会"
const domain = "platform.miaoyww.top"

const background = Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
  <rect width="1200" height="630" fill="#0a0a0a"/>
  <text x="520" y="292" font-family="Microsoft YaHei" font-weight="bold" font-size="132" fill="${cream}">${title}</text>
  <text x="524" y="380" font-family="Microsoft YaHei" font-size="42" fill="#a3a3a3">${subtitle}</text>
  <text x="524" y="452" font-family="Segoe UI, Microsoft YaHei" font-size="30" fill="#737373">${domain}</text>
</svg>
`)

const logo = await sharp(faviconPath).resize(340, 340).png().toBuffer()

await sharp(background)
  .composite([{ input: logo, left: 112, top: 145 }])
  .png()
  .toFile(outPath)

console.log(`og-image.png written to ${outPath} (brand color ${cream})`)
