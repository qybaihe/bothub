export interface GrokColorSpec {
  id: string
  label: string
  value: string
}

export interface GrokMotionHandle {
  attach(els: { host: HTMLElement; canvas: HTMLElement }): () => void
  update(opts: Partial<GrokMotionOptions>): void
  setState(state: string): void
  setBody(body: string): void
  setPlaying(isPlaying: boolean): void
  setExpression(expr: string, opts?: unknown): void
  blink(): void
  look(dir: unknown): void
  restart(): void
  poke(kind: 'spin' | 'bounce' | 'nod', opts?: { turns?: number }): void
  gaze(vec: [number, number] | null): void
}

export interface GrokMotionOptions {
  id?: string
  seed?: string
  body: string
  appearance: unknown
  state?: string
  clip?: unknown
  morph?: string | null
  size: number | string
  fill?: number
  resolution?: number
  maxFrameRate?: number
  isPlaying?: boolean
  isEmphasized?: boolean
  isFollowingPointer?: boolean
  isStatic?: boolean
  isProof?: boolean
}

export const GROK_COLORS: readonly GrokColorSpec[]
export const GROK_NON_BLACK_COLORS: readonly GrokColorSpec[]
export const GROK_STATES: readonly string[]
export const GROK_SHAPES: readonly string[]
export const GROK_ALL_SHAPES: readonly string[]
export const GROK_DEFAULT_SHAPES: readonly string[]

export function isGrokShape(shape: string | null | undefined): boolean
export function defaultColorForSeed(seed: string): string
export function defaultShapeForSeed(seed: string): string
export function getColorLightDark(colorId: string): string
export function getColorForTheme(colorId: string, theme: 'light' | 'dark'): string
export function computeGazeFromRect(
  rect: DOMRect,
  point: { x: number; y: number },
  spanFactor?: number
): [number, number]
export function mapShapeToBody(shape: string): string
export function createAppearance(inkPaint: string, spotPaint?: string): unknown
export function createMotionEngine(opts: GrokMotionOptions): GrokMotionHandle
export function computeCanvasScale(fill: number): number
