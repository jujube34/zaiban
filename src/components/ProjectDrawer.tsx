import {
  Check,
  ChevronRight,
  FileText,
  FolderOpen,
  Loader2,
  Pencil,
  Plus,
  StopCircle,
  Trash2,
  TriangleAlert,
  X,
} from 'lucide-react'
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from 'react'
import type { ProjectNote, ProjectReference, ProjectView } from '../types'
import { fullDate, noteStamp, relativeTime } from '../lib/format'
import { fileIconFor } from '../lib/files'
import { baseName, formatFolderPath } from '../lib/paths'
import { accentFor, monogramFor } from '../lib/projectVisual'

interface ProjectDrawerProps {
  project: ProjectView
  workspaceName: string
  saving: boolean
  onClose: () => void
  onOpenFolder: () => void
  onAddNote: (body: string) => Promise<boolean>
  onEditNote: (noteId: string, body: string) => Promise<boolean>
  onDeleteNote: (note: ProjectNote) => void
  onAddReference: () => void
  onRemoveReference: (reference: ProjectReference) => Promise<void>
  onPreviewReference: (reference: ProjectReference) => void
  onStopTracking: () => void
}

function isEdited(note: ProjectNote): boolean {
  return new Date(note.updatedAt).getTime() - new Date(note.createdAt).getTime() > 1000
}

