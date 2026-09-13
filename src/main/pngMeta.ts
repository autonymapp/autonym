import { inflateSync } from 'zlib'

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

/**
 * Extracts embedded tEXt/zTXt/iTXt metadata from a PNG buffer as keyword -> utf8 text.
 * Character card PNGs (SillyTavern/Agnaistic/Chub-style) embed their JSON here under
 * a keyword like "chara" (v2, base64) or "ccv3" (v3, base64), sometimes as iTXt.
 */
export function extractPngText(buffer: Buffer): Record<string, string> {
  const result: Record<string, string> = {}
  if (!buffer.subarray(0, 8).equals(PNG_SIGNATURE)) return result

  let offset = 8
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset)
    const type = buffer.toString('ascii', offset + 4, offset + 8)
    const dataStart = offset + 8
    const dataEnd = dataStart + length
    if (dataEnd > buffer.length) break
    const data = buffer.subarray(dataStart, dataEnd)

    try {
      if (type === 'tEXt') {
        const nullIdx = data.indexOf(0)
        if (nullIdx !== -1) {
          const keyword = data.toString('latin1', 0, nullIdx)
          const text = data.toString('latin1', nullIdx + 1)
          result[keyword] = text
        }
      } else if (type === 'zTXt') {
        const nullIdx = data.indexOf(0)
        if (nullIdx !== -1) {
          const keyword = data.toString('latin1', 0, nullIdx)
          const compressed = data.subarray(nullIdx + 2) // skip null + compression method byte
          const text = inflateSync(compressed).toString('utf8')
          result[keyword] = text
        }
      } else if (type === 'iTXt') {
        let idx = data.indexOf(0)
        const keyword = data.toString('latin1', 0, idx)
        const compressionFlag = data[idx + 1]
        idx += 3 // null + compressionFlag + compressionMethod
        const langNullIdx = data.indexOf(0, idx)
        idx = langNullIdx + 1
        const translatedNullIdx = data.indexOf(0, idx)
        const rest = data.subarray(translatedNullIdx + 1)
        const text = compressionFlag === 1 ? inflateSync(rest).toString('utf8') : rest.toString('utf8')
        result[keyword] = text
      }
    } catch {
      // ignore malformed chunk, keep scanning
    }

    offset = dataEnd + 4 // skip CRC
    if (type === 'IEND') break
  }

  return result
}

function tryBase64Json(text: string): any | null {
  try {
    const decoded = Buffer.from(text, 'base64').toString('utf8')
    return JSON.parse(decoded)
  } catch {
    return null
  }
}

/** Finds and parses an embedded character card JSON payload from PNG metadata. */
export function extractCharacterCardFromPng(buffer: Buffer): any | null {
  const chunks = extractPngText(buffer)
  const preferredKeys = ['ccv3', 'chara', 'character']
  for (const key of preferredKeys) {
    const matchKey = Object.keys(chunks).find((k) => k.toLowerCase() === key)
    if (!matchKey) continue
    const text = chunks[matchKey]
    const viaBase64 = tryBase64Json(text)
    if (viaBase64) return viaBase64
    try {
      return JSON.parse(text)
    } catch {
      // try next candidate
    }
  }
  return null
}
