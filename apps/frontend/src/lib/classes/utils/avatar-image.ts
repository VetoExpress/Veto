/** Keep cropped avatars small enough to upload, including JPEGs expanded to PNG by the cropper. */
export async function prepareAvatarImage(src: string, maxBytes = 512 * 1024): Promise<Blob> {
  const original = await (await fetch(src)).blob()
  const image = new Image()
  image.src = src
  await image.decode()
  if (original.size <= maxBytes && Math.max(image.naturalWidth, image.naturalHeight) <= 512)
    return original
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  if (!context) throw new Error('无法处理头像，请重新选择图片。')
  const scale = Math.min(1, 512 / Math.max(image.naturalWidth, image.naturalHeight))
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
