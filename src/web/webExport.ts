import JSZip from 'jszip'
import type { LoreEntry, LoreEntryInput, Lorebook, LorebookInput } from '@shared/types'
import { buildStarterPackFile, parseStarterPackFile } from '@shared/starterPacks'
import type { Store } from './webDb'
import { saveLocalAvatar } from './webStorage'
import { uploadAvatarToCloud } from './supabaseClient'

export function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function openFilePicker(accept: string, multiple = false): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.multiple = multiple
    input.style.display = 'none'

    input.onchange = () => {
      const files = input.files ? Array.from(input.files) : []
      document.body.removeChild(input)
      resolve(files)
    }

    input.oncancel = () => {
      document.body.removeChild(input)
      resolve([])
    }

    document.body.appendChild(input)
    input.click()
  })
}

/** Exports app-data.json and avatars as an Autonym-compatible ZIP backup. */
export async function exportWebBackup(store: Store): Promise<boolean> {
  const zip = new JSZip()
  zip.file('app-data.json', JSON.stringify(store, null, 2))

  const avatarsFolder = zip.folder('avatars')
  if (avatarsFolder) {
    for (const character of store.characters) {
      if (character.avatarPath && character.avatarPath.startsWith('data:')) {
        const commaIdx = character.avatarPath.indexOf(',')
        if (commaIdx !== -1) {
          const base64 = character.avatarPath.slice(commaIdx + 1)
          const ext = character.avatarPath.includes('jpeg') ? 'jpg' : 'png'
          const filename = `${character.id}.${ext}`
          avatarsFolder.file(filename, base64, { base64: true })
        }
      }
    }
  }

  const content = await zip.generateAsync({ type: 'blob' })
  const dateStr = new Date().toISOString().slice(0, 10)
  triggerDownload(content, `autonym-backup-${dateStr}.zip`)
  return true
}

/** Imports an Autonym backup (ZIP or raw JSON) and restores characters, avatars, and chats. */
export async function importWebBackup(): Promise<{ store: Store } | null> {
  const files = await openFilePicker('.zip,.json')
  if (!files || files.length === 0) return null

  const file = files[0]

  if (file.name.endsWith('.json')) {
    const text = await file.text()
    const parsed = JSON.parse(text)
    if (!parsed || typeof parsed !== 'object' || !parsed.nextId) {
      throw new Error("Invalid Autonym JSON backup file — missing store structure.")
    }
    return { store: parsed as Store }
  }

  // Handle ZIP backup
  const zip = await JSZip.loadAsync(file)
  const dataFile = zip.file('app-data.json')
  if (!dataFile) {
    throw new Error("That file doesn't look like an Autonym backup — no app-data.json found inside.")
  }

  const dataText = await dataFile.async('text')
  const store = JSON.parse(dataText) as Store

  // Extract avatar images if present
  const avatarEntries = Object.keys(zip.files).filter(
    (name) => name.startsWith('avatars/') && !zip.files[name].dir
  )

  for (const entryName of avatarEntries) {
    const fileEntry = zip.files[entryName]
    const base64 = await fileEntry.async('base64')
    const mime = entryName.endsWith('.jpg') || entryName.endsWith('.jpeg') ? 'image/jpeg' : 'image/png'
    const dataUrl = `data:${mime};base64,${base64}`

    const baseName = entryName.replace(/^avatars\//, '')
    // Save to local IndexedDB avatar store
    await saveLocalAvatar(baseName, dataUrl)
    // Also upload to cloud if Supabase is connected
    uploadAvatarToCloud(dataUrl, baseName).catch(() => {})
  }

  return { store }
}

export function exportStoryMarkdown(defaultFilename: string, content: string): boolean {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
  triggerDownload(blob, defaultFilename.endsWith('.md') ? defaultFilename : `${defaultFilename}.md`)
  return true
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function storyToXhtml(title: string, markdownBody: string): string {
  const paragraphs = markdownBody
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escapeXml(p).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')}</p>`)
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>${escapeXml(title)}</title></head>
<body>
<h1>${escapeXml(title)}</h1>
${paragraphs}
</body>
</html>`
}

/** Generates a valid EPUB 2 file in the browser using JSZip. */
export async function exportStoryEpub(defaultFilename: string, title: string, markdownBody: string): Promise<boolean> {
  const zip = new JSZip()
  const bookId = 'urn:uuid:' + Math.random().toString(36).substring(2) + Date.now().toString(36)

  // 1. mimetype (must be uncompressed)
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' })

  // 2. container.xml
  zip.file(
    'META-INF/container.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`
  )

  // 3. content.opf
  zip.file(
    'OEBPS/content.opf',
    `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="BookId" version="2.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>${escapeXml(title)}</dc:title>
    <dc:language>en</dc:language>
    <dc:identifier id="BookId">${bookId}</dc:identifier>
  </metadata>
  <manifest>
    <item id="chapter1" href="chapter1.xhtml" media-type="application/xhtml+xml"/>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
  </manifest>
  <spine toc="ncx">
    <itemref idref="chapter1"/>
  </spine>
</package>`
  )

  // 4. toc.ncx
  zip.file(
    'OEBPS/toc.ncx',
    `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="${bookId}"/>
  </head>
  <docTitle><text>${escapeXml(title)}</text></docTitle>
  <navMap>
    <navPoint id="chapter1" playOrder="1">
      <navLabel><text>${escapeXml(title)}</text></navLabel>
      <content src="chapter1.xhtml"/>
    </navPoint>
  </navMap>
</ncx>`
  )

  // 5. chapter1.xhtml
  zip.file('OEBPS/chapter1.xhtml', storyToXhtml(title, markdownBody))

  const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/epub+zip' })
  const filename = defaultFilename.endsWith('.epub') ? defaultFilename : `${defaultFilename}.epub`
  triggerDownload(blob, filename)
  return true
}

export function exportStoryPdf(title: string, markdownBody: string): boolean {
  const paragraphs = markdownBody
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escapeXml(p).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')}</p>`)
    .join('\n')

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${escapeXml(title)}</title>
<style>
  body { font-family: Georgia, 'Times New Roman', serif; font-size: 13pt; line-height: 1.6; color: #1a1a1a; max-width: 680px; margin: 40px auto; }
  h1 { font-size: 22pt; margin-bottom: 24px; }
  p { margin: 0 0 14px; white-space: pre-wrap; }
  strong { font-weight: 700; }
  @media print {
    body { margin: 20mm; max-width: none; }
  }
</style>
</head>
<body>
<h1>${escapeXml(title)}</h1>
${paragraphs}
<script>
  window.onload = function() {
    window.print();
  };
</script>
</body>
</html>`

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const printWindow = window.open(url, '_blank')
  if (!printWindow) {
    triggerDownload(blob, `${title}.html`)
  }
  return true
}

export function exportStarterPackJson(lorebook: Lorebook, entries: LoreEntry[]): boolean {
  const content = buildStarterPackFile(lorebook, entries)
  const blob = new Blob([JSON.stringify(content, null, 2)], { type: 'application/json;charset=utf-8' })
  triggerDownload(blob, `${lorebook.name.toLowerCase().replace(/\s+/g, '-')}-starter-pack.json`)
  return true
}

export async function importStarterPackJson(): Promise<{
  lorebook: LorebookInput
  entries: Omit<LoreEntryInput, 'lorebookId'>[]
} | null> {
  const files = await openFilePicker('.json')
  if (!files || files.length === 0) return null
  const text = await files[0].text()
  return parseStarterPackFile(text)
}