export function ProjectDrawer({
  project,
  workspaceName,
  saving,
  onClose,
  onOpenFolder,
  onAddNote,
  onEditNote,
  onDeleteNote,
  onAddReference,
  onRemoveReference,
  onPreviewReference,
  onStopTracking,
}: ProjectDrawerProps) {
  const [draft, setDraft] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [removingRef, setRemovingRef] = useState<string | null>(null)
  const composerRef = useRef<HTMLTextAreaElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const isBroken = Boolean(project.missing || project.loadError)
  const accent = accentFor(project.folder)
  const displayName = baseName(project.folder)

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const frame = window.requestAnimationFrame(() => {
      dialogRef.current?.querySelector<HTMLElement>('[data-modal-close]')?.focus({ preventScroll: true })
    })

    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (document.querySelector('[data-modal-open="true"]')) return
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current()
      }
    }

    const trapFocus = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Tab' || !dialogRef.current) return
      if (document.querySelector('[data-modal-open="true"]')) return
      const elements = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => element.offsetParent !== null)
      if (elements.length === 0) return
      const first = elements[0]
      const last = elements[elements.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('keydown', trapFocus)
    return () => {
      window.cancelAnimationFrame(frame)
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('keydown', trapFocus)
      document.body.style.overflow = previousOverflow
      if (previousFocus && document.contains(previousFocus)) {
        previousFocus.focus({ preventScroll: true })
      }
    }
  }, [])

  useEffect(() => {
    const textarea = composerRef.current
    if (!textarea) return
    textarea.style.height = 'auto'
    textarea.style.height = `${Math.min(textarea.scrollHeight, 220)}px`
  }, [draft])

  const submitNote = async () => {
    const body = draft.trim()
    if (!body || submitting || saving || isBroken) return
    setSubmitting(true)
    try {
      const success = await onAddNote(body)
      if (success) setDraft('')
    } finally {
      setSubmitting(false)
    }
  }

  const handleComposerKey = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault()
      void submitNote()
    }
  }

  const removeReference = async (reference: ProjectReference) => {
    if (removingRef) return
    setRemovingRef(reference.id)
    try {
      await onRemoveReference(reference)
    } finally {
      setRemovingRef(null)
    }
  }

  return (
    <div className="drawer-layer" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <aside
        ref={dialogRef}
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-drawer-title"
        tabIndex={-1}
      >
        <div className="drawer__topbar">
          <span className="drawer__context">
            <span className="drawer__context-mark" style={{ background: accent }} />
            {workspaceName}
            <ChevronRight size={12} strokeWidth={1.8} />
            项目
          </span>
          <button
            type="button"
            className="icon-button icon-button--quiet"
            onClick={onClose}
            aria-label="关闭项目"
            data-modal-close
          >
            <X size={19} strokeWidth={1.8} />
          </button>
        </div>

        <div className="drawer__scroll">
          <header className="project-hero">
            <div
              className="project-hero__mark"
              style={{ '--project-accent': accent } as CSSProperties}
            >
              {monogramFor(displayName)}
            </div>
            <div className="project-hero__body">
              <div className="project-hero__kicker">
                <span className="mini-status"><i />进行中</span>
                <span className="dot-separator" />
                <span>更新于 {relativeTime(project.data.updatedAt)}</span>
              </div>
              <h1 id="project-drawer-title">{displayName}</h1>
              <p className="project-hero__path">
                <FolderOpen size={14} strokeWidth={1.7} />
                {workspaceName} / {formatFolderPath(project.folder, ' / ')}
              </p>
            </div>
            <button type="button" className="drawer-folder-link" onClick={onOpenFolder} disabled={project.missing}>
              <FolderOpen size={15} strokeWidth={1.8} />
              进入文件夹
            </button>
          </header>

          {isBroken && (
            <div className="notice notice--warning">
              <TriangleAlert size={18} strokeWidth={1.8} />
              <div>
                <strong>{project.missing ? '找不到这个项目文件夹' : '无法读取项目记录'}</strong>
                <p>
                  {project.missing
                    ? '文件夹可能已被移动或重命名。你仍可以停止跟踪它。'
                    : project.loadError}
                </p>
              </div>
            </div>
          )}

          {!isBroken && (
            <>
              <section className="composer">
                <div className="composer__head">
                  <span>记录此刻的进展</span>
                  <span className="composer__hint">
                    <kbd>⌘</kbd>
                    <span>/</span>
                    <kbd>Ctrl</kbd>
                    <span>+</span>
                    <kbd>Enter</kbd>
                  </span>
                </div>
                <textarea
                  ref={composerRef}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={handleComposerKey}
                  placeholder="推进了什么？下一步是什么？"
                  rows={3}
                  aria-label="记录项目进展"
                />
                <div className="composer__foot">
                  <span>{draft.trim() ? `${draft.trim().length} 字` : '写给自己，也写给下一次打开项目的你。'}</span>
                  <button
                    type="button"
                    className="button button--primary button--compact"
                    onClick={() => void submitNote()}
                    disabled={!draft.trim() || submitting || saving}
                  >
                    {submitting ? <Loader2 size={15} className="spin" /> : <Check size={15} strokeWidth={2.2} />}
                    {submitting ? '保存中' : '记录'}
                  </button>
                </div>
              </section>

              <section className="drawer-section">
                <div className="section-heading">
                  <h2>进展笔记</h2>
                  <span>{project.data.notes.length} 条</span>
                </div>
                {project.data.notes.length === 0 ? (
                  <div className="section-empty">
                    <span className="section-empty__rule" />
                    <p>第一条笔记，就从刚才的进展开始。</p>
                  </div>
                ) : (
                  <div className="note-list">
                    {project.data.notes.map((note) => (
                      <NoteRow
                        key={note.id}
                        note={note}
                        busy={saving || submitting}
                        onSave={(body) => onEditNote(note.id, body)}
                        onDelete={() => onDeleteNote(note)}
                      />
                    ))}
                  </div>
                )}
              </section>

              <section className="drawer-section drawer-section--files">
                <div className="section-heading">
                  <h2>重点文件</h2>
                  <button
                    type="button"
                    className="text-button text-button--with-icon"
                    onClick={onAddReference}
                  >
                    <Plus size={14} strokeWidth={2} />
                    添加
                  </button>
                </div>
                {project.data.references.length === 0 ? (
                  <button type="button" className="reference-empty" onClick={onAddReference}>
                    <span className="reference-empty__icon"><FileText size={17} strokeWidth={1.7} /></span>
                    <span>
                      <strong>固定一个重要文件</strong>
                      <small>让方案、清单或素材在总览里触手可及</small>
                    </span>
                    <ChevronRight size={16} strokeWidth={1.8} />
                  </button>
                ) : (
                  <div className="reference-list">
                    {project.data.references.map((reference) => {
                      const Icon = fileIconFor(reference.name)
                      return (
                        <div className="reference" key={reference.id}>
                          <button
                            type="button"
                            className="reference__main"
                            onClick={() => onPreviewReference(reference)}
                            title={reference.path}
                          >
                            <span className="reference__icon"><Icon size={17} strokeWidth={1.7} /></span>
                            <span className="reference__body">
                              <strong>{reference.name}</strong>
                              <small>{reference.path}</small>
                            </span>
                            <span className="reference__open">预览</span>
                          </button>
                          <button
                            type="button"
                            className="icon-button icon-button--quiet reference__remove"
                            onClick={() => void removeReference(reference)}
                            aria-label={`取消固定 ${reference.name}`}
                            title="取消固定"
                            disabled={removingRef === reference.id || saving}
                          >
                            {removingRef === reference.id ? (
                              <Loader2 size={15} className="spin" />
                            ) : (
                              <X size={15} />
                            )}
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </section>

              <div className="drawer__record-path">
                <span>记录保存在</span>
                <code>.prjm/project.json</code>
                <span>·</span>
                <span>{fullDate(project.data.createdAt)} 创建</span>
              </div>
            </>
          )}

          <footer className="drawer__actions">
            <button type="button" className="text-button text-button--danger" onClick={onStopTracking}>
              <StopCircle size={15} strokeWidth={1.8} />
              停止跟踪这个项目
            </button>
            <p>只从总览移除，不会删除任何文件。</p>
          </footer>
        </div>
      </aside>
    </div>
  )
}

interface NoteRowProps {
  note: ProjectNote
  busy: boolean
  onSave: (body: string) => Promise<boolean>
  onDelete: () => void
}

function NoteRow({ note, busy, onSave, onDelete }: NoteRowProps) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(note.body)
  const [savingEdit, setSavingEdit] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const isLong = note.body.length > 300 || note.body.split('\n').length > 6

  useEffect(() => {
    setValue(note.body)
  }, [note.body])

  const save = async () => {
    const body = value.trim()
    if (!body || savingEdit) return
    setSavingEdit(true)
    try {
      const success = await onSave(body)
      if (success) setEditing(false)
    } finally {
      setSavingEdit(false)
    }
  }

  return (
    <article className="note">
      <div className="note__rail">
        <span className="note__dot" />
        <span className="note__line" />
      </div>
      <div className="note__content">
        <header className="note__head">
          <span className="note__time">{noteStamp(note.createdAt)}</span>
          {isEdited(note) && <span className="note__edited">已编辑</span>}
          {!editing && (
            <div className="note__actions">
              <button
                type="button"
                className="note__action"
                onClick={() => setEditing(true)}
                aria-label="编辑这条笔记"
                title="编辑"
                disabled={busy}
              >
                <Pencil size={14} strokeWidth={1.8} />
              </button>
              <button
                type="button"
                className="note__action note__action--danger"
                onClick={onDelete}
                aria-label="删除这条笔记"
                title="删除"
                disabled={busy}
              >
                <Trash2 size={14} strokeWidth={1.8} />
              </button>
            </div>
          )}
        </header>

        {editing ? (
          <div className="note-editor">
            <textarea
              value={value}
              onChange={(event) => setValue(event.target.value)}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                  event.preventDefault()
                  void save()
                }
                if (event.key === 'Escape') {
                  event.stopPropagation()
                  setEditing(false)
                  setValue(note.body)
                }
              }}
              rows={4}
              aria-label="编辑笔记"
              autoFocus
            />
            <div className="note-editor__actions">
              <button
                type="button"
                className="button button--ghost button--compact"
                onClick={() => {
                  setEditing(false)
                  setValue(note.body)
                }}
                disabled={savingEdit}
              >
                取消
              </button>
              <button
                type="button"
                className="button button--primary button--compact"
                onClick={() => void save()}
                disabled={!value.trim() || savingEdit}
              >
                {savingEdit ? <Loader2 size={14} className="spin" /> : null}
                {savingEdit ? '保存中' : '保存修改'}
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className={`note__text ${isLong && !expanded ? 'is-clamped' : ''}`}>{note.body}</p>
            {isLong && (
              <button type="button" className="note__expand" onClick={() => setExpanded((value) => !value)}>
                {expanded ? '收起' : '展开全部'}
              </button>
            )}
          </>
        )}
      </div>
    </article>
  )
}
