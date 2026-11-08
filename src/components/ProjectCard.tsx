import { ChevronRight, FolderOpen, TriangleAlert } from 'lucide-react'
import { useEffect, useRef, type CSSProperties, type KeyboardEvent, type MouseEvent } from 'react'
import type { ProjectReference, ProjectView } from '../types'
import { noteStamp, relativeTime } from '../lib/format'
import { fileIconFor } from '../lib/files'
import { baseName, compactFolderPath, formatFolderPath, parentPath } from '../lib/paths'
import { accentFor, monogramFor } from '../lib/projectVisual'

interface ProjectCardProps {
  project: ProjectView
  expanded: boolean
  onToggleDetails: (project: ProjectView) => void
  onShowDetails: (project: ProjectView) => void
  onOpenFolder: (project: ProjectView) => void
  onPreviewReference: (project: ProjectView, reference: ProjectReference) => void
}

export function ProjectCard({
  project,
  expanded,
  onToggleDetails,
  onShowDetails,
  onOpenFolder,
  onPreviewReference,
}: ProjectCardProps) {
  const { data } = project
  const latestNote = data.notes[0]
  const displayName = baseName(project.folder)
  const parent = parentPath(project.folder)
  const accent = accentFor(project.folder)
  const issue = project.missing
    ? '文件夹不可用'
    : project.loadError
      ? '记录文件无法读取'
      : null
  const visibleReferences = data.references.slice(0, 2)
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
      onToggleDetails(project)
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
    if (event.target !== event.currentTarget) return
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onToggleDetails(project)
    }
  }

  const stop = (event: MouseEvent) => event.stopPropagation()

  return (
    <article
      className={`project-row ${issue ? 'project-row--issue' : ''} ${expanded ? 'is-expanded' : ''}`}
      style={{ '--project-accent': accent } as CSSProperties}
      tabIndex={0}
      role="button"
      aria-expanded={expanded}
      aria-label={`${expanded ? '收起' : '展开'}项目 ${formatFolderPath(project.folder, ' / ')} 的笔记`}
      onClick={handleCardClick}
      onDoubleClick={handleCardDoubleClick}
      onKeyDown={handleCardKey}
      title="点击展开笔记 · 双击进入项目文件夹"
    >
      <div className="project-row__primary">
        <span className="project-row__monogram">{monogramFor(displayName)}</span>
        <div className="project-row__identity">
          <div className="project-row__title-line">
            <h2>{displayName}</h2>
            {issue && (
              <span className="project-row__status project-row__status--warning">
                <TriangleAlert size={11} strokeWidth={2} />
                {issue}
              </span>
            )}
          </div>
          <p className="project-row__meta">
            {parent && (
              <>
                <span className="project-row__parent" title={project.folder}>
                  {compactFolderPath(parent)}
                </span>
                <i />
              </>
            )}
            {data.notes.length} 条笔记
            <i />
            {data.references.length} 个重点文件
          </p>
        </div>
      </div>

      <div className="project-row__progress">
        {latestNote ? (
          <>
            <p>{latestNote.body}</p>
            <span>{noteStamp(latestNote.createdAt)}</span>
          </>
        ) : issue ? (
          <p className="is-empty">记录文件需要修复或重新创建后才能继续编辑。</p>
        ) : (
          <p className="is-empty">
            {expanded ? '还没有笔记。在下方记录第一笔进展。' : '还没有笔记。展开项目，记下第一笔进展。'}
          </p>
        )}
      </div>

      <div className="project-row__references" aria-label="重点文件">
        {visibleReferences.length > 0 ? (
          <>
            {visibleReferences.map((reference) => {
              const Icon = fileIconFor(reference.name)
              return (
                <button
                  type="button"
                  className="file-link"
                  key={reference.id}
                  title={`预览 ${reference.path}`}
                  onClick={(event) => {
                    stop(event)
                    onPreviewReference(project, reference)
                  }}
                  onDoubleClick={stop}
                >
                  <Icon size={13} strokeWidth={1.8} />
                  <span>{reference.name}</span>
                </button>
              )
            })}
            {extraReferences > 0 && (
              <button
                type="button"
                className="file-link file-link--more"
                onClick={(event) => {
                  stop(event)
                  onShowDetails(project)
                }}
                onDoubleClick={stop}
              >
                +{extraReferences}
              </button>
            )}
          </>
        ) : (
          <span className="project-row__blank">未固定文件</span>
        )}
      </div>

      <div className="project-row__updated">
        <span>{relativeTime(data.updatedAt)}</span>
        <small>{latestNote ? '最近记录' : '尚未开始'}</small>
      </div>

      <div className="project-row__end">
        <button
          type="button"
          className={`project-row__expander ${expanded ? 'is-expanded' : ''}`}
          onClick={(event) => {
            stop(event)
            onToggleDetails(project)
          }}
          onDoubleClick={stop}
          aria-expanded={expanded}
          aria-label={`${expanded ? '收起' : '展开'} ${displayName} 的笔记与文件`}
          title={expanded ? '收起笔记' : '展开笔记'}
        >
          <ChevronRight size={14} strokeWidth={1.9} />
        </button>
        <button
          type="button"
          className="project-row__folder"
          onClick={(event) => {
            stop(event)
            onOpenFolder(project)
          }}
          onDoubleClick={stop}
          aria-label={`${formatFolderPath(project.folder, ' / ')}：进入项目文件夹`}
          title="进入项目文件夹"
          disabled={project.missing}
        >
          <FolderOpen size={17} strokeWidth={1.75} />
        </button>
      </div>
    </article>
  )
}
