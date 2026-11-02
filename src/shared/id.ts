let counter = 0

/**
 * Short, sortable-enough unique id. Avoids `crypto.randomUUID()`, which is
 * unavailable in some non-secure browser contexts.
 */
export function createId(prefix: string): string {
  counter = (counter + 1) % 0x10000
  const time = Date.now().toString(36)
  const rand = Math.random().toString(36).slice(2, 8)
  return `${prefix}_${time}${counter.toString(36)}${rand}`
}
