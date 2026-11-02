import { defineConfig } from 'electron-vite'
import { rendererAlias, rendererPlugins, sharedAlias } from './vite.shared'

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
