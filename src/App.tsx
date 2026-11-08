import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  FolderPlus,
  Plus,
  Search,
  SearchX,
  X,
} from 'lucide-react'
import { AddProjectsModal } from './components/AddProjectsModal'
import { BrandMark } from './components/Brand'
import { ConfirmDialog } from './components/ConfirmDialog'
import { FilePreview } from './components/FilePreview'
import { FolderBrowser } from './components/FolderBrowser'
import { Header } from './components/Header'
import { ProjectCard } from './components/ProjectCard'
import { ProjectDetails } from './components/ProjectDetails'
import { Toast, useToast } from './components/Toast'
import { Welcome } from './components/Welcome'
import {
  createProjectData,
  createWorkspaceData,
  ensurePermission,
  friendlyFsError,
  getDirectoryByPath,
  makeId,
  readProject,
  readWorkspace,
  saveProjectImage,
  supportsFileSystemAccess,
  writeProject,
  writeWorkspace,
} from './lib/fs'
import { nowIso } from './lib/format'
import { loadWorkspaceHandle, saveWorkspaceHandle } from './lib/idb'
import { baseName, formatFolderPath } from './lib/paths'
import type {
  ConfirmSpec,
  DraftNoteImage,
  PreviewTarget,
  ProjectCandidate,
  ProjectData,
  ProjectNote,
  ProjectReference,
  ProjectView,
  SaveState,
  WorkspaceData,
} from './types'

type BootState = 'loading' | 'unsupported' | 'welcome' | 'ready'

interface FolderState {
  folder: string
  intent: 'browse' | 'pin'
}

interface PreviewState {
  folder: string
  target: PreviewTarget
}

async function loadProjectViews(
  root: FileSystemDirectoryHandle,
  workspace: WorkspaceData,
): Promise<{ views: ProjectView[]; errors: string[] }> {
  const views: ProjectView[] = []
  const errors: string[] = []

  for (const tracked of workspace.projects) {
    let handle: FileSystemDirectoryHandle
    try {
      handle = await getDirectoryByPath(root, tracked.folder.split('/').filter(Boolean))
    } catch {
      views.push({
        folder: tracked.folder,
        handle: null,
        data: createProjectData(tracked.folder),
        addedAt: tracked.addedAt,
        missing: true,
        loadError: '项目文件夹不存在或无法访问',
      })
      errors.push(tracked.folder)
      continue
    }

    try {
      const data = await readProject(handle)
      if (!data) {
        views.push({
          folder: tracked.folder,
          handle,
          data: createProjectData(tracked.folder),
          addedAt: tracked.addedAt,
          loadError: '没有找到 .prjm/project.json',
        })
        errors.push(tracked.folder)
      } else {
        views.push({
          folder: tracked.folder,
          handle,
          data: { ...data, folder: tracked.folder },
          addedAt: tracked.addedAt,
        })
      }
    } catch (caught) {
      views.push({
        folder: tracked.folder,
        handle,
        data: createProjectData(tracked.folder),
        addedAt: tracked.addedAt,
        loadError: friendlyFsError(caught),
      })
      errors.push(tracked.folder)
    }
  }

  return { views, errors }
}

function excerpt(text: string, limit = 54): string {
  const compact = text.replace(/\s+/g, ' ').trim()
  return compact.length > limit ? `${compact.slice(0, limit)}…` : compact
}

function BootScreen() {
  return (
    <div className="boot-screen">
      <div className="boot-screen__brand">
        <BrandMark size={42} className="brand__mark" />
        <span>在办</span>
      </div>
      <div className="boot-screen__line"><span /></div>
      <p>正在打开工作台</p>
    </div>
  )
}

