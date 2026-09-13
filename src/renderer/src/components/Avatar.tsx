import { useEffect, useState } from 'react'
import type { AvatarType } from '@shared/types'

function initialsFor(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}

export default function Avatar({
  avatarType,
  src,
  emoji,
  name,
  size = 40
}: {
  avatarType?: AvatarType
  src: string | null
  emoji?: string | null
  name: string
  size?: number
}): JSX.Element {
  const resolvedType: AvatarType = avatarType ?? (src ? 'image' : 'monogram')
  // <img src="file://..."> gets blocked when the renderer itself isn't loaded from
  // file:// (true in dev), so the image is read and converted to a data URL instead —
  // this works identically in dev and in the packaged app.
  const [dataUrl, setDataUrl] = useState<string | null>(null)

  useEffect(() => {
    if (resolvedType !== 'image' || !src) {
      setDataUrl(null)
      return
    }
    let cancelled = false
    window.api.characters.readImageAsDataUrl(src).then((result) => {
      if (!cancelled) setDataUrl(result)
    })
    return () => {
      cancelled = true
    }
  }, [resolvedType, src])

  if (resolvedType === 'image' && src) {
    if (!dataUrl) {
      return (
        <div className="avatar" style={{ width: size, height: size, fontSize: size * 0.4, opacity: 0.5 }}>
          {initialsFor(name)}
        </div>
      )
    }
    return (
      <img
        src={dataUrl}
        alt={name}
        className="avatar"
        style={{ width: size, height: size }}
      />
    )
  }

  if (resolvedType === 'emoji' && emoji) {
    return (
      <div className="avatar" style={{ width: size, height: size, fontSize: size * 0.55 }}>
        {emoji}
      </div>
    )
  }

  return (
    <div className="avatar" style={{ width: size, height: size, fontSize: size * 0.4 }}>
      {initialsFor(name)}
    </div>
  )
}
