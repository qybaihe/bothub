export interface GrokMainAuth {
  accountId: string
  accessToken: string
  accountSlot?: string
  teamId?: string
  machineId?: string
}

const auths = new Map<string, GrokMainAuth>()

export function getGrokMainAuth(accountId: string): GrokMainAuth | undefined {
  return auths.get(accountId)
}

export function setGrokMainAuth(auth: GrokMainAuth): void {
  auths.set(auth.accountId, auth)
}

export function clearGrokMainAuth(accountId: string): void {
  auths.delete(accountId)
}