export default function App() {
  const [boot, setBoot] = useState<BootState>('loading')
  const [starting, setStarting] = useState(false)
  const [storedWorkspace, setStoredWorkspace] = useState<FileSystemDirectoryHandle | null>(null)
  const [root, setRoot] = useState<FileSystemDirectoryHandle | null>(null)
  const [workspace, setWorkspace] = useState<WorkspaceData | null>(null)
  const [projects, setProjects] = useState<ProjectView[]>([])
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [addProjectsOpen, setAddProjectsOpen] = useState(false)
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => new Set())
  const [detailsSideWidth, setDetailsSideWidth] = useState(() => {
    try {
      const raw = window.localStorage.getItem('prjm.detailsSideWidth')
      if (raw !== null) {
        const parsed = Number(raw)
        if (Number.isFinite(parsed)) {
          return Math.min(560, Math.max(240, Math.round(parsed)))
        }
      }
    } catch {
      // Local storage is optional.
    }
    return 330
  })
  const [folderState, setFolderState] = useState<FolderState | null>(null)
  const [previewState, setPreviewState] = useState<PreviewState | null>(null)
  const [confirmSpec, setConfirmSpec] = useState<ConfirmSpec | null>(null)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<'recent' | 'name'>('recent')
  const [canInstall, setCanInstall] = useState(false)
  const installPrompt = useRef<BeforeInstallPromptEvent | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const { toast, showToast, dismissToast } = useToast()

  const folderProject = useMemo(
    () => (folderState ? projects.find((project) => project.folder === folderState.folder) ?? null : null),
    [projects, folderState],
  )
  const previewProject = useMemo(
    () => (previewState ? projects.find((project) => project.folder === previewState.folder) ?? null : null),
    [projects, previewState],
  )

  const enterWorkspace = useCallback(async (handle: FileSystemDirectoryHandle) => {
    const granted = await ensurePermission(handle, 'readwrite', false)
    if (!granted) {
      throw new DOMException('需要读写权限才能打开工作区', 'NotAllowedError')
    }

    const meta = await readWorkspace(handle)
    setRoot(handle)
    setStoredWorkspace(handle)
    setExpandedFolders(new Set())
    setFolderState(null)
    setPreviewState(null)
    setQuery('')

    if (!meta) {
      setWorkspace(createWorkspaceData(handle.name))
      setProjects([])
      setSaveState('idle')
      setBoot('ready')
      setAddProjectsOpen(true)
      return
    }

    const { views, errors } = await loadProjectViews(handle, meta)
    setWorkspace(meta)
    setProjects(views)
    setSaveState('saved')
    setBoot('ready')
    setAddProjectsOpen(false)
    if (errors.length > 0) {
      showToast(`${errors.length} 个项目需要检查，详情已标在列表中`, 'error')
    }
  }, [showToast])

  const restoreWorkspace = useCallback(
    async (handle: FileSystemDirectoryHandle, requestAccess: boolean) => {
      const granted = await ensurePermission(handle, 'readwrite', requestAccess)
      if (!granted) {
        setBoot('welcome')
        showToast('需要重新授权工作目录才能继续', 'error')
        return
      }
      await enterWorkspace(handle)
    },
    [enterWorkspace, showToast],
  )

  useEffect(() => {
    try {
      window.localStorage.setItem('prjm.detailsSideWidth', String(detailsSideWidth))
    } catch {
      // Local storage is optional.
    }
  }, [detailsSideWidth])

  useEffect(() => {
    if (!supportsFileSystemAccess()) {
      setBoot('unsupported')
      return
    }

    let cancelled = false
    const bootUp = async () => {
      try {
        const handle = await loadWorkspaceHandle()
        if (cancelled) return
        setStoredWorkspace(handle)
        if (!handle) {
          setBoot('welcome')
          return
        }
        const granted = await ensurePermission(handle, 'readwrite', false)
        if (cancelled) return
        if (!granted) {
          setBoot('welcome')
          return
        }
        await enterWorkspace(handle)
      } catch (caught) {
        if (cancelled) return
        setBoot('welcome')
        showToast(friendlyFsError(caught), 'error')
      }
    }
    void bootUp()
    return () => {
      cancelled = true
    }
  }, [enterWorkspace, showToast])

  useEffect(() => {
    const handlePrompt = (event: Event) => {
      event.preventDefault()
      installPrompt.current = event as BeforeInstallPromptEvent
      setCanInstall(true)
    }
    const handleInstalled = () => {
      installPrompt.current = null
      setCanInstall(false)
    }
    window.addEventListener('beforeinstallprompt', handlePrompt)
    window.addEventListener('appinstalled', handleInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', handlePrompt)
      window.removeEventListener('appinstalled', handleInstalled)
    }
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== '/' || boot !== 'ready') return
      if (event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return
      }
      if (document.querySelector('[data-modal-open="true"]')) return
      event.preventDefault()
      searchRef.current?.focus()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [boot])

  const chooseWorkspace = useCallback(async () => {
    if (!window.showDirectoryPicker) {
      showToast('当前浏览器不支持选择本地文件夹', 'error')
      return
    }
    setStarting(true)
    try {
      const handle = await window.showDirectoryPicker({
        id: 'zaiban-workspace',
        mode: 'readwrite',
      })
      const granted = await ensurePermission(handle, 'readwrite', true)
      if (!granted) throw new DOMException('需要读写权限才能保存项目记录', 'NotAllowedError')
      await enterWorkspace(handle)
      await saveWorkspaceHandle(handle).catch(() => undefined)
      setStoredWorkspace(handle)
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === 'AbortError') return
      setBoot((current) => (current === 'ready' ? current : 'welcome'))
      showToast(friendlyFsError(caught), 'error')
    } finally {
      setStarting(false)
    }
  }, [enterWorkspace, showToast])

  const resumeWorkspace = useCallback(async () => {
    if (!storedWorkspace) return
    setStarting(true)
    try {
      await restoreWorkspace(storedWorkspace, true)
    } catch (caught) {
      showToast(friendlyFsError(caught), 'error')
    } finally {
      setStarting(false)
    }
  }, [restoreWorkspace, showToast, storedWorkspace])

  const refreshWorkspace = useCallback(async () => {
    if (!root) return
    setSaveState('saving')
    try {
      const granted = await ensurePermission(root, 'readwrite', true)
      if (!granted) throw new DOMException('没有工作目录权限', 'NotAllowedError')
      const meta = await readWorkspace(root)
      if (!meta) throw new Error('没有找到工作区记录文件')
      const { views, errors } = await loadProjectViews(root, meta)
      setWorkspace(meta)
      setProjects(views)
      setSaveState('saved')
      showToast('已从磁盘重新读取', 'success')
      if (errors.length > 0) showToast(`${errors.length} 个项目需要检查`, 'error')
    } catch (caught) {
      setSaveState('error')
      showToast(friendlyFsError(caught), 'error')
    }
  }, [root, showToast])

  const exportAll = useCallback(() => {
    const payload = {
      app: 'prjm',
      kind: 'backup',
      version: 1,
      exportedAt: nowIso(),
      workspace,
      projects: projects.map((project) => project.data),
    }
    const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    const date = new Date()
    anchor.href = url
    anchor.download = `zaiban-backup-${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}.json`
    document.body.append(anchor)
    anchor.click()
    anchor.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
    showToast('已导出全部记录', 'success')
  }, [projects, showToast, workspace])

  const installApp = useCallback(async () => {
    const prompt = installPrompt.current
    if (!prompt) return
    await prompt.prompt()
    const choice = await prompt.userChoice
    if (choice.outcome === 'accepted') {
      showToast('已开始安装', 'success')
    }
    installPrompt.current = null
    setCanInstall(false)
  }, [showToast])

  const addProjects = useCallback(
    async (candidates: ProjectCandidate[]): Promise<boolean> => {
      if (!root) return false
      setSaveState('saving')
      try {
        const granted = await ensurePermission(root, 'readwrite', true)
        if (!granted) throw new DOMException('没有工作目录的写入权限', 'NotAllowedError')

        const addedAt = nowIso()
        const newViews: ProjectView[] = []
        const failed: string[] = []

        for (const candidate of candidates) {
          try {
            const data: ProjectData = candidate.existing
              ? { ...candidate.existing, folder: candidate.folder, name: candidate.name }
              : createProjectData(candidate.folder, candidate.name)
            await writeProject(candidate.handle, data)
            newViews.push({
              folder: candidate.folder,
              handle: candidate.handle,
              data,
              addedAt,
            })
          } catch {
            failed.push(candidate.name)
          }
        }

        if (newViews.length === 0) {
          throw new Error('所选项目都没有添加成功，请检查文件夹权限')
        }

        const base = workspace ?? createWorkspaceData(root.name)
        const existingFolders = new Set(newViews.map((view) => view.folder))
        const nextWorkspace: WorkspaceData = {
          ...base,
          name: root.name,
          updatedAt: nowIso(),
          projects: [
            ...base.projects.filter((project) => !existingFolders.has(project.folder)),
            ...newViews.map((view) => ({ folder: view.folder, addedAt })),
          ],
        }
        await writeWorkspace(root, nextWorkspace)

        setWorkspace(nextWorkspace)
        setProjects((current) => {
          const fresh = current.filter(
            (project) => !newViews.some((view) => view.folder === project.folder),
          )
          return [...fresh, ...newViews]
        })
        setSaveState('saved')
        if (failed.length > 0) {
          showToast(`已添加 ${newViews.length} 个，${failed.length} 个添加失败`, 'error')
        } else {
          showToast(`已添加 ${newViews.length} 个项目`, 'success')
        }
        return true
      } catch (caught) {
        setSaveState('error')
        showToast(friendlyFsError(caught), 'error')
        return false
      }
    },
    [root, showToast, workspace],
  )

  const persistProject = useCallback(
    async (project: ProjectView, next: ProjectData): Promise<boolean> => {
      if (!project.handle) {
        showToast('项目文件夹不可用，无法保存', 'error')
        return false
      }
      setSaveState('saving')
      try {
        if (root) {
          const granted = await ensurePermission(root, 'readwrite', true)
          if (!granted) throw new DOMException('没有工作目录的写入权限', 'NotAllowedError')
        }
        await writeProject(project.handle, next)
        setProjects((current) =>
          current.map((item) => (item.folder === project.folder ? { ...item, data: next } : item)),
        )
        setSaveState('saved')
        return true
      } catch (caught) {
        setSaveState('error')
        showToast(friendlyFsError(caught), 'error')
        return false
      }
    },
    [root, showToast],
  )

  const addNote = useCallback(
    async (project: ProjectView, body: string, images: DraftNoteImage[]): Promise<boolean> => {
      const trimmed = body.trim()
      if (!project.handle || (!trimmed && images.length === 0)) return false

      setSaveState('saving')
      try {
        if (root) {
          const granted = await ensurePermission(root, 'readwrite', true)
          if (!granted) throw new DOMException('没有工作目录的写入权限', 'NotAllowedError')
        }

        const storedImages = []
        for (const image of images) {
          storedImages.push(await saveProjectImage(project.handle, image))
        }

        const timestamp = nowIso()
        const note: ProjectNote = {
          id: makeId(),
          body: trimmed,
          createdAt: timestamp,
          updatedAt: timestamp,
          images: storedImages,
        }
        const next: ProjectData = {
          ...project.data,
          notes: [note, ...project.data.notes],
          updatedAt: timestamp,
        }
        await writeProject(project.handle, next)
        setProjects((current) =>
          current.map((item) =>
            item.folder === project.folder ? { ...item, data: next } : item,
          ),
        )
        setSaveState('saved')
        return true
      } catch (caught) {
        setSaveState('error')
        showToast(friendlyFsError(caught), 'error')
        return false
      }
    },
    [root, showToast],
  )

  const editNote = useCallback(
    async (project: ProjectView, noteId: string, body: string): Promise<boolean> => {
      const trimmed = body.trim()
      const existing = project.data.notes.find((note) => note.id === noteId)
      if (!trimmed && (!existing || existing.images.length === 0)) return false
      const timestamp = nowIso()
      const next: ProjectData = {
        ...project.data,
        notes: project.data.notes.map((note) =>
          note.id === noteId ? { ...note, body: trimmed, updatedAt: timestamp } : note,
        ),
        updatedAt: timestamp,
      }
      return persistProject(project, next)
    },
    [persistProject],
  )

  const resizeNoteImage = useCallback(
    async (
      project: ProjectView,
      noteId: string,
      imageId: string,
      width: number,
    ): Promise<boolean> => {
      const timestamp = nowIso()
      let changed = false
      const notes = project.data.notes.map((note) => {
        if (note.id !== noteId) return note
        const images = note.images.map((image) => {
          if (image.id !== imageId) return image
          changed = true
          return {
            ...image,
            width: Math.min(1400, Math.max(80, Math.round(width))),
          }
        })
        return changed ? { ...note, images, updatedAt: timestamp } : note
      })
      if (!changed) return false
      return persistProject(project, {
        ...project.data,
        notes,
        updatedAt: timestamp,
      })
    },
    [persistProject],
  )

  const deleteNote = useCallback(
    async (project: ProjectView, note: ProjectNote): Promise<boolean> => {
      const next: ProjectData = {
        ...project.data,
        notes: project.data.notes.filter((item) => item.id !== note.id),
        updatedAt: nowIso(),
      }
      return persistProject(project, next)
    },
    [persistProject],
  )

  const requestDeleteNote = useCallback(
    (project: ProjectView, note: ProjectNote) => {
      setConfirmSpec({
        title: '删除这条笔记？',
        description: `“${excerpt(note.body)}”会从项目记录中移除，删除后无法恢复。`,
        confirmLabel: '删除笔记',
        tone: 'danger',
        onConfirm: async () => {
          const success = await deleteNote(project, note)
          if (success) showToast('笔记已删除', 'success')
        },
      })
    },
    [deleteNote, showToast],
  )

  const removeReference = useCallback(
    async (project: ProjectView, reference: ProjectReference) => {
      const next: ProjectData = {
        ...project.data,
        references: project.data.references.filter((item) => item.path !== reference.path),
        updatedAt: nowIso(),
      }
      await persistProject(project, next)
    },
    [persistProject],
  )

  const togglePin = useCallback(
    async (project: ProjectView, path: string, name: string) => {
      const existing = project.data.references.find((reference) => reference.path === path)
      if (existing) {
        await removeReference(project, existing)
        return
      }
      const reference: ProjectReference = {
        id: makeId(),
        path,
        name,
        addedAt: nowIso(),
      }
      const next: ProjectData = {
        ...project.data,
        references: [reference, ...project.data.references],
        updatedAt: nowIso(),
      }
      await persistProject(project, next)
    },
    [persistProject, removeReference],
  )

  const stopTracking = useCallback(
    (project: ProjectView) => {
      setConfirmSpec({
        title: `停止跟踪「${baseName(project.folder)}」？`,
        description: `「${formatFolderPath(project.folder, ' / ')}」只会从总览中消失。项目文件夹、笔记与重点文件引用都会完整保留，日后仍可重新添加。`,
        confirmLabel: '停止跟踪',
        tone: 'danger',
        onConfirm: async () => {
          if (!root || !workspace) return
          setSaveState('saving')
          try {
            const next: WorkspaceData = {
              ...workspace,
              projects: workspace.projects.filter((item) => item.folder !== project.folder),
              updatedAt: nowIso(),
            }
            await writeWorkspace(root, next)
            setWorkspace(next)
            setProjects((current) => current.filter((item) => item.folder !== project.folder))
            setExpandedFolders((current) => {
              if (!current.has(project.folder)) return current
              const remaining = new Set(current)
              remaining.delete(project.folder)
              return remaining
            })
            if (folderState?.folder === project.folder) setFolderState(null)
            if (previewState?.folder === project.folder) setPreviewState(null)
            setSaveState('saved')
            showToast(`已停止跟踪「${baseName(project.folder)}」`, 'success')
          } catch (caught) {
            setSaveState('error')
            showToast(friendlyFsError(caught), 'error')
          }
        },
      })
    },
    [folderState?.folder, previewState?.folder, root, showToast, workspace],
  )

  const openFolder = useCallback(
    (project: ProjectView, intent: 'browse' | 'pin' = 'browse') => {
      if (project.missing || !project.handle) {
        showToast('项目文件夹不可用，无法打开', 'error')
        return
      }
      setFolderState({ folder: project.folder, intent })
    },
    [showToast],
  )

  const previewReference = useCallback(
    (project: ProjectView, reference: ProjectReference) => {
      if (project.missing || !project.handle) {
        showToast('项目文件夹不可用，无法预览文件', 'error')
        return
      }
      setPreviewState({
        folder: project.folder,
        target: {
          projectFolder: project.folder,
          path: reference.path,
          name: reference.name,
        },
      })
    },
    [showToast],
  )

  const previewFile = useCallback(
    (project: ProjectView, path: string, name: string) => {
      setPreviewState({
        folder: project.folder,
        target: { projectFolder: project.folder, path, name },
      })
    },
    [],
  )

  const toggleDetails = useCallback((project: ProjectView) => {
    setExpandedFolders((current) => {
      const next = new Set(current)
      if (next.has(project.folder)) {
        next.delete(project.folder)
      } else {
        next.add(project.folder)
      }
      return next
    })
  }, [])

  const showDetails = useCallback((project: ProjectView) => {
    setExpandedFolders((current) => {
      if (current.has(project.folder)) return current
      const next = new Set(current)
      next.add(project.folder)
      return next
    })
  }, [])

  const filteredProjects = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    const result = normalized
      ? projects.filter((project) => {
          if (project.folder.toLowerCase().includes(normalized)) return true
          if (project.data.notes.some((note) => note.body.toLowerCase().includes(normalized))) return true
          return project.data.references.some(
            (reference) =>
              reference.name.toLowerCase().includes(normalized) ||
              reference.path.toLowerCase().includes(normalized),
          )
        })
      : [...projects]

    return result.sort((a, b) => {
      if (sort === 'name') {
        return (
          baseName(a.folder).localeCompare(baseName(b.folder), 'zh-CN', { numeric: true }) ||
          a.folder.localeCompare(b.folder, 'zh-CN', { numeric: true })
        )
      }
      return new Date(b.data.updatedAt).getTime() - new Date(a.data.updatedAt).getTime()
    })
  }, [projects, query, sort])

  const workspaceName = root?.name ?? workspace?.name ?? ''
  const hasProjects = projects.length > 0

  if (boot === 'loading') {
    return (
      <>
        <BootScreen />
        <Toast toast={toast} onDismiss={dismissToast} />
      </>
    )
  }

  if (boot === 'welcome' || boot === 'unsupported') {
    return (
      <>
        <Welcome
          supported={boot !== 'unsupported'}
          storedName={storedWorkspace?.name ?? null}
          busy={starting}
          onChoose={() => void chooseWorkspace()}
          onResume={() => void resumeWorkspace()}
        />
        <Toast toast={toast} onDismiss={dismissToast} />
      </>
    )
  }

  return (
    <div className="app-shell">
      <Header
        workspaceName={workspaceName}
        saveState={saveState}
        canInstall={canInstall}
        onAddProject={() => setAddProjectsOpen(true)}
        onRefresh={() => void refreshWorkspace()}
        onSwitchWorkspace={() => void chooseWorkspace()}
        onExport={exportAll}
        onInstall={() => void installApp()}
      />

      <main className="dashboard">
        <section className="dashboard__head">
          {hasProjects && (
            <div className="dashboard__tools">
              <label className="search-field">
                <Search size={16} strokeWidth={1.8} />
                <input
                  ref={searchRef}
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                      setQuery('')
                      event.currentTarget.blur()
                    }
                  }}
                  placeholder="搜索项目、笔记或文件"
                  aria-label="搜索项目、笔记或文件"
                />
                {query ? (
                  <button
                    type="button"
                    className="search-field__clear"
                    onClick={() => setQuery('')}
                    aria-label="清空搜索"
                  >
                    <X size={14} />
                  </button>
                ) : (
                  <kbd className="search-field__shortcut">/</kbd>
                )}
              </label>
              <div className="sort-switch" role="group" aria-label="项目排序">
                <button
                  type="button"
                  className={sort === 'recent' ? 'is-active' : ''}
                  onClick={() => setSort('recent')}
                  aria-pressed={sort === 'recent'}
                >
                  最近更新
                </button>
                <button
                  type="button"
                  className={sort === 'name' ? 'is-active' : ''}
                  onClick={() => setSort('name')}
                  aria-pressed={sort === 'name'}
                >
                  名称
                </button>
              </div>
            </div>
          )}
        </section>

        {hasProjects ? (
          <>
            {filteredProjects.length > 0 ? (
              <section className="project-ledger" aria-label="进行中的项目">
                {filteredProjects.map((project) => (
                  <Fragment key={project.folder}>
                    <ProjectCard
                      project={project}
                      expanded={expandedFolders.has(project.folder)}
                      onToggleDetails={toggleDetails}
                      onShowDetails={showDetails}
                      onOpenFolder={(item) => openFolder(item)}
                      onPreviewReference={previewReference}
                    />
                    {expandedFolders.has(project.folder) && (
                      <ProjectDetails
                        project={project}
                        saving={saveState === 'saving'}
                        sideWidth={detailsSideWidth}
                        onSideWidthChange={(width) => setDetailsSideWidth(width)}
                        onAddNote={(body, images) => addNote(project, body, images)}
                        onEditNote={(noteId, body) => editNote(project, noteId, body)}
                        onDeleteNote={(note) => requestDeleteNote(project, note)}
                        onResizeNoteImage={(noteId, imageId, width) =>
                          resizeNoteImage(project, noteId, imageId, width)
                        }
                        onAddReference={() => openFolder(project, 'pin')}
                        onRemoveReference={(reference) => removeReference(project, reference)}
                        onPreviewReference={(reference) => previewReference(project, reference)}
                        onStopTracking={() => stopTracking(project)}
                      />
                    )}
                  </Fragment>
                ))}
                <button
                  type="button"
                  className="project-ledger__add"
                  onClick={() => setAddProjectsOpen(true)}
                >
                  <Plus size={15} strokeWidth={1.8} />
                  <span>添加项目</span>
                </button>
              </section>
            ) : (
              <section className="empty-search">
                <SearchX size={26} strokeWidth={1.5} />
                <h2>没有匹配「{query.trim()}」的项目</h2>
                <button type="button" className="button button--ghost" onClick={() => setQuery('')}>
                  清空搜索
                </button>
              </section>
            )}

          </>
        ) : (
          <section className="empty-dashboard">
            <div className="empty-dashboard__art" aria-hidden="true">
              <span className="empty-folder empty-folder--back" />
              <span className="empty-folder empty-folder--front">
                <FolderPlus size={25} strokeWidth={1.45} />
              </span>
            </div>
            <h2>开始跟踪第一个项目</h2>
            <button
              type="button"
              className="button button--primary button--large"
              onClick={() => setAddProjectsOpen(true)}
            >
              <Plus size={18} strokeWidth={2} />
              选择项目文件夹
            </button>
          </section>
        )}
      </main>

      {addProjectsOpen && root && (
        <AddProjectsModal
          root={root}
          trackedFolders={workspace?.projects.map((project) => project.folder) ?? []}
          onClose={() => setAddProjectsOpen(false)}
          onAdd={addProjects}
        />
      )}

      {folderState && folderProject && (
        <FolderBrowser
          project={folderProject}
          intent={folderState.intent}
          saving={saveState === 'saving'}
          onClose={() => setFolderState(null)}
          onPreview={(path, name) => previewFile(folderProject, path, name)}
          onTogglePin={(path, name) => togglePin(folderProject, path, name)}
        />
      )}

      {previewState && previewProject && (
        <FilePreview
          project={previewProject}
          target={previewState.target}
          onClose={() => setPreviewState(null)}
        />
      )}

      {confirmSpec && (
        <ConfirmDialog spec={confirmSpec} onClose={() => setConfirmSpec(null)} />
      )}

      <Toast toast={toast} onDismiss={dismissToast} />
    </div>
  )
}
