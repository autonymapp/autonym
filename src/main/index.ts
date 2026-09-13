import { app, shell, BrowserWindow, Menu, MenuItem } from 'electron'
import { autoUpdater } from 'electron-updater'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { initDb } from './db'
import { registerIpcHandlers } from './ipc'
import { logError, logInfo } from './logger'

let mainWindow: BrowserWindow | null = null

// Without these, an unexpected throw outside an ipcMain.handle callback (during startup, in a
// timer, etc.) crashes the whole app silently with no diagnostic trail left behind.
process.on('uncaughtException', (err) => logError('uncaughtException', err))
process.on('unhandledRejection', (err) => logError('unhandledRejection', err))

/** Pins userData to a stable folder independent of the package name, so a future rename
 *  can never again point Electron at a different (empty) folder than the one already
 *  holding a user's data. */
function pinUserDataDir(): void {
  app.setPath('userData', join(app.getPath('appData'), 'Autonym'))
}

function setUpSpellCheckContextMenu(window: BrowserWindow): void {
  window.webContents.on('context-menu', (_event, params) => {
    const menu = new Menu()

    for (const suggestion of params.dictionarySuggestions) {
      menu.append(
        new MenuItem({
          label: suggestion,
          click: () => window.webContents.replaceMisspelling(suggestion)
        })
      )
    }
    if (params.misspelledWord) {
      if (params.dictionarySuggestions.length > 0) menu.append(new MenuItem({ type: 'separator' }))
      menu.append(
        new MenuItem({
          label: 'Add to Dictionary',
          click: () => window.webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord)
        })
      )
    }
    if (params.dictionarySuggestions.length > 0 || params.misspelledWord) {
      menu.append(new MenuItem({ type: 'separator' }))
    }

    if (params.isEditable) {
      menu.append(new MenuItem({ label: 'Cut', role: 'cut', enabled: params.editFlags.canCut }))
      menu.append(new MenuItem({ label: 'Copy', role: 'copy', enabled: params.editFlags.canCopy }))
      menu.append(new MenuItem({ label: 'Paste', role: 'paste', enabled: params.editFlags.canPaste }))
      menu.append(new MenuItem({ type: 'separator' }))
      menu.append(
        new MenuItem({ label: 'Select All', role: 'selectAll', enabled: params.editFlags.canSelectAll })
      )
    } else if (params.selectionText) {
      menu.append(new MenuItem({ label: 'Copy', role: 'copy' }))
    }

    if (menu.items.length > 0) menu.popup()
  })
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    // In a packaged build, electron-builder embeds build/icon.ico directly into the .exe,
    // so Windows shows it automatically. This only matters for `npm run dev`, where the
    // window would otherwise show Electron's default icon.
    ...(is.dev ? { icon: join(__dirname, '../../build/icon.png') } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: true
    }
  })

  setUpSpellCheckContextMenu(mainWindow)

  mainWindow.on('ready-to-show', () => {
    if (!mainWindow) return
    mainWindow.show()
    // On Windows, a window created by a background process can appear on screen
    // without actually taking OS keyboard focus (the "foreground lock"). A plain
    // show()/focus() doesn't bypass that; app.focus({ steal: true }) does.
    if (process.platform === 'win32') {
      app.focus({ steal: true })
    }
    mainWindow.focus()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function setUpAutoUpdate(): void {
  // No-op in dev — checking for updates against a real release feed only makes sense for a
  // packaged build the user actually installed.
  if (is.dev) return
  autoUpdater.on('error', (err) => logError('autoUpdater', err))
  autoUpdater.on('update-available', (info) => logInfo(`Update available: ${info.version}`))
  autoUpdater.on('update-downloaded', (info) => logInfo(`Update downloaded: ${info.version}`))
  autoUpdater.checkForUpdatesAndNotify().catch((err) => logError('checkForUpdatesAndNotify', err))
}

// Must run before whenReady() — Electron only allows overriding the userData path
// prior to the ready event, since some subsystems initialize against it at ready time.
pinUserDataDir()

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.local.autonym')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  initDb()
  registerIpcHandlers(() => mainWindow)

  createWindow()
  setUpAutoUpdate()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
