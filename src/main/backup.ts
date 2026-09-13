import { app } from 'electron'
import { existsSync } from 'fs'
import { join } from 'path'
import AdmZip from 'adm-zip'

/** Zips app-data.json and the avatars/ folder into a single portable backup file.
 *  Deliberately excludes openrouter.key — a restored encrypted key would just fail to
 *  decrypt on a different machine or profile (safeStorage ties it to the OS/Local State),
 *  so re-entering the key after a restore is the correct behavior, not a gap. */
export function exportBackup(destPath: string): void {
  const userData = app.getPath('userData')
  const zip = new AdmZip()

  const dataFile = join(userData, 'app-data.json')
  if (existsSync(dataFile)) zip.addLocalFile(dataFile)

  const avatarsDir = join(userData, 'avatars')
  if (existsSync(avatarsDir)) zip.addLocalFolder(avatarsDir, 'avatars')

  zip.writeZip(destPath)
}

/** Restores app-data.json and avatars/ from a backup file, overwriting current data.
 *  Caller is responsible for restarting the app afterward — the in-memory store isn't
 *  reloaded until initDb() runs again. */
export function importBackup(sourcePath: string): void {
  const zip = new AdmZip(sourcePath)
  const hasDataFile = zip.getEntries().some((e) => e.entryName === 'app-data.json')
  if (!hasDataFile) {
    throw new Error("That file doesn't look like an Autonym backup — no app-data.json found inside.")
  }
  zip.extractAllTo(app.getPath('userData'), true)
}
