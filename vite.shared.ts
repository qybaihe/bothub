import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import type { PluginOption } from 'vite'

/**
 * Renderer build settings shared by the Electron build (electron.vite.config.ts)
 * and the browser-only build (vite.web.config.ts), so both stay in sync.
 */
export const rendererRoot = resolve('src/renderer')

export const rendererAlias = {
  '@': resolve('src/renderer/src'),
  '@adapters': resolve('src/adapters'),
  '@shared': resolve('src/shared')
}

export const sharedAlias = {
  '@shared': resolve('src/shared')
}

export function rendererPlugins(): PluginOption[] {
  return [react()]
}
