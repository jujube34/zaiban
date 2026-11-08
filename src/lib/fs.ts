import type {
  FolderEntry,
  ProjectCandidate,
  ProjectData,
  ProjectNote,
  ProjectReference,
  WorkspaceData,
} from '../types'
import { nowIso } from './format'

export const APP_DIR = '.prjm'
export const PROJECT_FILE = 'project.json'
export const WORKSPACE_FILE = 'workspace.json'

const IGNORED_DIRECTORIES = new Set(['node_modules'])
const collator = new Intl.Collator('zh-CN', { numeric: true, sensitivity: 'base' })

type PermissionMode = 'read' | 'readwrite'

export function supportsFileSystemAccess(): boolean {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function'
}

export async function ensurePermission(
  handle: FileSystemHandle,
  mode: PermissionMode = 'readwrite',
  request = false,
): Promise<boolean> {
  if (typeof handle.queryPermission !== 'function') return true

  let permission = await handle.queryPermission({ mode })
  if (permission === 'granted') return true
  if (permission === 'prompt' && request && typeof handle.requestPermission === 'function') {
    permission = await handle.requestPermission({ mode })
  }
  return permission === 'granted'
}

export function createProjectData(folder: string): ProjectData {
  const time = nowIso()
  return {
    app: 'prjm',
    kind: 'project',
    version: 1,
    name: folder,
    folder,
    createdAt: time,
    updatedAt: time,
    notes: [],
    references: [],
  }
}

export function createWorkspaceData(name: string): WorkspaceData {
  const time = nowIso()
  return {
    app: 'prjm',
    kind: 'workspace',
    version: 1,
    name,
    createdAt: time,
    updatedAt: time,
    projects: [],
  }
}

export function makeId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function cleanString(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback
}

function cleanIso(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString()
}

function cleanPath(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const path = value.replaceAll('\\', '/').replace(/^\/+|\/+$/g, '')
  if (!path) return null
  const parts = path.split('/')
  if (parts.some((part) => !part || part === '.' || part === '..')) return null
  return parts.join('/')
}

function parseNotes(value: unknown, fallback: string): ProjectNote[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is Record<string, unknown> => isRecord(item) && typeof item.body === 'string')
    .map((item) => ({
      id: cleanString(item.id, makeId()),
      body: (item.body as string).trim(),
      createdAt: cleanIso(item.createdAt, fallback),
      updatedAt: cleanIso(item.updatedAt, cleanIso(item.createdAt, fallback)),
    }))
    .filter((note) => note.body.length > 0)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
}

function parseReferences(value: unknown): ProjectReference[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  return value
    .filter((item): item is Record<string, unknown> => isRecord(item) && typeof item.path === 'string')
    .map((item) => {
      const path = cleanPath(item.path)
      if (!path || seen.has(path)) return null
      seen.add(path)
      const name = cleanString(item.name, path.split('/').pop() ?? path)
      return {
        id: cleanString(item.id, makeId()),
        path,
        name,
        addedAt: cleanIso(item.addedAt, nowIso()),
      }
    })
    .filter((item): item is ProjectReference => item !== null)
}

export function parseProjectData(value: unknown, folder: string): ProjectData {
  if (!isRecord(value) || value.app !== 'prjm' || value.kind !== 'project') {
    throw new Error('不是可识别的项目记录文件')
  }

  const fallback = nowIso()
  const createdAt = cleanIso(value.createdAt, fallback)
  const notes = parseNotes(value.notes, createdAt)
  const references = parseReferences(value.references)

  return {
    app: 'prjm',
    kind: 'project',
    version: 1,
    name: cleanString(value.name, folder),
    folder,
    createdAt,
    updatedAt: cleanIso(value.updatedAt, createdAt),
    notes,
    references,
  }
}

export function parseWorkspaceData(value: unknown, name: string): WorkspaceData {
  if (!isRecord(value) || value.app !== 'prjm' || value.kind !== 'workspace') {
    throw new Error('不是可识别的工作区文件')
  }

  const fallback = nowIso()
  const projects = Array.isArray(value.projects)
    ? value.projects
        .filter((item): item is Record<string, unknown> => isRecord(item) && typeof item.folder === 'string')
        .map((item) => ({
          folder: cleanString(item.folder),
          addedAt: cleanIso(item.addedAt, fallback),
        }))
        .filter((item) => item.folder.length > 0)
    : []

  const unique: WorkspaceData['projects'] = []
  const seen = new Set<string>()
  for (const project of projects) {
    if (seen.has(project.folder)) continue
    seen.add(project.folder)
    unique.push(project)
  }

  return {
    app: 'prjm',
    kind: 'workspace',
    version: 1,
    name: cleanString(value.name, name),
    createdAt: cleanIso(value.createdAt, fallback),
    updatedAt: cleanIso(value.updatedAt, fallback),
    projects: unique,
  }
}

