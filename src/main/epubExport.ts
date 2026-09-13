import AdmZip from 'adm-zip'
import { randomUUID } from 'crypto'

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

/** Hand-builds a minimal, valid EPUB 2 file as a zip — no EPUB library needed, just the
 *  already-installed adm-zip. An EPUB is a zip with a mandatory uncompressed "mimetype"
 *  entry, an OPF manifest/spine, an NCX table of contents, and the chapter content itself. */
export function exportStoryAsEpub(title: string, markdownBody: string): Buffer {
  // noSort is required: adm-zip sorts entries alphabetically by default, which would bury
  // "mimetype" behind "META-INF/..." — the EPUB spec requires it to be the first entry.
  const zip = new AdmZip(undefined, { noSort: true })
  const bookId = randomUUID()

  zip.addFile('mimetype', Buffer.from('application/epub+zip', 'utf-8'))

  zip.addFile(
    'META-INF/container.xml',
    Buffer.from(
      `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`,
      'utf-8'
    )
  )

  zip.addFile(
    'OEBPS/content.opf',
    Buffer.from(
      `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="BookId" version="2.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>${escapeXml(title)}</dc:title>
    <dc:language>en</dc:language>
    <dc:identifier id="BookId">urn:uuid:${bookId}</dc:identifier>
  </metadata>
  <manifest>
    <item id="chapter1" href="chapter1.xhtml" media-type="application/xhtml+xml"/>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
  </manifest>
  <spine toc="ncx">
    <itemref idref="chapter1"/>
  </spine>
</package>`,
      'utf-8'
    )
  )

  zip.addFile(
    'OEBPS/toc.ncx',
    Buffer.from(
      `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="urn:uuid:${bookId}"/>
  </head>
  <docTitle><text>${escapeXml(title)}</text></docTitle>
  <navMap>
    <navPoint id="chapter1" playOrder="1">
      <navLabel><text>${escapeXml(title)}</text></navLabel>
      <content src="chapter1.xhtml"/>
    </navPoint>
  </navMap>
</ncx>`,
      'utf-8'
    )
  )

  zip.addFile('OEBPS/chapter1.xhtml', Buffer.from(storyToXhtml(title, markdownBody), 'utf-8'))

  // The mimetype entry must be stored uncompressed and first in the archive, per the EPUB spec.
  const mimetypeEntry = zip.getEntries().find((e) => e.entryName === 'mimetype')
  if (mimetypeEntry) mimetypeEntry.header.method = 0

  return zip.toBuffer()
}
