import { isElectron, runtimePlatform } from '@/lib/bridge'

export default function App() {
  return (
    <main className="grid h-full place-items-center">
      <div className="rounded-2xl border border-line bg-surface p-8 shadow-card">
        <h1 className="text-lg font-semibold tracking-tight">BotHub</h1>
        <p className="mt-1 text-ink-muted">
          Runtime: {isElectron ? `Electron (${runtimePlatform})` : 'Browser'}
        </p>
        <span className="mt-4 inline-flex rounded-full bg-accent-50 px-2.5 py-1 text-caption font-medium text-accent-700">
          Design tokens loaded
        </span>
      </div>
    </main>
  )
}
