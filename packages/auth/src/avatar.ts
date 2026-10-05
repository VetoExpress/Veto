/** Keep cropped avatars small enough to upload, including JPEGs expanded to PNG by the cropper. */
export const MAX_AVATAR_BYTES = 512 * 1024
export const AVATAR_DIMENSION = 512

export async function prepareAvatarImage(src: string, maxBytes = MAX_AVATAR_BYTES): Promise<Blob> {
  const original = await (await fetch(src)).blob()
  const image = new Image()
  image.src = src
  await image.decode()
  if (
    original.size <= maxBytes &&
    Math.max(image.naturalWidth, image.naturalHeight) <= AVATAR_DIMENSION
  )
    return original
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  if (!context) throw new Error('无法处理头像，请重新选择图片。')
  const scale = Math.min(1, AVATAR_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight))
  let width = Math.max(1, Math.round(image.naturalWidth * scale))
  let height = Math.max(1, Math.round(image.naturalHeight * scale))
  const encode = (type: string, quality?: number) =>
    new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('头像压缩失败，请重新选择图片。'))),
        type,
        quality
      )
    })
  while (true) {
    canvas.width = width
    canvas.height = height
    context.drawImage(image, 0, 0, width, height)
    const png = await encode('image/png')
    if (png.size <= maxBytes) return png
    for (const quality of [0.9, 0.8, 0.7]) {
      const webp = await encode('image/webp', quality)
      if (webp.size <= maxBytes) return webp
    }
    if (Math.max(width, height) <= 64) throw new Error('无法将头像压缩至 512 KB，请重新选择图片。')
    width = Math.max(1, Math.round(width * 0.75))
    height = Math.max(1, Math.round(height * 0.75))
  }
}

export async function prepareAvatarUpload(src: string) {
  const blob = await prepareAvatarImage(src)
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('无法读取头像，请重新选择。'))
    reader.readAsDataURL(blob)
  })
  return { dataUrl, base64: dataUrl.split(',')[1] }
}

export interface AvatarCrop {
  zoom: number
  x: number
  y: number
}

export function avatarCropRegion(width: number, height: number, crop: AvatarCrop) {
  const size = Math.min(width, height) / Math.max(1, Math.min(3, crop.zoom))
  return {
    size,
    x: ((width - size) * (Math.max(-1, Math.min(1, crop.x)) + 1)) / 2,
    y: ((height - size) * (Math.max(-1, Math.min(1, crop.y)) + 1)) / 2
  }
}

export async function cropAvatarUpload(src: string, crop: AvatarCrop) {
  const image = new Image()
  image.src = src
  await image.decode()
  const region = avatarCropRegion(image.naturalWidth, image.naturalHeight, crop)
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = Math.max(1, Math.min(AVATAR_DIMENSION, Math.round(region.size)))
  const context = canvas.getContext('2d')
  if (!context) throw new Error('无法裁剪头像')
  context.drawImage(
    image,
    region.x,
    region.y,
    region.size,
    region.size,
    0,
    0,
    canvas.width,
    canvas.height
  )
  return prepareAvatarUpload(canvas.toDataURL('image/png'))
}
