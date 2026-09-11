/** Rough token estimate: CJK chars ~1 token, latin words ~1.3 */
export function estimateTokens(text: string): number {
  const cjk = (text.match(/[\u3400-\u9fff]/g) || []).length
  const rest = text.replace(/[\u3400-\u9fff]/g, ' ')
  const words = rest.trim().split(/\s+/).filter(Boolean).length
  return Math.ceil(cjk + words * 1.3)
}

export function chunkText(
  text: string,
  opts: { targetTokens?: number; overlapTokens?: number } = {},
): string[] {
  const target = opts.targetTokens ?? 500
  const overlap = opts.overlapTokens ?? 70
  const cleaned = text.replace(/\r\n/g, '\n').trim()
  if (!cleaned) return []
  if (estimateTokens(cleaned) <= target) return [cleaned]

  const paras = cleaned.split(/\n{2,}/)
  const chunks: string[] = []
  let buf = ''
  let bufTok = 0

  const flush = () => {
    if (buf.trim()) chunks.push(buf.trim())
    if (overlap > 0 && buf) {
      const words = buf.split(/(\s+)/)
      let keep = ''
      let kt = 0
      for (let i = words.length - 1; i >= 0; i--) {
        const w = words[i]!
        const t = estimateTokens(w)
        if (kt + t > overlap) break
        keep = w + keep
        kt += t
      }
      buf = keep
      bufTok = kt
    } else {
      buf = ''
      bufTok = 0
    }
  }

  for (const p of paras) {
    const t = estimateTokens(p)
    if (bufTok + t > target && buf) flush()
    if (t > target * 1.5) {
      // hard split long paragraph by sentences-ish
      const parts = p.split(/(?<=[。！？.!?])\s*/)
      for (const part of parts) {
        const pt = estimateTokens(part)
        if (bufTok + pt > target && buf) flush()
        buf = buf ? `${buf}${part}` : part
        bufTok += pt
      }
    } else {
      buf = buf ? `${buf}\n\n${p}` : p
      bufTok += t
    }
  }
  if (buf.trim()) chunks.push(buf.trim())
  return chunks
}
