import { BrowserWindow } from 'electron'

/** Turns cleaned story Markdown (as produced by exportStory.ts) into a minimal HTML page. */
function storyToHtml(title: string, markdownBody: string): string {
  const paragraphs = markdownBody
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p)}</p>`)
    .join('\n')

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body { font-family: Georgia, 'Times New Roman', serif; font-size: 13pt; line-height: 1.6; color: #1a1a1a; max-width: 680px; margin: 40px auto; }
  h1 { font-size: 22pt; margin-bottom: 24px; }
  p { margin: 0 0 14px; white-space: pre-wrap; }
  strong { font-weight: 700; }
</style>
</head>
<body>
<h1>${escapeHtml(title)}</h1>
${paragraphs}
</body>
</html>`
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
}

/** Renders story text to a PDF buffer via a hidden, offscreen BrowserWindow using
 *  Electron's built-in print-to-PDF — no external PDF library needed. */
export async function exportStoryAsPdf(title: string, markdownBody: string): Promise<Buffer> {
  const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } })
  try {
    const html = storyToHtml(title, markdownBody)
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    return await win.webContents.printToPDF({})
  } finally {
    win.destroy()
  }
}
