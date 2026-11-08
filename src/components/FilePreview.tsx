import { useEffect, useState } from 'react'
import {
  Check,
  Copy,
  Download,
  FileQuestion,
  Loader2,
  TriangleAlert,
} from 'lucide-react'
import type { PreviewTarget, ProjectView } from '../types'
import { fileSize } from '../lib/format'
import { friendlyFsError, getFileByPath } from '../lib/fs'
import { fileIconFor, previewKind, type PreviewKind } from '../lib/files'
import { Modal } from './Modal'

interface FilePreviewProps {
  project: ProjectView
  target: PreviewTarget
  onClose: () => void
}

interface LoadedFile {
  file: File
  kind: PreviewKind
  text?: string
  url?: string
  truncated?: boolean
}

const TEXT_LIMIT = 512 * 1024

export function FilePreview({ project, target, onClose }: FilePreviewProps) {
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState('')
  const [loaded, setLoaded] = useState<LoadedFile | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let cancelled = false
    let objectUrl: string | null = null
    setState('loading')
    setLoaded(null)
    setError('')
    setCopied(false)

    const load = async () => {
      if (!project.handle) {
        setError('项目文件夹不可用')
        setState('error')
        return
      }

      try {
        const handle = await getFileByPath(project.handle, target.path)
        const file = await handle.getFile()
        if (cancelled) return

        const kind = previewKind(file.name || target.name, file.type)
        const next: LoadedFile = { file, kind }

        if (kind === 'text') {
          const slice = file.slice(0, TEXT_LIMIT)
          next.text = await slice.text()
          next.truncated = file.size > TEXT_LIMIT
        }

        if (kind === 'image' || kind === 'pdf' || kind === 'audio' || kind === 'video') {
          objectUrl = URL.createObjectURL(file)
          next.url = objectUrl
        }

        if (!cancelled) {
          setLoaded(next)
          setState('ready')
        }
      } catch (caught) {
        if (cancelled) return
        setError(friendlyFsError(caught))
        setState('error')
      }
    }

    void load()
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [project.handle, target.path, target.name])

  const download = () => {
    if (!loaded) return
    const url = URL.createObjectURL(loaded.file)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = loaded.file.name || target.name
    document.body.append(anchor)
    anchor.click()
    anchor.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
  }

  const copyText = async () => {
    if (!loaded?.text) return
    try {
      await navigator.clipboard.writeText(loaded.text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }

  const FileIcon = loaded ? fileIconFor(loaded.file.name) : fileIconFor(target.name)

  return (
    <Modal
      title={target.name}
      eyebrow={target.path}
      onClose={onClose}
      size="preview"
      className="preview-modal"
      footer={
        <>
          <span className="preview-meta">
            {loaded ? (
              <>
                <FileIcon size={14} strokeWidth={1.8} />
                <span>{fileSize(loaded.file.size)}</span>
              </>
            ) : (
              '加载文件信息…'
            )}
          </span>
          <div className="modal__footer-actions">
            {loaded?.kind === 'text' && loaded.text && (
              <button type="button" className="button button--ghost button--compact" onClick={copyText}>
                {copied ? <Check size={15} /> : <Copy size={15} />}
                {copied ? '已复制' : '复制文本'}
              </button>
            )}
            {loaded && (
              <button type="button" className="button button--outline button--compact" onClick={download}>
                <Download size={15} strokeWidth={1.8} />
                下载
              </button>
            )}
            <button type="button" className="button button--ghost" onClick={onClose}>
              关闭
            </button>
          </div>
        </>
      }
    >
      {state === 'loading' && (
        <div className="preview-loading">
          <Loader2 size={22} className="spin" />
          <span>打开文件…</span>
        </div>
      )}

      {state === 'error' && (
        <div className="preview-error">
          <TriangleAlert size={28} strokeWidth={1.6} />
          <strong>无法预览这个文件</strong>
          <p>{error}</p>
          <p className="preview-error__path">{target.path}</p>
        </div>
      )}

      {state === 'ready' && loaded && (
        <div className={`preview-content preview-content--${loaded.kind}`}>
          {loaded.kind === 'image' && loaded.url && (
            <div className="preview-image">
              <img src={loaded.url} alt={target.name} />
            </div>
          )}

          {loaded.kind === 'pdf' && loaded.url && (
            <iframe className="preview-pdf" src={loaded.url} title={`PDF 预览：${target.name}`} />
          )}

          {loaded.kind === 'video' && loaded.url && (
            <div className="preview-media">
              <video src={loaded.url} controls preload="metadata" />
            </div>
          )}

          {loaded.kind === 'audio' && loaded.url && (
            <div className="preview-audio">
              <FileIcon size={34} strokeWidth={1.4} />
              <span>{target.name}</span>
              <audio src={loaded.url} controls preload="metadata" />
            </div>
          )}

          {loaded.kind === 'text' && (
            <div className="preview-text">
              {loaded.truncated && (
                <div className="preview-text__notice">文件较大，仅显示前 512 KB。下载后可查看完整内容。</div>
              )}
              <pre>{loaded.text}</pre>
            </div>
          )}

          {loaded.kind === 'binary' && (
            <div className="preview-binary">
              <span className="preview-binary__icon"><FileQuestion size={30} strokeWidth={1.4} /></span>
              <strong>{target.name}</strong>
              <button type="button" className="button button--primary button--compact" onClick={download}>
                <Download size={15} strokeWidth={1.8} />
                下载文件
              </button>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}
