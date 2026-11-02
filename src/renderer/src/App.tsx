import { isElectron, runtimePlatform } from '@/lib/bridge'

export default function App() {
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: 32 }}>
      <h1>BotHub</h1>
      <p>Runtime: {isElectron ? `Electron (${runtimePlatform})` : 'Browser'}</p>
    </main>
  )
}
