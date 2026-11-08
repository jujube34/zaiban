const ACCENTS = ['#B45C3B', '#3F6B4F', '#9A7532', '#4B6786', '#775B7B', '#3D7470', '#8A5A43']

export function accentFor(name: string): string {
  let hash = 0
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) % 997
  return ACCENTS[hash % ACCENTS.length]
}

export function monogramFor(name: string): string {
  const cleaned = name.replace(/[._-]+/g, ' ').trim()
  if (!cleaned) return '·'
  if (/[\u3400-\u9fff]/.test(cleaned)) {
    return Array.from(cleaned.replace(/\s/g, '')).slice(0, 2).join('')
  }
  const words = cleaned.split(/\s+/).filter(Boolean)
  if (words.length >= 2) return `${words[0][0]}${words[1][0]}`.toUpperCase()
  return Array.from(cleaned).slice(0, 2).join('').toUpperCase()
}
