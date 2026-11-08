import { useEffect, useMemo, useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  FileQuestion,
  Folder,
  FolderOpen,
  Loader2,
  RotateCw,
  Star,
  TriangleAlert,
} from 'lucide-react'
import type { FolderEntry, ProjectView } from '../types'
import { fileDate, fileSize } from '../lib/format'
import { friendlyFsError, getDirectoryByPath, listDirectory } from '../lib/fs'
import { fileIconFor } from '../lib/files'
import { baseName, formatFolderPath } from '../lib/paths'
import { Modal } from './Modal'

interface FolderBrowserProps {
  project: ProjectView
  intent: 'browse' | 'pin'
  saving: boolean
  onClose: () => void
  onPreview: (path: string, name: string) => void
  onTogglePin: (path: string, name: string) => Promise<void>
}

type LoadState = 'loading' | 'ready' | 'error'

export function FolderBrowser({
  project,
  intent,
  saving,
  onClose,
  onPreview,
  onTogglePin,
}: FolderBrowserProps) {
  const [segments, setSegments] = useState<string[]>([])
  const [entries, setEntries] = useState<FolderEntry[]>([])
  const [state, setState] = useState<LoadState>('loading')
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [pinning, setPinning] = useState<string | null>(null)

  const pinnedPaths = useMemo(
    () => new Set(project.data.references.map((reference) => reference.path)),
    [project.data.references],
  )

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      if (!project.handle) {
        setState('error')
        setError('项目文件夹不可用')
        return
      }
      setState('loading')
      setSelected(null)
      try {
        const directory = await getDirectoryByPath(project.handle, segments)
        const items = await listDirectory(directory, segments.length === 0)
        if (cancelled) return
        setEntries(items)
        setState('ready')
      } catch (caught) {
        if (cancelled) return
        setError(friendlyFsError(caught))
        setState('error')
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [project.handle, segments, refreshKey])

  const currentPath = segments.join('/')
  const files = entries.filter((entry) => entry.kind === 'file')

  const togglePin = async (path: string, name: string) => {
    if (pinning || saving) return
    setPinning(path)
    try {
      await onTogglePin(path, name)
    } finally {
      setPinning(null)
    }
  }

  const goTo = (depth: number) => {
    setSegments((current) => current.slice(0, depth))
  }

  const title = intent === 'pin' ? '选择重点文件' : '项目文件夹'
  const displayName = baseName(project.folder)

  return (
    <Modal
      title={title}
      eyebrow={formatFolderPath(project.folder, ' / ')}
      onClose={onClose}
      size="wide"
      className="folder-modal"
      footer={
        <>
          <span className="folder-footer__hint">
            {state === 'ready' ? `${entries.length} 项 · 点击文件夹进入，双击文件预览` : '\u00a0'}
          </span>
          <div className="modal__footer-actions">
            <button type="button" className="button button--ghost" onClick={onClose}>
              完成
            </button>
          </div>
        </>
      }
    >
      {intent === 'pin' && (
        <div className="pin-callout">
          <Star size={16} strokeWidth={1.8} />
          <p>
            点击文件右侧的 <strong>星标</strong>，固定到项目总览。可以一次固定多个文件。
          </p>
        </div>
      )}

      <div className="folder-toolbar">
        <button
          type="button"
          className="icon-button icon-button--quiet"
          onClick={() => setSegments((current) => current.slice(0, -1))}
          disabled={segments.length === 0}
          aria-label="返回上一级"
          title="返回上一级"
        >
          <ChevronLeft size={18} strokeWidth={1.8} />
        </button>
        <div className="breadcrumbs" aria-label="当前位置">
          <button type="button" className="breadcrumb" onClick={() => goTo(0)}>
            <FolderOpen size={14} strokeWidth={1.8} />
            {displayName}
          </button>
          {segments.map((segment, index) => (
            <span className="breadcrumb-group" key={`${segment}-${index}`}>
              <ChevronRight size={12} strokeWidth={2} className="breadcrumb__separator" />
              <button
                type="button"
                className={`breadcrumb ${index === segments.length - 1 ? 'is-current' : ''}`}
                onClick={() => goTo(index + 1)}
              >
                {segment}
              </button>
            </span>
          ))}
        </div>
        <button
          type="button"
          className="icon-button icon-button--quiet"
          onClick={() => setRefreshKey((value) => value + 1)}
          aria-label="刷新文件夹"
          title="刷新"
        >
          <RotateCw size={15} strokeWidth={1.8} />
        </button>
      </div>

      <div className="folder-list" aria-label={currentPath || displayName}>
        {state === 'loading' && (
          <div className="folder-loading">
            <Loader2 size={20} className="spin" />
            <span>读取文件夹…</span>
          </div>
        )}

        {state === 'error' && (
          <div className="inline-state">
            <TriangleAlert size={23} strokeWidth={1.7} />
            <strong>无法打开文件夹</strong>
            <p>{error}</p>
            <button
              type="button"
              className="button button--ghost button--compact"
              onClick={() => setRefreshKey((value) => value + 1)}
            >
              重试
            </button>
          </div>
        )}

        {state === 'ready' && entries.length === 0 && (
          <div className="inline-state">
            <FileQuestion size={25} strokeWidth={1.5} />
            <strong>这个文件夹是空的</strong>
            <p>把文件放入项目文件夹后，点击右上角刷新。</p>
          </div>
        )}

        {state === 'ready' &&
          entries.map((entry) => {
            const path = [...segments, entry.name].join('/')
            const isPinned = pinnedPaths.has(path)
            const Icon = entry.kind === 'directory' ? Folder : fileIconFor(entry.name)

            if (entry.kind === 'directory') {
              return (
                <button
                  type="button"
                  className="tree-row tree-row--folder"
                  key={entry.name}
                  onClick={() => setSegments((current) => [...current, entry.name])}
                >
                  <span className="tree-row__icon tree-row__icon--folder">
                    <Icon size={19} strokeWidth={1.6} />
                  </span>
                  <span className="tree-row__name">{entry.name}</span>
                  <span className="tree-row__meta">文件夹</span>
                  <ChevronRight className="tree-row__chevron" size={16} strokeWidth={1.8} />
                </button>
              )
            }

            return (
              <div
                key={entry.name}
                className={`tree-row tree-row--file ${selected === entry.name ? 'is-selected' : ''}`}
                onDoubleClick={() => onPreview(path, entry.name)}
                onClick={() => setSelected(entry.name)}
              >
                <button
                  type="button"
                  className="tree-row__main"
                  onClick={() => setSelected(entry.name)}
                  onDoubleClick={(event) => {
                    event.stopPropagation()
                    onPreview(path, entry.name)
                  }}
                  aria-label={`预览 ${entry.name}`}
                >
                  <span className="tree-row__icon">
                    <Icon size={19} strokeWidth={1.6} />
                  </span>
                  <span className="tree-row__body">
                    <span className="tree-row__name">{entry.name}</span>
                    <span className="tree-row__sub">
                      {fileSize(entry.size)}
                      {entry.lastModified ? ` · ${fileDate(entry.lastModified)}` : ''}
                    </span>
                  </span>
                </button>
                <div
                  className="tree-row__actions"
                  onDoubleClick={(event) => event.stopPropagation()}
                >
                  <button
                    type="button"
                    className="icon-button icon-button--tiny"
                    onClick={(event) => {
                      event.stopPropagation()
                      onPreview(path, entry.name)
                    }}
                    aria-label={`预览 ${entry.name}`}
                    title="预览"
                  >
                    <Eye size={15} strokeWidth={1.8} />
                  </button>
                  <button
                    type="button"
                    className={`icon-button icon-button--tiny pin-button ${isPinned ? 'is-pinned' : ''}`}
                    onClick={(event) => {
                      event.stopPropagation()
                      void togglePin(path, entry.name)
                    }}
                    aria-label={isPinned ? `取消固定 ${entry.name}` : `固定 ${entry.name}`}
                    aria-pressed={isPinned}
                    title={isPinned ? '取消固定' : '固定到项目总览'}
                    disabled={pinning !== null || saving}
                  >
                    {pinning === path ? (
                      <Loader2 size={15} className="spin" />
                    ) : (
                      <Star size={15} strokeWidth={1.8} fill={isPinned ? 'currentColor' : 'none'} />
                    )}
                  </button>
                </div>
              </div>
            )
          })}
      </div>

      {state === 'ready' && files.length > 0 && (
        <div className="folder-summary">
          <span>
            已固定 <strong>{pinnedPaths.size}</strong> 个重点文件
          </span>
          <span className="folder-summary__tip">双击文件可预览</span>
        </div>
      )}
    </Modal>
  )
}
