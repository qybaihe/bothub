/**
 * Muse VM filesystem helpers (official HatchGatewayFs).
 *
 * Upload: chunked `fs.write` with data_base64 (512 KiB), optional staging
 * `.upload-<uuid>.part` + `fs.rename` when stageBeforePublish && >1 chunk.
 * Preview: `fs.raw` binary GET on `/fs/raw/{*path}` (media channel in web client;
 * BotHub uses the same daemon Noise connection).
 */
import { randomUUID } from 'node:crypto'
import type { MuseNativeGateway } from './gateway'

const CHUNK = 524_288 // 512 KiB — official HatchGatewayFs
const FILE_REF_BYTES = 0xa0_0000 // 10 MiB non-image → file_ref
const VIDEO_REF_BYTES = 0x3c0_0000 // 60 MiB video

export function needsFileRef(mimeType: string, size: number): boolean {
  const mime = mimeType.toLowerCase()
  if (mime.startsWith('image/')) return false
  if (mime.startsWith('video/')) return size >= VIDEO_REF_BYTES
  return size >= FILE_REF_BYTES
}

export function buildWorkspaceUploadPath(filename: string, counter = 0): string {
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '_')
  const i = safe.lastIndexOf('.')
  const base = i > 0 ? safe.slice(0, i) : safe
  const ext = i > 0 ? safe.slice(i).replace(/[^a-zA-Z0-9.]/g, '_') : ''
  const rand = Math.random().toString(36).slice(2, 6)
  return `workspace/user/files/${base}_${counter}_${rand}${ext}`
}

function normalizeFsPath(path: string): string {
  const s = path.trim().replace(/^\/+/, '')
  if (!s.startsWith('workspace/')) {
    throw new Error(`fs path must be under workspace/: ${path.slice(0, 80)}`)
  }
  for (const seg of s.split('/')) {
    if (!seg || seg === '.' || seg === '..' || seg.includes('\\') || seg.includes('\0')) {
      throw new Error(`unsafe fs path segment in ${path.slice(0, 80)}`)
    }
  }
  return s
}

function bytesToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64')
}

export async function uploadWorkspaceFile(
  gw: MuseNativeGateway,
  path: string,
  bytes: Uint8Array,
  opts: { stageBeforePublish?: boolean; signal?: AbortSignal } = {}
): Promise<string> {
  const dest = normalizeFsPath(path)
  const size = bytes.byteLength
  const chunks = Math.ceil(size / CHUNK) || 1
  const stage = opts.stageBeforePublish === true && chunks > 1
  const slash = dest.lastIndexOf('/')
  const dir = slash >= 0 ? dest.slice(0, slash + 1) : ''
  const staging = `${dir}.upload-${randomUUID()}.part`
  const target = stage ? staging : dest

  if (size === 0) {
    await gw.request(
      'fs.write',
      { path: target, data_base64: '', overwrite: true, append: false, create_parent: true },
      360_000
    )
  } else {
    let offset = 0
    for (let i = 0; i < chunks; i++) {
      opts.signal?.throwIfAborted?.()
      const end = Math.min(offset + CHUNK, size)
      const slice = bytes.subarray(offset, end)
      await gw.request(
        'fs.write',
        {
          path: target,
          data_base64: bytesToBase64(slice),
          overwrite: i === 0,
          append: i !== 0,
          create_parent: i === 0
        },
        360_000
      )
      offset = end
    }
  }

  if (stage) {
    await gw.request(
      'fs.rename',
      { source: staging, destination: dest, create_parent: true, overwrite: true },
      120_000
    )
  }
  return dest
}

const PREVIEW_MAX = 8 * 1024 * 1024

export async function fetchFsRawPreview(
  gw: MuseNativeGateway,
  path: string
): Promise<{ path: string; mimeType: string; dataBase64: string; byteLength: number }> {
  const p = normalizeFsPath(path)
  const { body, contentType } = await gw.requestBinary('fs.raw', { path: p, _range: { start: 0, end: PREVIEW_MAX - 1 } }, 120_000)
  const mime =
    (contentType && contentType.split(';')[0]?.trim()) ||
    guessMime(p) ||
    'application/octet-stream'
  // If server ignored Range and returned a huge body, truncate for UI.
  const clipped = body.byteLength > PREVIEW_MAX ? body.subarray(0, PREVIEW_MAX) : body
  return {
    path: p,
    mimeType: mime,
    dataBase64: bytesToBase64(clipped),
    byteLength: clipped.byteLength
  }
}

function guessMime(path: string): string | undefined {
  const lower = path.toLowerCase()
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.gif')) return 'image/gif'
  if (lower.endsWith('.webp')) return 'image/webp'
  if (lower.endsWith('.svg')) return 'image/svg+xml'
  if (lower.endsWith('.pdf')) return 'application/pdf'
  if (lower.endsWith('.mp3')) return 'audio/mpeg'
  if (lower.endsWith('.m4a') || lower.endsWith('.aac')) return 'audio/mp4'
  if (lower.endsWith('.wav')) return 'audio/wav'
  if (lower.endsWith('.ogg') || lower.endsWith('.oga')) return 'audio/ogg'
  if (lower.endsWith('.mp4') || lower.endsWith('.m4v')) return 'video/mp4'
  if (lower.endsWith('.webm')) return 'video/webm'
  if (lower.endsWith('.mov')) return 'video/quicktime'
  return undefined
}
