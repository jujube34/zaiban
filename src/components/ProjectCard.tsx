import { ArrowUpRight, FolderOpen, TriangleAlert } from 'lucide-react'
import { useEffect, useRef, type CSSProperties, type KeyboardEvent, type MouseEvent } from 'react'
import type { ProjectReference, ProjectView } from '../types'
import { noteStamp, relativeTime } from '../lib/format'
import { fileIconFor } from '../lib/files'
import { accentFor, monogramFor } from '../lib/projectVisual'

interface ProjectCardProps {
  project: ProjectView
  onOpen: (project: ProjectView) => void
  onOpenFolder: (project: ProjectView) => void
  onPreviewReference: (project: ProjectView, reference: ProjectReference) => void
  onShowReferences: (project: ProjectView) => void
}

export function ProjectCard({
  project,
  onOpen,
  onOpenFolder,
  onPreviewReference,
  onShowReferences,
}: ProjectCardProps) {
  const { data } = project
  const latestNote = data.notes[0]
  const accent = accentFor(project.folder)
  const issue = project.missing
    ? '文件夹不可用'
    : project.loadError
      ? '记录文件无法读取'
      : null
  const visibleReferences = data.references.slice(0, 3)
  const extraReferences = data.references.length - visibleReferences.length
  const clickTimer = useRef<number | null>(null)

  useEffect(
    () => () => {
      if (clickTimer.current) window.clearTimeout(clickTimer.current)
    },
    [],
  )

  const handleCardClick = () => {
    if (clickTimer.current) window.clearTimeout(clickTimer.current)
    clickTimer.current = window.setTimeout(() => {
      clickTimer.current = null
      onOpen(project)
    }, 220)
  }

  const handleCardDoubleClick = () => {
    if (clickTimer.current) {
      window.clearTimeout(clickTimer.current)
      clickTimer.current = null
    }
    onOpenFolder(project)
  }

  const handleCardKey = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      onOpen(project)
    }
  }

  const stop = (event: MouseEvent) => event.stopPropagation()

  return (
    <article
      className={`project-card ${issue ? 'project-card--issue' : ''}`}
      style={{ '--project-accent': accent } as CSSProperties}
      tabIndex={0}
      role="button"
      aria-label={`打开项目 ${project.folder}`}
      onClick={handleCardClick}
      onDoubleClick={handleCardDoubleClick}
      onKeyDown={handleCardKey}
      title="点击查看笔记 · 双击进入项目文件夹"
    >
      <div className="project-card__top">
        <div className="project-card__identity">
          <span className="project-card__monogram">{monogramFor(project.folder)}</span>
          {issue ? (
            <span className="project-card__badge project-card__badge--warning">
              <TriangleAlert size={12} strokeWidth={2} />
              {issue}
            </span>
          ) : (
            <span className="project-card__badge">
              <i />
              进行中
            </span>
          )}
        </div>
        <button
          type="button"
          className="project-card__folder"
          onClick={(event) => {
            stop(event)
            onOpenFolder(project)
          }}
          aria-label={`${project.folder}：进入项目文件夹`}
          title="进入项目文件夹"
          disabled={project.missing}
        >
          <FolderOpen size={18} strokeWidth={1.75} />
        </button>
      </div>

      <div className="project-card__heading">
        <h2>{project.folder}</h2>
        <ArrowUpRight className="project-card__arrow" size={18} strokeWidth={1.8} />
      </div>

      <div className="project-card__note">
        {latestNote ? (
          <>
            <p>{latestNote.body}</p>
            <span className="project-card__note-time">{noteStamp(latestNote.createdAt)}</span>
          </>
        ) : issue ? (
          <p className="project-card__note-empty">记录文件需要修复或重新创建后才能继续编辑。</p>
        ) : (
          <p className="project-card__note-empty">还没有笔记。打开项目，记下第一笔进展。</p>
        )}
      </div>

      {visibleReferences.length > 0 && (
        <div className="project-card__files" aria-label="重点文件">
          {visibleReferences.map((reference) => {
            const Icon = fileIconFor(reference.name)
            return (
              <button
                type="button"
                className="file-pill"
                key={reference.id}
                title={`预览 ${reference.path}`}
                onClick={(event) => {
                  stop(event)
                  onPreviewReference(project, reference)
                }}
              >
                <Icon size={13} strokeWidth={1.8} />
                <span>{reference.name}</span>
              </button>
            )
          })}
          {extraReferences > 0 && (
            <button
              type="button"
              className="file-pill file-pill--more"
              onClick={(event) => {
                stop(event)
                onShowReferences(project)
              }}
            >
              +{extraReferences}
            </button>
          )}
        </div>
      )}

      <div className="project-card__footer">
        <div className="project-card__counts">
          <span>{data.notes.length} 条笔记</span>
          <i />
          <span>{data.references.length} 个重点文件</span>
        </div>
        <span className="project-card__updated">
          {latestNote ? `更新于 ${relativeTime(data.updatedAt)}` : '尚未开始'}
        </span>
      </div>
    </article>
  )
}
