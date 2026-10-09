import { createWebApi } from './webApi'
import { initDb } from './webDb'

export async function initWebApi(): Promise<void> {
  if (typeof window !== 'undefined' && !(window as any).api) {
    console.log('Initializing Autonym Web API Adapter...')
    await initDb()
    ;(window as any).api = createWebApi()
    ;(window as any).__autonym_is_web = true
    console.log('Autonym Web API Adapter ready.')
  }
}
