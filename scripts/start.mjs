import { cp } from 'node:fs/promises'
import { spawn } from 'node:child_process'

// Same standalone asset staging as Homerun; this app has no public assets.
await cp('.next/static', '.next/standalone/.next/static', { recursive: true })
const child = spawn(process.execPath, ['.next/standalone/server.js'], {
  stdio: 'inherit',
  env: { ...process.env, HOSTNAME: process.env.HOST || '127.0.0.1', PORT: process.env.PORT || '3020' },
})
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal))
child.on('exit', code => process.exit(code ?? 1))
