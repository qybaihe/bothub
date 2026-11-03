const SIZE = 160

/**
 * Center-crop an image file to a small square data URL. Avatars live in the
 * persisted workspace (localStorage), so they must stay a few KB.
 */
export async function avatarFromFile(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Choose an image file.')
  const bitmap = await createImageBitmap(file)
  try {
    const side = Math.min(bitmap.width, bitmap.height)
    const canvas = document.createElement('canvas')
    canvas.width = SIZE
    canvas.height = SIZE
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Could not read the image.')
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(
      bitmap,
      (bitmap.width - side) / 2,
      (bitmap.height - side) / 2,
      side,
      side,
      0,
      0,
      SIZE,
      SIZE
    )
    return canvas.toDataURL('image/webp', 0.88)
  } finally {
    bitmap.close()
  }
}
