import { useEffect, useId, useMemo, useRef } from 'react'
import type { ConnectionStatus } from '@adapters/types'
import { cn } from '@/lib/cn'
import {
  computeCanvasScale,
  createAppearance,
  createMotionEngine,
  defaultColorForSeed,
  defaultShapeForSeed,
  isGrokShape,
  mapShapeToBody,
  type GrokMotionHandle
} from './grokMotionEngine'

/**
 * Official Grok Bot ("Sand") animated 3D character mark (`GrokBotMark`).
 *
 * Driven directly by the extracted Grok Bot 0.78.4 Motion Lab 3D engine
 * (`grokMotionEngine.js`): real 3D meshes, quaternion rotation, keyframe
 * state machine (`idle`, `working`, `streaming`, `thinking`, `blocked`,
 * `sleeping`, `happy`), 3D eye capsule morphing, prop animations (`dots`,
 * `orbit`, `bang`, `pencil`), and `poke('spin' | 'bounce' | 'nod')`.
 */

export const BOT_SHAPES = [
  'blob',
  'pebble',
  'bean',
  'egg',
  'squircle',
  'tablet',
  'capsule',
  'cylinder',
  'hex',
  'gem',
  'crystal',
  'wedge',
  'shield',
  'dome',
  'arch',
  'cloud',
  'teardrop',
  'leaf',
  'square',
  'sparkle',
  'clover',
  'flower',
  'heart',
  'house',
  'star',
  'pumpkin'
] as const

export type BotShape = (typeof BOT_SHAPES)[number]

/**
 * Exact Grok Bot `AHe` (`--sand-bg-*-bright`) + `dr` color table.
 */
export const BOT_COLORS = [
  { id: 'black', label: 'Black', light: '#000000', dark: '#FFFFFF', swatch: '#000000' },
  { id: 'brown', label: 'Brown', light: '#a06b39', dark: '#a16b39', swatch: '#936439' },
  { id: 'red', label: 'Red', light: '#fb2b3e', dark: '#fc2c3e', swatch: '#FF263C' },
  { id: 'orange', label: 'Orange', light: '#fd690f', dark: '#f9670e', swatch: '#FF6700' },
  { id: 'yellow', label: 'Yellow', light: '#f59312', dark: '#f69412', swatch: '#FF9800' },
  { id: 'green', label: 'Green', light: '#14c16f', dark: '#14c370', swatch: '#00C972' },
  { id: 'cyan', label: 'Cyan', light: '#13b7a2', dark: '#13b8a3', swatch: '#00BCA6' },
  { id: 'blue', label: 'Blue', light: '#1e86fc', dark: '#1884fc', swatch: '#1084FE' },
  { id: 'violet', label: 'Violet', light: '#8f59f9', dark: '#905afb', swatch: '#9159FE' },
  { id: 'magenta', label: 'Magenta', light: '#f93498', dark: '#fb3499', swatch: '#FF309B' },
  { id: 'gray', label: 'Gray', light: '#959595', dark: '#777777', swatch: '#777777' }
] as const

export type BotColorId = (typeof BOT_COLORS)[number]['id']

export function resolveBotShape(seed: string, shape?: string | null): BotShape {
  if (shape && isGrokShape(shape)) return shape as BotShape
  if (seed === 'bothub-brand' || seed === 'grok-bot') return 'blob'
  return (defaultShapeForSeed(seed) as BotShape) || 'blob'
}

export function resolveBotColor(seed: string, color?: string | null): BotColorId {
  if (color && BOT_COLORS.some((c) => c.id === color)) return color as BotColorId
  if (seed === 'bothub-brand' || seed === 'grok-bot') return 'black'
  return (defaultColorForSeed(seed) as BotColorId) || 'blue'
}

export function getBotColorHex(colorId: BotColorId, isDark = false): string {
  const found = BOT_COLORS.find((c) => c.id === colorId) ?? BOT_COLORS[0]
  return isDark ? found.dark : found.light
}

const DEFAULT_APPEARANCE = createAppearance('var(--grok-bot-ink)')
const DEFAULT_FILL = 0.92
const CANVAS_PCT = `${computeCanvasScale(DEFAULT_FILL) * 100}%`

