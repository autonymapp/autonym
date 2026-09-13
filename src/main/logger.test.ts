import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

let logsDir: string

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => (name === 'logs' ? logsDir : join(logsDir, name))
  }
}))

async function freshLogger() {
  vi.resetModules()
  logsDir = mkdtempSync(join(tmpdir(), 'autonym-logger-test-'))
  return import('./logger')
}

afterEach(() => {
  rmSync(logsDir, { recursive: true, force: true })
})

describe('logger', () => {
  it('writes an ERROR line with the context and message', async () => {
    const { logError } = await freshLogger()
    logError('test-context', new Error('boom'))
    const content = readFileSync(join(logsDir, 'main.log'), 'utf-8')
    expect(content).toContain('[ERROR]')
    expect(content).toContain('test-context')
    expect(content).toContain('boom')
  })

  it('writes an INFO line', async () => {
    const { logInfo } = await freshLogger()
    logInfo('something happened')
    const content = readFileSync(join(logsDir, 'main.log'), 'utf-8')
    expect(content).toContain('[INFO]')
    expect(content).toContain('something happened')
  })

  it('handles a non-Error thrown value without crashing', async () => {
    const { logError } = await freshLogger()
    expect(() => logError('ctx', 'a plain string error')).not.toThrow()
    const content = readFileSync(join(logsDir, 'main.log'), 'utf-8')
    expect(content).toContain('a plain string error')
  })

  it('truncates the log instead of growing unbounded once it exceeds the size cap', async () => {
    const { logInfo } = await freshLogger()
    // Prime a large existing log file past the 2MB cap.
    writeFileSync(join(logsDir, 'main.log'), 'x'.repeat(3 * 1024 * 1024))
    logInfo('after truncation')
    const size = statSync(join(logsDir, 'main.log')).size
    // Should have been truncated before this new line was appended, not left at 3MB+.
    expect(size).toBeLessThan(1024)
  })

  it('never throws even if the logs directory cannot be created', async () => {
    vi.resetModules()
    vi.doMock('electron', () => ({
      app: {
        getPath: () => {
          throw new Error('no filesystem access')
        }
      }
    }))
    const { logError, logInfo } = await import('./logger')
    expect(() => logError('ctx', new Error('boom'))).not.toThrow()
    expect(() => logInfo('info')).not.toThrow()
  })
})
