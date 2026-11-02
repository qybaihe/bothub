import { defineConfig } from 'electron-vite'
import { rendererAlias, rendererPlugins, sharedAlias } from './vite.shared.mts'

export default defineConfig({
  main: {
    resolve: { alias: sharedAlias }
  },
  preload: {
    resolve: { alias: sharedAlias }
  },
  renderer: {
    resolve: { alias: rendererAlias },
    plugins: rendererPlugins()
  }
})
