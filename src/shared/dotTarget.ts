/**
 * Which Dot profile/room a send goes to.
 *
 * The stored account (updated by selectDot in the main process) is the
 * source of truth. The renderer may still hold the previous profile's
 * dot/room (cached by the adapter or persisted as the chat sessionId), so a
 * request naming another dot than the active one is treated as stale.
 */
export function resolveDotTarget(
  req: { dotId?: string; roomId?: string },
  acc: { activeDotId?: string; roomId?: string } | undefined | null
): { dotId?: string; roomId?: string } {
  const active = acc?.activeDotId
  if (active && req.dotId && req.dotId !== active) {
    return { dotId: active, roomId: acc?.roomId }
  }
  if (active && !req.dotId && req.roomId && acc?.roomId && req.roomId !== acc.roomId) {
    // A bare room id from an old session: follow the active profile.
    return { dotId: active, roomId: acc.roomId }
  }
  return { dotId: req.dotId ?? active, roomId: req.roomId ?? acc?.roomId }
}
