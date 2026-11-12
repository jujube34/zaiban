import { useEffect, useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Folder,
  FolderOpen,
  Loader2,
  RotateCw,
  TriangleAlert,
} from 'lucide-react'
import { createDesktopRootHandle, desktopInvoke } from '../lib/desktop'
import { friendlyFsError } from '../lib/fs'
import { Modal } from './Modal'

interface WorkspacePickerProps {
  busy: boolean
  onClose: () => void
  onSelect: (path: string) => void
}

type LoadState = 'loading' | 'ready' | 'error'

const STORAGE_ROOT = '/storage/emulated/0'
const collator = new Intl.Collator('zh-CN', { numeric: true, sensitivity: 'base' })

function parentOf(path: string): string | null {
  const trimmed = path.replace(/\/+$/, '')
  if (!trimmed || trimmed === '/') return null
  const index = trimmed.lastIndexOf('/')
  return index <= 0 ? '/' : trimmed.slice(0, index)
}

function childOf(path: string, name: string): string {
  return `${path.replace(/\/+$/, '')}/${name}`
}

export function WorkspacePicker({ busy, onClose, onSelect }: WorkspacePickerProps) {
  const [path, setPath] = useState(STORAGE_ROOT)
  const [directories, setDirectories] = useState<string[]>([])
  const [state, setState] = useState<LoadState>('loading')
  const [error, setError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setState('loading')
      try {
        const handle = createDesktopRootHandle(path)
        const names: string[] = []
        for await (const [name, child] of handle.entries()) {
          if (child.kind === 'directory' && !name.startsWith('.')) names.push(name)
        }
        if (cancelled) return
        names.sort((left, right) => collator.compare(left, right))
        setDirectories(names)
        setError('')
        setState('ready')
      } catch (caught) {
        if (cancelled) return
        setDirectories([])
        setError(friendlyFsError(caught))
        setState('error')
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [path, refreshKey])

  // 未授予「所有文件访问」时内部存储不可读，退回主进程探测到的工作目录。
  useEffect(() => {
    if (path !== STORAGE_ROOT || state !== 'error') return
    let cancelled = false
    void desktopInvoke<string | null>('pick_workspace_directory')
      .then((fallback) => {
        if (!cancelled && fallback && fallback !== STORAGE_ROOT) setPath(fallback)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [path, state])

  const parent = parentOf(path)

  return (
    <Modal
      title="选择工作目录"
      eyebrow="手机存储"
      onClose={onClose}
      size="wide"
      className="folder-modal"
      footer={
        <>
          <span className="folder-footer__hint">
            {state === 'ready' ? `${directories.length} 个文件夹` : '\u00a0'}
          </span>
          <div className="modal__footer-actions">
            <button type="button" className="button button--ghost" onClick={onClose}>
              取消
            </button>
            <button
              type="button"
              className="button button--primary"
              onClick={() => onSelect(path)}
              disabled={busy || state !== 'ready'}
            >
              {busy ? <Loader2 size={17} className="spin" /> : <FolderOpen size={17} strokeWidth={1.8} />}
              <span>使用此文件夹</span>
            </button>
          </div>
        </>
      }
    >
      <div className="folder-toolbar">
        <button
          type="button"
          className="icon-button icon-button--quiet"
          onClick={() => {
            if (parent) setPath(parent)
          }}
          disabled={!parent}
          aria-label="返回上一级"
          title="返回上一级"
        >
          <ChevronLeft size={18} strokeWidth={1.8} />
        </button>
        <div className="breadcrumbs" aria-label="当前位置">
          <span className="breadcrumb is-current">{path}</span>
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

      <div className="folder-list" aria-label={path}>
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

        {state === 'ready' && directories.length === 0 && (
          <div className="inline-state">
            <Folder size={24} strokeWidth={1.5} />
            <strong>没有子文件夹</strong>
            <p>可以直接使用当前文件夹</p>
          </div>
        )}

        {state === 'ready' &&
          directories.map((name) => (
            <button
              type="button"
              className="tree-row tree-row--folder"
              key={name}
              onClick={() => setPath(childOf(path, name))}
            >
              <span className="tree-row__icon tree-row__icon--folder">
                <Folder size={19} strokeWidth={1.6} />
              </span>
              <span className="tree-row__name">{name}</span>
              <span className="tree-row__meta">文件夹</span>
              <ChevronRight className="tree-row__chevron" size={16} strokeWidth={1.8} />
            </button>
          ))}
      </div>
    </Modal>
  )
}
