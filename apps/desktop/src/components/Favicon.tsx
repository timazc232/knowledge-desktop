import { useMemo, useState } from 'react'

type Props = {
  url?: string | null
  favicon?: string | null
  title?: string | null
  size?: number
  className?: string
}

function domainFrom(url?: string | null): string {
  if (!url) return ''
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

function googleFavicon(url?: string | null, sz = 64): string | null {
  const host = domainFrom(url)
  if (!host) return null
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=${sz}`
}

function letterFrom(title?: string | null, url?: string | null): string {
  const t = (title || domainFrom(url) || '?').trim()
  return (t[0] || '?').toUpperCase()
}

export default function Favicon({ url, favicon, title, size = 20, className = '' }: Props) {
  const sources = useMemo(() => {
    const list: string[] = []
    if (favicon) list.push(favicon)
    const g = googleFavicon(url)
    if (g) list.push(g)
    return list
  }, [favicon, url])

  const [idx, setIdx] = useState(0)
  const src = sources[idx]
  const letter = letterFrom(title, url)

  if (!src || idx >= sources.length) {
    return (
      <span
        className={`inline-flex shrink-0 items-center justify-center rounded-[8px] bg-white/10 text-[10px] font-semibold text-white/70 ${className}`}
        style={{ width: size, height: size }}
        aria-hidden
      >
        {letter}
      </span>
    )
  }

  return (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      className={`shrink-0 rounded-[7px] object-contain bg-white/5 ${className}`}
      style={{ width: size, height: size }}
      onError={() => setIdx((i) => i + 1)}
      draggable={false}
    />
  )
}