async function readJsonFile(root: FileSystemDirectoryHandle, parts: string[]): Promise<unknown | null> {
  let directory = root
  try {
    for (let index = 0; index < parts.length - 1; index += 1) {
      directory = await directory.getDirectoryHandle(parts[index])
    }
    const fileHandle = await directory.getFileHandle(parts[parts.length - 1])
    const text = await (await fileHandle.getFile()).text()
    return JSON.parse(text) as unknown
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotFoundError') return null
    throw error
  }
}

async function writeJsonFile(
  root: FileSystemDirectoryHandle,
  parts: string[],
  data: unknown,
): Promise<void> {
  const appDirectory = await root.getDirectoryHandle(parts[0], { create: true })
  let directory = appDirectory
  for (let index = 1; index < parts.length - 1; index += 1) {
    directory = await directory.getDirectoryHandle(parts[index], { create: true })
  }
  const fileHandle = await directory.getFileHandle(parts[parts.length - 1], { create: true })
  const writable = await fileHandle.createWritable()
  try {
    await writable.write(`${JSON.stringify(data, null, 2)}\n`)
  } finally {
    await writable.close()
  }
}

export async function readProject(handle: FileSystemDirectoryHandle): Promise<ProjectData | null> {
  const raw = await readJsonFile(handle, [APP_DIR, PROJECT_FILE])
  if (raw === null) return null
  return parseProjectData(raw, handle.name)
}

export async function writeProject(handle: FileSystemDirectoryHandle, data: ProjectData): Promise<void> {
  await writeJsonFile(handle, [APP_DIR, PROJECT_FILE], data)
}

export async function readWorkspace(root: FileSystemDirectoryHandle): Promise<WorkspaceData | null> {
  const raw = await readJsonFile(root, [APP_DIR, WORKSPACE_FILE])
  if (raw === null) return null
  return parseWorkspaceData(raw, root.name)
}

export async function writeWorkspace(
  root: FileSystemDirectoryHandle,
  data: WorkspaceData,
): Promise<void> {
  await writeJsonFile(root, [APP_DIR, WORKSPACE_FILE], data)
}

export function friendlyFsError(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError') return '没有访问权限，请重新连接工作目录'
    if (error.name === 'NotFoundError') return '文件夹或文件已被移动或删除'
    if (error.name === 'TypeMismatchError') return '所选对象的类型已发生变化'
    if (error.name === 'SecurityError') return '浏览器阻止了本地文件访问'
    if (error.name === 'AbortError') return '操作已取消'
  }
  if (error instanceof SyntaxError) return 'JSON 文件格式有误'
  return error instanceof Error ? error.message : '访问本地文件时出现未知错误'
}

export async function getDirectoryByPath(
  root: FileSystemDirectoryHandle,
  path: string[],
): Promise<FileSystemDirectoryHandle> {
  let directory = root
  for (const part of path) {
    if (!part || part === '.' || part === '..') throw new Error('无效的文件夹路径')
    directory = await directory.getDirectoryHandle(part)
  }
  return directory
}

export async function getFileByPath(
  root: FileSystemDirectoryHandle,
  path: string,
): Promise<FileSystemFileHandle> {
  const parts = path.split('/').filter(Boolean)
  if (parts.length === 0) throw new Error('无效的文件路径')
  const name = parts.pop() as string
  const directory = await getDirectoryByPath(root, parts)
  return directory.getFileHandle(name)
}

export async function listDirectory(
  directory: FileSystemDirectoryHandle,
  hideAppDirectory = false,
): Promise<FolderEntry[]> {
  const entries: FolderEntry[] = []

  for await (const [name, handle] of directory.entries()) {
    if (hideAppDirectory && name === APP_DIR) continue
    if (handle.kind === 'directory') {
      entries.push({ name, kind: 'directory', handle: handle as FileSystemDirectoryHandle })
      continue
    }

    const fileHandle = handle as FileSystemFileHandle
    let size: number | undefined
    let lastModified: number | undefined
    try {
      const file = await fileHandle.getFile()
      size = file.size
      lastModified = file.lastModified
    } catch {
      // Metadata can be unavailable for a broken or cloud-only file; listing still works.
    }
    entries.push({ name, kind: 'file', handle: fileHandle, size, lastModified })
  }

  return entries.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1
    return collator.compare(a.name, b.name)
  })
}

export async function scanProjectFolders(
  root: FileSystemDirectoryHandle,
  trackedFolders: string[],
): Promise<ProjectCandidate[]> {
  const tracked = new Set(trackedFolders)
  const candidates: ProjectCandidate[] = []

  for await (const [name, handle] of root.entries()) {
    if (handle.kind !== 'directory') continue
    if (name.startsWith('.') || IGNORED_DIRECTORIES.has(name) || tracked.has(name)) continue

    const directory = handle as FileSystemDirectoryHandle
    let existing: ProjectData | null = null
    let error: string | undefined
    try {
      existing = await readProject(directory)
    } catch (caught) {
      error = friendlyFsError(caught)
    }

    candidates.push({ folder: name, handle: directory, existing, error })
  }

  return candidates.sort((a, b) => collator.compare(a.folder, b.folder))
}
