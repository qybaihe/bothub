/** Pure decision for the GitHub "latest release" check (testable without Electron). */

export type LatestReleaseOutcome =
  | { type: 'not-available' }
  | { type: 'available'; version: string; releaseNotes?: string }
  | { type: 'error'; message: string }

export function interpretLatestRelease(
  res: { status: number; ok: boolean },
  data: { tag_name?: string; name?: string; body?: string; draft?: boolean; prerelease?: boolean } | null,
  currentVersion: string,
  isNewer: (remote: string, current: string) => boolean
): LatestReleaseOutcome {
  // 404 on /releases/latest: nothing published yet, so genuinely up to date.
  if (res.status === 404) return { type: 'not-available' }
  if (!res.ok) {
    const why =
      res.status === 403 || res.status === 429 ? '，GitHub 限流了，稍后再试' : res.status >= 500 ? '，GitHub 暂时不可用' : ''
    return { type: 'error', message: `检查更新失败（HTTP ${res.status}${why}）` }
  }
  if (!data || data.draft || data.prerelease) return { type: 'not-available' }
  const remote = String(data.tag_name || data.name || '').replace(/^v/i, '').trim()
  if (!remote) return { type: 'error', message: '检查更新失败（发布信息里没有版本号）' }
  if (isNewer(remote, currentVersion)) {
    return { type: 'available', version: remote, releaseNotes: typeof data.body === 'string' ? data.body : undefined }
  }
  return { type: 'not-available' }
}

export function checkFailedMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)
  return /timeout|aborted/i.test(raw) ? '检查更新超时，请检查网络后重试' : `检查更新失败：${raw}`
}
