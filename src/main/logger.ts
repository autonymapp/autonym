import { app } from 'electron'
import { appendFileSync, existsSync, mkdirSync, statSync, truncateSync } from 'fs'
import { join } from 'path'

const MAX_LOG_BYTES = 2 * 1024 * 1024 // 2 MB — plenty for a personal app, cheap to cap

function logPath(): string {
  const dir = app.getPath('logs')
  mkdirSync(dir, { recursive: true })
  return join(dir, 'main.log')
}

function write(level: string, message: string): void {
  try {
    const path = logPath()
    if (existsSync(path) && statSync(path).size > MAX_LOG_BYTES) {
      truncateSync(path, 0)
    }
    const line = `[${new Date().toISOString()}] [${level}] ${message}\n`
    appendFileSync(path, line, 'utf-8')
  } catch {
    // Logging must never itself crash the app.
  }
}

export function logError(context: string, err: unknown): void {
  const message = err instanceof Error ? (err.stack ?? err.message) : String(err)
  write('ERROR', `${context}: ${message}`)
}

export function logInfo(message: string): void {
  write('INFO', message)
}
