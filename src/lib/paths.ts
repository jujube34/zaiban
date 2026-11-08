export function baseName(path: string): string {
  const parts = path.split('/').filter(Boolean)
  return parts.length > 0 ? parts[parts.length - 1] : path
}

export function parentPath(path: string): string {
  const parts = path.split('/').filter(Boolean)
  parts.pop()
  return parts.join('/')
}

export function formatFolderPath(path: string, separator = ' / '): string {
  return path.split('/').filter(Boolean).join(separator)
}

export function compactFolderPath(
  path: string,
  maxSegments = 2,
  separator = ' / ',
): string {
  const parts = path.split('/').filter(Boolean)
  if (parts.length <= maxSegments) return parts.join(separator)
  return `…${separator}${parts.slice(-maxSegments).join(separator)}`
}
