import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import { ProjectDrawer } from './components/ProjectDrawer'
import { Toast, useToast } from './components/Toast'
import { Welcome } from './components/Welcome'
import {
  createProjectData,
  createWorkspaceData,
  ensurePermission,
  friendlyFsError,
  makeId,
  readProject,
  readWorkspace,
  supportsFileSystemAccess,
  writeProject,
  writeWorkspace,
} from './lib/fs'
import { headerDate, isThisWeek, nowIso, relativeTime } from './lib/format'
import { loadWorkspaceHandle, saveWorkspaceHandle } from './lib/idb'
import type {
  ConfirmSpec,
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
      handle = await root.getDirectoryHandle(tracked.folder)
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
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null)
  const [folderState, setFolderState] = useState<FolderState | null>(null)
  const [previewState, setPreviewState] = useState<PreviewState | null>(null)
  const [confirmSpec, setConfirmSpec] = useState<ConfirmSpec | null>(null)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<'recent' | 'name'>('recent')
  const [canInstall, setCanInstall] = useState(false)
  const installPrompt = useRef<BeforeInstallPromptEvent | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const { toast, showToast, dismissToast } = useToast()

  const selectedProject = useMemo(
    () => projects.find((project) => project.folder === selectedFolder) ?? null,
    [projects, selectedFolder],
  )
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
    setSelectedFolder(null)
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
      if (document.querySelector('[data-modal-open="true"]') || selectedFolder) return
      event.preventDefault()
      searchRef.current?.focus()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [boot, selectedFolder])

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
              ? { ...candidate.existing, folder: candidate.folder }
              : createProjectData(candidate.folder)
            await writeProject(candidate.handle, data)
            newViews.push({
              folder: candidate.folder,
              handle: candidate.handle,
              data,
              addedAt,
            })
          } catch {
            failed.push(candidate.folder)
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
    async (project: ProjectView, body: string): Promise<boolean> => {
      const timestamp = nowIso()
      const note: ProjectNote = {
        id: makeId(),
        body: body.trim(),
        createdAt: timestamp,
        updatedAt: timestamp,
      }
      const next: ProjectData = {
        ...project.data,
        notes: [note, ...project.data.notes],
        updatedAt: timestamp,
      }
      return persistProject(project, next)
    },
    [persistProject],
  )

  const editNote = useCallback(
    async (project: ProjectView, noteId: string, body: string): Promise<boolean> => {
      const trimmed = body.trim()
      if (!trimmed) return false
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
      const success = await persistProject(project, next)
      if (success) showToast(`已取消固定「${reference.name}」`, 'success')
    },
    [persistProject, showToast],
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
      const success = await persistProject(project, next)
      if (success) showToast(`已固定「${name}」`, 'success')
    },
    [persistProject, removeReference, showToast],
  )

  const stopTracking = useCallback(
    (project: ProjectView) => {
      setConfirmSpec({
        title: `停止跟踪「${project.folder}」？`,
        description: '它只会从总览中消失。项目文件夹、笔记与重点文件引用都会完整保留，日后仍可重新添加。',
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
            setSelectedFolder(null)
            if (folderState?.folder === project.folder) setFolderState(null)
            if (previewState?.folder === project.folder) setPreviewState(null)
            setSaveState('saved')
            showToast(`已停止跟踪「${project.folder}」`, 'success')
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

  const openDrawer = useCallback((project: ProjectView) => {
    setSelectedFolder(project.folder)
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
      if (sort === 'name') return a.folder.localeCompare(b.folder, 'zh-CN', { numeric: true })
      return new Date(b.data.updatedAt).getTime() - new Date(a.data.updatedAt).getTime()
    })
  }, [projects, query, sort])

  const weeklyNotes = useMemo(
    () =>
      projects.reduce(
        (total, project) =>
          total + project.data.notes.filter((note) => isThisWeek(note.createdAt)).length,
        0,
      ),
    [projects],
  )
  const pinnedCount = useMemo(
    () => projects.reduce((total, project) => total + project.data.references.length, 0),
    [projects],
  )
  const lastUpdated = useMemo(() => {
    if (projects.length === 0) return null
    return projects.reduce(
      (latest, project) =>
        new Date(project.data.updatedAt).getTime() > new Date(latest).getTime()
          ? project.data.updatedAt
          : latest,
      projects[0].data.updatedAt,
    )
  }, [projects])

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
          <div className="dashboard__intro">
            <p className="eyebrow dashboard__date">
              {headerDate()}
              <span className="eyebrow__dot" />
              {weeklyNotes > 0 ? `本周留下 ${weeklyNotes} 条记录` : '从今天的第一笔进展开始'}
            </p>
            <div className="dashboard__title-row">
              <h1>进行中的项目</h1>
              {hasProjects && <span className="count-badge">{projects.length}</span>}
            </div>
            <p className="dashboard__sub">
              {hasProjects ? (
                <>
                  {pinnedCount > 0
                    ? `${pinnedCount} 个重点文件就绪`
                    : '把重点文件固定在手边'}
                  {lastUpdated && (
                    <>
                      <span className="sub-separator">·</span>
                      最近更新 {relativeTime(lastUpdated)}
                    </>
                  )}
                </>
              ) : (
                '把此刻正在做的事收拢到一处。'
              )}
            </p>
          </div>

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
                <div className="project-ledger__labels" aria-hidden="true">
                  <span>项目</span>
                  <span>最近进展</span>
                  <span>重点文件</span>
                  <span>更新</span>
                  <span />
                </div>
                {filteredProjects.map((project) => (
                  <ProjectCard
                    key={project.folder}
                    project={project}
                    onOpen={openDrawer}
                    onOpenFolder={(item) => openFolder(item)}
                    onPreviewReference={previewReference}
                    onShowReferences={openDrawer}
                  />
                ))}
                <button
                  type="button"
                  className="project-ledger__add"
                  onClick={() => setAddProjectsOpen(true)}
                >
                  <Plus size={15} strokeWidth={1.8} />
                  <span>添加项目</span>
                  <small>从工作目录中继续挑选</small>
                </button>
              </section>
            ) : (
              <section className="empty-search">
                <SearchX size={26} strokeWidth={1.5} />
                <h2>没有匹配「{query.trim()}」的项目</h2>
                <p>换一个关键词，或清空搜索查看全部项目。</p>
                <button type="button" className="button button--ghost" onClick={() => setQuery('')}>
                  清空搜索
                </button>
              </section>
            )}

            <footer className="dashboard__footer">
              <span>双击项目进入文件夹</span>
              <i />
              <span>记录保存在每个项目的 .prjm/project.json</span>
              <i />
              <span>所有内容仅留在本机</span>
            </footer>
          </>
        ) : (
          <section className="empty-dashboard">
            <div className="empty-dashboard__art" aria-hidden="true">
              <span className="empty-folder empty-folder--back" />
              <span className="empty-folder empty-folder--front">
                <FolderPlus size={25} strokeWidth={1.45} />
              </span>
            </div>
            <p className="eyebrow">工作台还是空的</p>
            <h2>开始跟踪第一个项目</h2>
            <p className="empty-dashboard__copy">
              从「{workspaceName}」里挑出正在进行的项目文件夹。笔记和重点文件会跟着项目走。
            </p>
            <button
              type="button"
              className="button button--primary button--large"
              onClick={() => setAddProjectsOpen(true)}
            >
              <Plus size={18} strokeWidth={2} />
              选择项目文件夹
            </button>
            <span className="empty-dashboard__hint">随时可以从上方菜单切换工作目录</span>
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

      {selectedProject && (
        <ProjectDrawer
          key={selectedProject.folder}
          project={selectedProject}
          workspaceName={workspaceName}
          saving={saveState === 'saving'}
          onClose={() => setSelectedFolder(null)}
          onOpenFolder={() => openFolder(selectedProject)}
          onAddNote={(body) => addNote(selectedProject, body)}
          onEditNote={(noteId, body) => editNote(selectedProject, noteId, body)}
          onDeleteNote={(note) => requestDeleteNote(selectedProject, note)}
          onAddReference={() => openFolder(selectedProject, 'pin')}
          onRemoveReference={(reference) => removeReference(selectedProject, reference)}
          onPreviewReference={(reference) => previewReference(selectedProject, reference)}
          onStopTracking={() => stopTracking(selectedProject)}
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
