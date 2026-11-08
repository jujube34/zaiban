import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Check,
  ChevronRight,
  Folder,
  Loader2,
  RotateCw,
  Search,
  TriangleAlert,
} from 'lucide-react'
import type { ProjectCandidate } from '../types'
import { relativeTime } from '../lib/format'
import { friendlyFsError, scanProjectFolders } from '../lib/fs'
import { Modal } from './Modal'

interface AddProjectsModalProps {
  root: FileSystemDirectoryHandle
  trackedFolders: string[]
  onClose: () => void
  onAdd: (candidates: ProjectCandidate[]) => Promise<boolean>
}

type ScanState = 'loading' | 'ready' | 'error'

export function AddProjectsModal({ root, trackedFolders, onClose, onAdd }: AddProjectsModalProps) {
  const [scanState, setScanState] = useState<ScanState>('loading')
  const [candidates, setCandidates] = useState<ProjectCandidate[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')
  const [adding, setAdding] = useState(false)
  const requestId = useRef(0)

  const load = async () => {
    const id = ++requestId.current
    setScanState('loading')
    setError('')
    try {
      const results = await scanProjectFolders(root, trackedFolders)
      if (requestId.current !== id) return
      setCandidates(results)
      setScanState('ready')
    } catch (caught) {
      if (requestId.current !== id) return
      setError(friendlyFsError(caught))
      setScanState('error')
    }
  }

  useEffect(() => {
    void load()
    return () => {
      requestId.current += 1
    }
    // The list is intentionally scanned once each time this modal opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const visibleCandidates = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return candidates
    return candidates.filter((candidate) => candidate.folder.toLowerCase().includes(normalized))
  }, [candidates, query])

  const visibleSelectable = visibleCandidates.filter((candidate) => !candidate.error)

  const toggle = (folder: string) => {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(folder)) next.delete(folder)
      else next.add(folder)
      return next
    })
  }

  const toggleAll = () => {
    const allVisibleSelected =
      visibleSelectable.length > 0 &&
      visibleSelectable.every((candidate) => selected.has(candidate.folder))
    setSelected((current) => {
      const next = new Set(current)
      for (const candidate of visibleSelectable) {
        if (allVisibleSelected) next.delete(candidate.folder)
        else next.add(candidate.folder)
      }
      return next
    })
  }

  const addSelected = async () => {
    if (adding) return
    const chosen = candidates.filter((candidate) => selected.has(candidate.folder) && !candidate.error)
    if (chosen.length === 0) return
    setAdding(true)
    try {
      const success = await onAdd(chosen)
      if (success) onClose()
    } finally {
      setAdding(false)
    }
  }

  const allSelected =
    visibleSelectable.length > 0 &&
    visibleSelectable.every((candidate) => selected.has(candidate.folder))

  return (
    <Modal
      title="添加进行中的项目"
      eyebrow={`工作目录 · ${root.name}`}
      onClose={onClose}
      className="add-projects"
      footer={
        <>
          <span className="modal__selection">
            已选择 <strong>{selected.size}</strong> 个项目
          </span>
          <div className="modal__footer-actions">
            <button type="button" className="button button--ghost" onClick={onClose} disabled={adding}>
              取消
            </button>
            <button
              type="button"
              className="button button--primary"
              onClick={addSelected}
              disabled={selected.size === 0 || adding}
            >
              {adding ? <Loader2 size={17} className="spin" /> : null}
              {adding ? '正在添加…' : `添加${selected.size > 0 ? ` ${selected.size} 个` : ''}`}
            </button>
          </div>
        </>
      }
    >
      <p className="modal__intro">
        勾选此刻正在进行的文件夹。之后随时可以继续添加，或停止跟踪某个项目。
      </p>

      <div className="candidate-toolbar">
        <label className="search-field search-field--compact">
          <Search size={16} strokeWidth={1.8} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索文件夹"
            aria-label="搜索文件夹"
            data-autofocus
          />
        </label>
        <button
          type="button"
          className="text-button"
          onClick={toggleAll}
          disabled={scanState !== 'ready' || visibleSelectable.length === 0}
        >
          {allSelected ? '取消全选' : '全选'}
        </button>
      </div>

      <div className="candidate-list">
        {scanState === 'loading' && (
          <div className="candidate-loading">
            {[0, 1, 2, 3].map((item) => (
              <div className="candidate-skeleton" key={item}>
                <span className="skeleton skeleton--icon" />
                <span className="candidate-skeleton__text">
                  <span className="skeleton skeleton--line" />
                  <span className="skeleton skeleton--short" />
                </span>
              </div>
            ))}
          </div>
        )}

        {scanState === 'error' && (
          <div className="inline-state">
            <TriangleAlert size={22} strokeWidth={1.7} />
            <strong>无法读取项目列表</strong>
            <p>{error}</p>
            <button type="button" className="button button--ghost button--compact" onClick={load}>
              <RotateCw size={15} />
              重试
            </button>
          </div>
        )}

        {scanState === 'ready' && candidates.length === 0 && (
          <div className="inline-state">
            <Folder size={24} strokeWidth={1.5} />
            <strong>这里还没有可添加的项目</strong>
            <p>把正在进行的项目文件夹放进工作目录，再重新打开这个窗口。</p>
          </div>
        )}

        {scanState === 'ready' && candidates.length > 0 && visibleCandidates.length === 0 && (
          <div className="inline-state inline-state--small">
            <strong>没有找到「{query.trim()}」</strong>
            <p>换一个关键词试试。</p>
          </div>
        )}

        {scanState === 'ready' &&
          visibleCandidates.map((candidate) => {
            const isSelected = selected.has(candidate.folder)
            const noteCount = candidate.existing?.notes.length ?? 0
            const hasExisting = candidate.existing !== null
            return (
              <button
                type="button"
                key={candidate.folder}
                className={`candidate ${isSelected ? 'is-selected' : ''} ${candidate.error ? 'is-disabled' : ''}`}
                role="checkbox"
                aria-checked={isSelected}
                disabled={Boolean(candidate.error)}
                onClick={() => toggle(candidate.folder)}
              >
                <span className="candidate__check" aria-hidden="true">
                  {isSelected && <Check size={13} strokeWidth={2.6} />}
                </span>
                <span className="candidate__folder" aria-hidden="true">
                  <Folder size={18} strokeWidth={1.6} />
                </span>
                <span className="candidate__body">
                  <strong>{candidate.folder}</strong>
                  <span className={candidate.error ? 'candidate__error' : ''}>
                    {candidate.error ? (
                      <>
                        <TriangleAlert size={12} /> 记录文件无法读取，已跳过
                      </>
                    ) : hasExisting ? (
                      <>
                        {noteCount > 0 ? `已有 ${noteCount} 条笔记` : '已有项目记录'}
                        {candidate.existing?.updatedAt
                          ? ` · ${relativeTime(candidate.existing.updatedAt)}`
                          : ''}
                      </>
                    ) : (
                      '新项目 · 尚无记录'
                    )}
                  </span>
                </span>
                <ChevronRight className="candidate__chevron" size={16} strokeWidth={1.8} />
              </button>
            )
          })}
      </div>
    </Modal>
  )
}
