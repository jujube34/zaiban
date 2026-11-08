import {
  Check,
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
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
} from 'react'
import type {
  DraftNoteImage,
  NoteImage,
  ProjectNote,
  ProjectReference,
  ProjectView,
} from '../types'
import { fullDate, noteStamp } from '../lib/format'
import { fileIconFor } from '../lib/files'
import { getProjectStoredFile, makeId } from '../lib/fs'
import { formatFolderPath } from '../lib/paths'
import { ResizableImage } from './ResizableImage'

interface ProjectDetailsProps {
  project: ProjectView
  saving: boolean
  onAddNote: (body: string, images: DraftNoteImage[]) => Promise<boolean>
  onEditNote: (noteId: string, body: string) => Promise<boolean>
  onDeleteNote: (note: ProjectNote) => void
  onResizeNoteImage: (noteId: string, imageId: string, width: number) => Promise<boolean>
  onAddReference: () => void
  onRemoveReference: (reference: ProjectReference) => Promise<void>
  onPreviewReference: (reference: ProjectReference) => void
  onStopTracking: () => void
}

function isEdited(note: ProjectNote): boolean {
  return new Date(note.updatedAt).getTime() - new Date(note.createdAt).getTime() > 1000
}

export function ProjectDetails({
  project,
  saving,
  onAddNote,
  onEditNote,
  onDeleteNote,
  onResizeNoteImage,
  onAddReference,
  onRemoveReference,
  onPreviewReference,
  onStopTracking,
}: ProjectDetailsProps) {
  const [draft, setDraft] = useState('')
  const [draftImages, setDraftImages] = useState<DraftNoteImage[]>([])
  const [dragging, setDragging] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [removingRef, setRemovingRef] = useState<string | null>(null)
  const composerRef = useRef<HTMLTextAreaElement>(null)
  const imageUrls = useRef<Set<string>>(new Set())
  const dragDepth = useRef(0)
  const isBroken = Boolean(project.missing || project.loadError)
  const hasContent = draft.trim().length > 0 || draftImages.length > 0

  useEffect(() => {
    const textarea = composerRef.current
    if (!textarea) return
    textarea.style.height = 'auto'
    textarea.style.height = `${Math.min(textarea.scrollHeight, 220)}px`
  }, [draft])

  useEffect(
    () => () => {
      for (const url of imageUrls.current) URL.revokeObjectURL(url)
      imageUrls.current.clear()
    },
    [],
  )

  const addImages = (files: FileList | File[]) => {
    const images = Array.from(files).filter((file) => file.type.startsWith('image/'))
    if (images.length === 0) return
    const drafts: DraftNoteImage[] = images.map((file) => {
      const url = URL.createObjectURL(file)
      imageUrls.current.add(url)
      return {
        id: makeId(),
        file,
        url,
        name: file.name || 'image',
        width: 420,
      }
    })
    setDraftImages((current) => [...current, ...drafts])

    for (const draft of drafts) {
      const preview = new Image()
      preview.onload = () => {
        if (preview.naturalWidth <= 0) return
        const width = Math.min(480, preview.naturalWidth)
        setDraftImages((current) =>
          current.map((image) => (image.id === draft.id ? { ...image, width } : image)),
        )
      }
      preview.src = draft.url
    }
  }

  const releaseImages = () => {
    for (const url of imageUrls.current) URL.revokeObjectURL(url)
    imageUrls.current.clear()
    setDraftImages([])
  }

  const removeImage = (id: string) => {
    setDraftImages((current) => {
      const image = current.find((item) => item.id === id)
      if (image) {
        URL.revokeObjectURL(image.url)
        imageUrls.current.delete(image.url)
      }
      return current.filter((item) => item.id !== id)
    })
  }

  const resizeImage = (id: string, width: number) => {
    setDraftImages((current) =>
      current.map((image) => (image.id === id ? { ...image, width } : image)),
    )
  }

  const submitNote = async () => {
    if (!hasContent || submitting || saving || isBroken) return
    setSubmitting(true)
    try {
      const success = await onAddNote(draft.trim(), draftImages)
      if (success) {
        setDraft('')
        releaseImages()
      }
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

  const handlePaste = (event: ClipboardEvent<HTMLDivElement>) => {
    let images = Array.from(event.clipboardData.files).filter((file) =>
      file.type.startsWith('image/'),
    )
    if (images.length === 0) {
      images = Array.from(event.clipboardData.items)
        .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
        .map((item) => item.getAsFile())
        .filter((file): file is File => Boolean(file))
    }
    if (images.length > 0) {
      event.preventDefault()
      addImages(images)
    }
  }

  const handleDragEnter = (event: DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.types.includes('Files')) return
    event.preventDefault()
    dragDepth.current += 1
    setDragging(true)
  }

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.types.includes('Files')) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
  }

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    dragDepth.current = Math.max(0, dragDepth.current - 1)
    if (dragDepth.current === 0) setDragging(false)
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    dragDepth.current = 0
    setDragging(false)
    addImages(event.dataTransfer.files)
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
    <section
      className={`project-details ${isBroken ? 'project-details--broken' : ''}`}
      aria-label={`${formatFolderPath(project.folder, ' / ')} 的笔记与重点文件`}
    >
      <div className="project-details__main">
        {isBroken ? (
          <div className="notice notice--warning">
            <TriangleAlert size={18} strokeWidth={1.8} />
            <div>
              <strong>{project.missing ? '找不到这个项目文件夹' : '无法读取项目记录'}</strong>
              <p>
                {project.missing
                  ? '文件夹可能已被移动或重命名。'
                  : project.loadError}
              </p>
            </div>
          </div>
        ) : (
          <>
            <div
              className={`composer ${dragging ? 'is-dragging' : ''}`}
              onDragEnter={handleDragEnter}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onPaste={handlePaste}
            >
              <textarea
                ref={composerRef}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={handleComposerKey}
                rows={1}
                aria-label="记录项目进展"
              />

              {draftImages.length > 0 && (
                <div className="composer__images">
                  {draftImages.map((image) => (
                    <ResizableImage
                      key={image.id}
                      src={image.url}
                      alt={image.name}
                      width={image.width}
                      onResize={(width) => resizeImage(image.id, width)}
                      onRemove={() => removeImage(image.id)}
                    />
                  ))}
                </div>
              )}

              <div className="composer__foot">
                <div className="composer__tools">
                  {draft.trim() && (
                    <span className="composer__count">{draft.trim().length} 字</span>
                  )}
                </div>
                <button
                  type="button"
                  className="button button--primary button--compact"
                  onClick={() => void submitNote()}
                  disabled={!hasContent || submitting || saving}
                >
                  {submitting ? <Loader2 size={15} className="spin" /> : <Check size={15} strokeWidth={2.2} />}
                  {submitting ? '保存中' : '记录'}
                </button>
              </div>
            </div>

            <section className="details-section">
              <div className="section-heading">
                <h2>全部笔记</h2>
                <span>{project.data.notes.length} 条</span>
              </div>
              {project.data.notes.length > 0 && (
                <div className="note-list">
                  {project.data.notes.map((note) => (
                    <NoteRow
                      key={note.id}
                      note={note}
                      projectHandle={project.handle}
                      busy={saving || submitting}
                      onSave={(body) => onEditNote(note.id, body)}
                      onDelete={() => onDeleteNote(note)}
                      onResizeImage={(imageId, width) =>
                        void onResizeNoteImage(note.id, imageId, width)
                      }
                    />
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>

      <aside className="project-details__side">
        <section className="details-section details-section--files">
          <div className="section-heading">
            <h2>重点文件</h2>
            <button
              type="button"
              className="text-button text-button--with-icon"
              onClick={onAddReference}
              disabled={isBroken}
            >
              <Plus size={14} strokeWidth={2} />
              添加
            </button>
          </div>
          {project.data.references.length > 0 && (
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

        <div className="project-details__meta">
          <div>
            <span>完整路径</span>
            <code title={formatFolderPath(project.folder, ' / ')}>
              {formatFolderPath(project.folder, ' / ')}
            </code>
          </div>
          <div>
            <span>记录文件</span>
            <code>.prjm/project.json</code>
          </div>
          <div>
            <span>创建于</span>
            <span>{fullDate(project.data.createdAt)}</span>
          </div>
        </div>

        <div className="project-details__footer">
          <button type="button" className="text-button text-button--danger" onClick={onStopTracking}>
            <StopCircle size={15} strokeWidth={1.8} />
            停止跟踪这个项目
          </button>
        </div>
      </aside>
    </section>
  )
}

interface NoteRowProps {
  note: ProjectNote
  projectHandle: FileSystemDirectoryHandle | null
  busy: boolean
  onSave: (body: string) => Promise<boolean>
  onDelete: () => void
  onResizeImage: (imageId: string, width: number) => void
}

function NoteRow({
  note,
  projectHandle,
  busy,
  onSave,
  onDelete,
  onResizeImage,
}: NoteRowProps) {
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
    if ((!body && note.images.length === 0) || savingEdit) return
    setSavingEdit(true)
    try {
      const success = await onSave(body)
      if (success) setEditing(false)
    } finally {
      setSavingEdit(false)
    }
  }

  return (
    <article className={`note ${editing ? 'note--editing' : ''}`}>
      <div className="note__rail">
        <span className="note__dot" />
        <span className="note__line" />
      </div>
      <div className="note__content">
        <div className="note__row">
          <div className="note__body">
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
                  rows={3}
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
                    disabled={(!value.trim() && note.images.length === 0) || savingEdit}
                  >
                    {savingEdit ? <Loader2 size={14} className="spin" /> : null}
                    {savingEdit ? '保存中' : '保存修改'}
                  </button>
                </div>
              </div>
            ) : (
              note.body && (
                <>
                  <p className={`note__text ${isLong && !expanded ? 'is-clamped' : ''}`}>{note.body}</p>
                  {isLong && (
                    <button type="button" className="note__expand" onClick={() => setExpanded((current) => !current)}>
                      {expanded ? '收起' : '展开全部'}
                    </button>
                  )}
                </>
              )
            )}
          </div>

          <div className="note__meta">
            <span className="note__stamp">
              <span className="note__time">{noteStamp(note.createdAt)}</span>
              {isEdited(note) && <span className="note__edited">已编辑</span>}
            </span>
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
          </div>
        </div>

        {note.images.length > 0 && (
          <div className="note__images">
            {note.images.map((image) => (
              <StoredNoteImage
                key={image.id}
                projectHandle={projectHandle}
                image={image}
                onResize={(width) => onResizeImage(image.id, width)}
              />
            ))}
          </div>
        )}
      </div>
    </article>
  )
}

interface StoredNoteImageProps {
  projectHandle: FileSystemDirectoryHandle | null
  image: NoteImage
  onResize: (width: number) => void
}

function StoredNoteImage({ projectHandle, image, onResize }: StoredNoteImageProps) {
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    let objectUrl: string | null = null
    setUrl(null)
    setFailed(false)
    if (!projectHandle) {
      setFailed(true)
      return
    }

    void getProjectStoredFile(projectHandle, image.path)
      .then((file) => {
        if (cancelled) return
        objectUrl = URL.createObjectURL(file)
        setUrl(objectUrl)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [projectHandle, image.path])

  if (failed) return null
  if (!url) return <span className="note-image-placeholder" aria-hidden="true" />

  return (
    <ResizableImage
      src={url}
      alt={image.name}
      width={image.width}
      onResize={onResize}
    />
  )
}
