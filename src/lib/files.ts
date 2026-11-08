import type { LucideIcon } from 'lucide-react'
import {
  File,
  FileArchive,
  FileAudio,
  FileCode2,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Presentation,
} from 'lucide-react'

export type PreviewKind = 'text' | 'image' | 'pdf' | 'audio' | 'video' | 'binary'

const CODE_EXTENSIONS = new Set([
  'js',
  'jsx',
  'ts',
  'tsx',
  'json',
  'html',
  'htm',
  'css',
  'scss',
  'sass',
  'less',
  'vue',
  'svelte',
  'py',
  'rb',
  'go',
  'rs',
  'java',
  'kt',
  'swift',
  'c',
  'h',
  'cpp',
  'hpp',
  'cs',
  'php',
  'sh',
  'bash',
  'zsh',
  'ps1',
  'sql',
  'yml',
  'yaml',
  'toml',
  'xml',
  'ini',
  'env',
  'gitignore',
])

const TEXT_EXTENSIONS = new Set([
  'txt',
  'md',
  'markdown',
  'mdx',
  'log',
  'csv',
  'tsv',
  'rtf',
  'tex',
  ...CODE_EXTENSIONS,
])

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif', 'bmp', 'ico'])
const AUDIO_EXTENSIONS = new Set(['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac'])
const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'mov', 'm4v', 'ogv'])

export function extensionOf(name: string): string {
  const match = /\.([^.]+)$/.exec(name)
  return match ? match[1].toLowerCase() : ''
}

export function previewKind(name: string, mime = ''): PreviewKind {
  const extension = extensionOf(name)
  if (mime === 'application/pdf' || extension === 'pdf') return 'pdf'
  if (mime.startsWith('image/') || IMAGE_EXTENSIONS.has(extension)) return 'image'
  if (mime.startsWith('audio/') || AUDIO_EXTENSIONS.has(extension)) return 'audio'
  if (mime.startsWith('video/') || VIDEO_EXTENSIONS.has(extension)) return 'video'
  if (mime.startsWith('text/') || TEXT_EXTENSIONS.has(extension)) return 'text'
  if (mime === 'application/json' || mime === 'application/xml') return 'text'
  if (!mime && !extension) return 'text'
  return 'binary'
}

export function fileIconFor(name: string): LucideIcon {
  const extension = extensionOf(name)
  if (IMAGE_EXTENSIONS.has(extension)) return FileImage
  if (AUDIO_EXTENSIONS.has(extension)) return FileAudio
  if (VIDEO_EXTENSIONS.has(extension)) return FileVideo
  if (extension === 'pdf' || extension === 'doc' || extension === 'docx' || extension === 'txt' || extension === 'md') {
    return FileText
  }
  if (extension === 'xls' || extension === 'xlsx' || extension === 'csv') return FileSpreadsheet
  if (extension === 'ppt' || extension === 'pptx' || extension === 'key') return Presentation
  if (extension === 'zip' || extension === 'rar' || extension === '7z' || extension === 'tar' || extension === 'gz') {
    return FileArchive
  }
  if (CODE_EXTENSIONS.has(extension)) return FileCode2
  return File
}