export interface GrokBotMarkProps {
  seed: string
  shape?: string | null
  color?: string | null
  status?: ConnectionStatus
  /** True when the bot is actively streaming / working. */
  isWorking?: boolean
  /** Explicit Grok state override (`idle`, `working`, `streaming`, `thinking`, `happy`, `blocked`, `sleeping`, …). */
  grokState?: string
  /** Pause continuous idle animation (like picker grid cells in Grok Bot). */
  isPaused?: boolean
  /** Emphasize motion (e.g. when selected). */
  isEmphasized?: boolean
  /** Normalized gaze [-1..1, -1..1] from row hover. */
  gaze?: [number, number] | null
  /** Follow window pointer automatically (used in hero / intro / editor). */
  followPointer?: boolean
  /** Trigger a spin/bounce animation when bumped. */
  pokeSignal?: number
  sizePx?: number
  className?: string
}

export function GrokBotMark({
  seed,
  shape: shapeProp,
  color: colorProp,
  status = 'online',
  isWorking = false,
  grokState,
  isPaused = false,
  isEmphasized = false,
  gaze,
  followPointer = false,
  pokeSignal = 0,
  sizePx = 36,
  className
}: GrokBotMarkProps) {
  const uid = `motion-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const hostRef = useRef<HTMLSpanElement>(null)
  const canvasRef = useRef<HTMLSpanElement>(null)
  const engineRef = useRef<GrokMotionHandle | null>(null)
  const prevPoke = useRef(pokeSignal)

  const shape = useMemo(() => resolveBotShape(seed, shapeProp), [seed, shapeProp])
  const colorId = useMemo(
    () => (shape === 'pumpkin' && !colorProp ? 'orange' : resolveBotColor(seed, colorProp)),
    [seed, shape, colorProp]
  )
  const body = useMemo(() => mapShapeToBody(shape), [shape])

  const state = useMemo(() => {
    if (grokState) return grokState
    if (isWorking || status === 'busy') return 'working'
    if (status === 'attention') return 'blocked'
    if (status === 'error') return 'failed'
    if (status === 'offline') return 'idle'
    return 'idle'
  }, [grokState, isWorking, status])

  const playing = !isPaused && status !== 'offline'

  // Instantiate the official Grok Bot Motion Engine once per component instance
  if (!engineRef.current) {
    engineRef.current = createMotionEngine({
      id: uid,
      seed,
      body,
      appearance: DEFAULT_APPEARANCE,
      state,
      size: sizePx,
      fill: DEFAULT_FILL,
      maxFrameRate: 60,
      isPlaying: playing,
      isEmphasized,
      isFollowingPointer: followPointer,
      isStatic: false
    })
  }

  // Attach host + canvas DOM elements
  useEffect(() => {
    const host = hostRef.current
    const canvas = canvasRef.current
    const engine = engineRef.current
    if (!host || !canvas || !engine) return
    return engine.attach({ host, canvas })
  }, [])

  // Keep engine options synchronized
  useEffect(() => {
    engineRef.current?.update({
      id: uid,
      body,
      appearance: DEFAULT_APPEARANCE,
      state,
      size: sizePx,
      fill: DEFAULT_FILL,
      maxFrameRate: 60,
      isPlaying: playing,
      isEmphasized,
      isFollowingPointer: followPointer
    })
  }, [uid, body, state, sizePx, playing, isEmphasized, followPointer])

  // Forward row-hover gaze vector to the 3D rig
  useEffect(() => {
    if (followPointer) return
    engineRef.current?.gaze(gaze ?? null)
  }, [gaze, followPointer])

  // Trigger official 3D spin / bounce poke on signal bump
  useEffect(() => {
    if (pokeSignal !== prevPoke.current) {
      prevPoke.current = pokeSignal
      engineRef.current?.poke('spin')
      engineRef.current?.poke('bounce')
    }
  }, [pokeSignal])

  const isDark = typeof document !== 'undefined' && document.documentElement.dataset.theme === 'dark'
  const inkHex = getBotColorHex(colorId, isDark)

  return (
    <span
      ref={hostRef}
      aria-hidden
      onClick={() => {
        engineRef.current?.poke('bounce')
      }}
      data-grok-state={state}
      data-paused={!playing || undefined}
      style={
        {
          width: sizePx,
          height: sizePx,
          '--grok-bot-ink': inkHex
        } as React.CSSProperties
      }
      className={cn(
        'sand-grok-bot-mark relative inline-block shrink-0 select-none leading-none',
        status === 'offline' && 'opacity-40',
        className
      )}
    >
      <span
        ref={canvasRef}
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: CANVAS_PCT,
          height: CANVAS_PCT,
          transform: 'translate(-50%, -50%)',
          pointerEvents: 'none'
        }}
      />
    </span>
  )
}
