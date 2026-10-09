/**
 * Extracts embedded tEXt/zTXt/iTXt metadata from a PNG ArrayBuffer as keyword -> utf8 text.
 * Character card PNGs (SillyTavern/Agnaistic/Chub-style) embed their JSON here under
 * keywords like "chara" (v2, base64) or "ccv3" (v3, base64), sometimes as iTXt.
 */

async function decompressDeflate(bytes: Uint8Array): Promise<string> {
  // If DecompressionStream is available (all modern browsers)
  if (typeof DecompressionStream !== 'undefined') {
    try {
      const ds = new DecompressionStream('deflate')
      const writer = ds.writable.getWriter()
      writer.write(bytes as any)
      writer.close()
      const response = new Response(ds.readable)
      return await response.text()
    } catch {
      // If header is raw deflate without zlib wrapper, try 'deflate-raw'
      try {
        const dsRaw = new DecompressionStream('deflate-raw')
        const writer = dsRaw.writable.getWriter()
        writer.write(bytes as any)
        writer.close()
        const response = new Response(dsRaw.readable)
        return await response.text()
      } catch (err) {
        console.warn('DecompressionStream failed:', err)
      }
    }
  }
  return ''
}

export async function extractPngText(buffer: ArrayBuffer | Uint8Array): Promise<Record<string, string>> {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
  const result: Record<string, string> = {}

  // Check PNG signature [137, 80, 78, 71, 13, 10, 26, 10]
  if (
    bytes.length < 8 ||
    bytes[0] !== 137 ||
    bytes[1] !== 80 ||
    bytes[2] !== 78 ||
    bytes[3] !== 71 ||
    bytes[4] !== 13 ||
    bytes[5] !== 10 ||
    bytes[6] !== 26 ||
    bytes[7] !== 10
  ) {
    return result
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const decoder = new TextDecoder('utf-8')
  const latin1Decoder = new TextDecoder('iso-8859-1')
  let offset = 8

  while (offset + 8 <= bytes.length) {
    const length = view.getUint32(offset, false)
    const type = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7])
    const dataStart = offset + 8
    const dataEnd = dataStart + length
    if (dataEnd > bytes.length) break

    const data = bytes.subarray(dataStart, dataEnd)

    try {
      if (type === 'tEXt') {
        const nullIdx = data.indexOf(0)
        if (nullIdx !== -1) {
          const keyword = latin1Decoder.decode(data.subarray(0, nullIdx))
          const text = latin1Decoder.decode(data.subarray(nullIdx + 1))
          result[keyword] = text
        }
      } else if (type === 'zTXt') {
        const nullIdx = data.indexOf(0)
        if (nullIdx !== -1) {
          const keyword = latin1Decoder.decode(data.subarray(0, nullIdx))
          const compressed = data.subarray(nullIdx + 2) // skip null and compression method byte
          const text = await decompressDeflate(compressed)
          if (text) result[keyword] = text
        }
      } else if (type === 'iTXt') {
        let idx = data.indexOf(0)
        const keyword = latin1Decoder.decode(data.subarray(0, idx))
        const compressionFlag = data[idx + 1]
        idx += 3 // null + compressionFlag + compressionMethod
        const langNullIdx = data.indexOf(0, idx)
        idx = langNullIdx + 1
        const translatedNullIdx = data.indexOf(0, idx)
        const rest = data.subarray(translatedNullIdx + 1)
        if (compressionFlag === 1) {
          const text = await decompressDeflate(rest)
          if (text) result[keyword] = text
        } else {
          result[keyword] = decoder.decode(rest)
        }
      }
    } catch (e) {
      // Skip malformed chunk
    }

    offset = dataEnd + 4 // Skip CRC
    if (type === 'IEND') break
  }

  return result
}

function tryBase64Json(text: string): any | null {
  try {
    const decoded = atob(text)
    return JSON.parse(decoded)
  } catch {
    return null
  }
}

/** Finds and parses an embedded character card JSON payload from PNG metadata in browser. */
export async function extractCharacterCardFromPng(buffer: ArrayBuffer | Uint8Array): Promise<any | null> {
  const chunks = await extractPngText(buffer)
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
