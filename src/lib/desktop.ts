export interface DesktopWindowHandle {
  minimize: () => Promise<void>
  toggleMaximize: () => Promise<void>
  close: () => Promise<void>
  isMaximized: () => Promise<boolean>
}

interface TauriBridge {
  core?: {
    invoke?: <T>(command: string, args?: Record<string, unknown>) => Promise<T>
  }
  window?: {
    getCurrentWindow?: () => DesktopWindowHandle
  }
}

interface WindowWithTauri extends Window {
  __TAURI__?: TauriBridge
}

interface DesktopDirectoryEntry {
  name: string
  kind: 'file' | 'directory'
  size?: number
  lastModified?: number
  createdAt?: number
}

const DESKTOP_WORKSPACE_KEY = 'prjm.desktopWorkspaceRoot'

function tauriInvoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const bridge = (window as WindowWithTauri).__TAURI__?.core
  if (!bridge?.invoke) {
    return Promise.reject(new Error('桌面文件桥接不可用'))
  }
  return bridge.invoke<T>(command, args)
}

export function isDesktopRuntime(): boolean {
  if (typeof window === 'undefined') return false
  return typeof (window as WindowWithTauri).__TAURI__?.core?.invoke === 'function'
}

export function isWindowsDesktopRuntime(): boolean {
  if (!isDesktopRuntime() || typeof navigator === 'undefined') return false
  return /Windows/i.test(navigator.userAgent)
}

export function getDesktopWindowHandle(): DesktopWindowHandle | null {
  if (typeof window === 'undefined') return null
  const getCurrentWindow = (window as WindowWithTauri).__TAURI__?.window?.getCurrentWindow
  return typeof getCurrentWindow === 'function' ? getCurrentWindow() : null
}

export function desktopInvoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  return tauriInvoke<T>(command, args)
}

function normalizeRelativePath(path: string): string {
  return path.replaceAll('\\', '/').replace(/^\/+|\/+$/g, '')
}

function pathBaseName(path: string): string {
  const parts = path.replaceAll('\\', '/').split('/').filter(Boolean)
  return parts.length > 0 ? parts[parts.length - 1] : path
}

function childPath(parent: string, name: string): string {
  if (!name || name === '.' || name === '..' || name.includes('/') || name.includes('\\')) {
    throw new DOMException('无效的文件或文件夹名称', 'TypeMismatchError')
  }
  const normalizedParent = normalizeRelativePath(parent)
  return normalizedParent ? `${normalizedParent}/${name}` : name
}

function notFound(name: string): DOMException {
  return new DOMException(`文件或文件夹不存在：${name}`, 'NotFoundError')
}

function mimeForName(name: string): string {
  const extension = /\.([^.]+)$/.exec(name)?.[1]?.toLowerCase() ?? ''
  const mimes: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    avif: 'image/avif',
    bmp: 'image/bmp',
    ico: 'image/x-icon',
    pdf: 'application/pdf',
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    m4a: 'audio/mp4',
    aac: 'audio/aac',
    ogg: 'audio/ogg',
    flac: 'audio/flac',
    mp4: 'video/mp4',
    webm: 'video/webm',
    mov: 'video/quicktime',
    m4v: 'video/mp4',
    ogv: 'video/ogg',
    txt: 'text/plain',
    md: 'text/markdown',
    markdown: 'text/markdown',
    json: 'application/json',
    csv: 'text/csv',
    html: 'text/html',
    css: 'text/css',
    js: 'text/javascript',
    ts: 'text/typescript',
    xml: 'application/xml',
    yml: 'application/yaml',
    yaml: 'application/yaml',
  }
  return mimes[extension] ?? ''
}

export interface DesktopHandleMetadata {
  size?: number
  lastModified?: number
  createdAt?: number
}

export function readDesktopHandleMetadata(
  handle: FileSystemHandle,
): DesktopHandleMetadata | null {
  const value = handle as unknown as {
    __zaibanDesktopSize?: unknown
    __zaibanDesktopModified?: unknown
    __zaibanDesktopCreated?: unknown
  }
  const size = typeof value.__zaibanDesktopSize === 'number' ? value.__zaibanDesktopSize : undefined
  const lastModified =
    typeof value.__zaibanDesktopModified === 'number' ? value.__zaibanDesktopModified : undefined
  const createdAt =
    typeof value.__zaibanDesktopCreated === 'number' ? value.__zaibanDesktopCreated : undefined
  if (size === undefined && lastModified === undefined && createdAt === undefined) return null
  return { size, lastModified, createdAt }
}

class DesktopFileHandle {
  readonly kind = 'file'
  readonly name: string
  readonly __zaibanDesktopSize?: number
  readonly __zaibanDesktopModified?: number
  readonly __zaibanDesktopCreated?: number

  constructor(
    private readonly root: string,
    private readonly path: string,
    name: string,
    size?: number,
    lastModified?: number,
    createdAt?: number,
  ) {
    this.name = name
    this.__zaibanDesktopSize = size
    this.__zaibanDesktopModified = lastModified
    this.__zaibanDesktopCreated = createdAt
  }

  async getFile(): Promise<File> {
    try {
      const bytes = await tauriInvoke<number[]>('read_binary_file', {
        root: this.root,
        path: this.path,
      })
      const data = new Uint8Array(bytes)
      return new File([data], this.name, {
        type: mimeForName(this.name),
        lastModified: this.__zaibanDesktopModified,
      })
    } catch (error) {
      if (isNotFoundError(error)) throw notFound(this.name)
      throw error
    }
  }

  async createWritable(): Promise<FileSystemWritableFileStream> {
    const chunks: BlobPart[] = []
    let closed = false

    const append = (value: unknown) => {
      if (typeof value === 'string' || value instanceof Blob || value instanceof ArrayBuffer) {
        chunks.push(value as BlobPart)
        return
      }
      if (ArrayBuffer.isView(value)) {
        chunks.push(value as BlobPart)
        return
      }
      if (typeof value === 'object' && value !== null && 'data' in value) {
        append((value as { data: unknown }).data)
      }
    }

    const writable = {
      write: async (value: unknown) => {
        if (closed) throw new DOMException('文件写入流已关闭', 'InvalidStateError')
        append(value)
      },
      close: async () => {
        if (closed) return
        closed = true
        const buffer = await new Blob(chunks).arrayBuffer()
        const bytes = Array.from(new Uint8Array(buffer))
        await tauriInvoke<void>('write_binary_file', {
          root: this.root,
          path: this.path,
          data: bytes,
        })
      },
      abort: async () => {
        closed = true
        chunks.length = 0
      },
    }
    return writable as unknown as FileSystemWritableFileStream
  }
}

class DesktopDirectoryHandle {
  readonly kind = 'directory'
  readonly name: string
  readonly __zaibanDesktopModified?: number
  readonly __zaibanDesktopCreated?: number

  constructor(
    private readonly root: string,
    private readonly path: string,
    name?: string,
    createdAt?: number,
    lastModified?: number,
  ) {
    this.name = name || pathBaseName(path) || pathBaseName(root) || root
    this.__zaibanDesktopModified = lastModified
    this.__zaibanDesktopCreated = createdAt
  }

  async queryPermission(): Promise<PermissionState> {
    return 'granted'
  }

  async requestPermission(): Promise<PermissionState> {
    return 'granted'
  }

  private child(name: string): string {
    return childPath(this.path, name)
  }

  async getDirectoryHandle(
    name: string,
    options?: { create?: boolean },
  ): Promise<FileSystemDirectoryHandle> {
    const path = this.child(name)
    if (options?.create) {
      await tauriInvoke<void>('create_directory', { root: this.root, path })
    } else {
      const kind = await tauriInvoke<string | null>('path_kind', {
        path: absolutePath(this.root, path),
      })
      if (kind !== 'directory') throw notFound(name)
    }
    return new DesktopDirectoryHandle(this.root, path) as unknown as FileSystemDirectoryHandle
  }

  async getFileHandle(
    name: string,
    options?: { create?: boolean },
  ): Promise<FileSystemFileHandle> {
    const path = this.child(name)
    if (!options?.create) {
      const kind = await tauriInvoke<string | null>('path_kind', {
        path: absolutePath(this.root, path),
      })
      if (kind !== 'file') throw notFound(name)
    }
    return new DesktopFileHandle(this.root, path, name) as unknown as FileSystemFileHandle
  }

  async *entries(): AsyncIterableIterator<[string, FileSystemHandle]> {
    const entries = await tauriInvoke<DesktopDirectoryEntry[]>('list_directory', {
      root: this.root,
      path: this.path,
    })
    for (const entry of entries) {
      if (entry.kind === 'directory') {
        const handle = new DesktopDirectoryHandle(
          this.root,
          this.child(entry.name),
          entry.name,
          entry.createdAt,
          entry.lastModified,
        )
        yield [entry.name, handle as unknown as FileSystemHandle]
      } else {
        const handle = new DesktopFileHandle(
          this.root,
          this.child(entry.name),
          entry.name,
          entry.size,
          entry.lastModified,
          entry.createdAt,
        )
        yield [entry.name, handle as unknown as FileSystemHandle]
      }
    }
  }

  async *values(): AsyncIterableIterator<FileSystemHandle> {
    for await (const [, handle] of this.entries()) yield handle
  }

  async *keys(): AsyncIterableIterator<string> {
    for await (const [name] of this.entries()) yield name
  }
}

function absolutePath(root: string, relativePath: string): string {
  if (!relativePath) return root
  const separator = root.endsWith('/') || root.endsWith('\\') ? '' : root.includes('\\') ? '\\' : '/'
  return `${root}${separator}${relativePath.replaceAll('/', root.includes('\\') ? '\\' : '/')}`
}

function isNotFoundError(error: unknown): boolean {
  if (typeof error === 'string') {
    return /not\s*found|不存在|找不到|os error 2/i.test(error)
  }
  if (error instanceof Error) {
    return /not\s*found|不存在|找不到|os error 2/i.test(error.message)
  }
  return false
}

export function createDesktopRootHandle(root: string): FileSystemDirectoryHandle {
  return new DesktopDirectoryHandle(root, '') as unknown as FileSystemDirectoryHandle
}

export async function pickDesktopWorkspace(): Promise<string | null> {
  return tauriInvoke<string | null>('pick_workspace_directory')
}

export async function openInSystemFileViewer(
  handle: FileSystemDirectoryHandle,
  relativePath: string,
): Promise<'quicklook' | 'default'> {
  const location = handle as unknown as { root?: unknown; path?: unknown }
  if (typeof location.root !== 'string' || typeof location.path !== 'string') {
    throw new Error('当前文件句柄不支持系统预览')
  }

  const normalizedReference = normalizeRelativePath(relativePath)
  if (
    !normalizedReference ||
    normalizedReference.split('/').some((part) => !part || part === '.' || part === '..') ||
    normalizedReference.includes('\\')
  ) {
    throw new DOMException('无效的文件路径', 'TypeMismatchError')
  }

  const path = location.path
    ? `${location.path}/${normalizedReference}`
    : normalizedReference
  return tauriInvoke<'quicklook' | 'default'>('preview_file_in_system', {
    root: location.root,
    path,
  })
}

export async function openFolderInSystemFileViewer(
  handle: FileSystemDirectoryHandle,
): Promise<void> {
  const location = handle as unknown as { root?: unknown; path?: unknown }
  if (typeof location.root !== 'string' || typeof location.path !== 'string') {
    throw new Error('当前文件句柄不支持系统打开')
  }
  await tauriInvoke<void>('open_folder_in_system', {
    root: location.root,
    path: location.path,
  })
}

export async function loadDesktopWorkspaceRoot(): Promise<FileSystemDirectoryHandle | null> {
  let root = ''
  try {
    root = window.localStorage.getItem(DESKTOP_WORKSPACE_KEY) ?? ''
  } catch {
    return null
  }
  if (!root) return null

  try {
    const kind = await tauriInvoke<string | null>('path_kind', { path: root })
    if (kind === 'directory') return createDesktopRootHandle(root)
  } catch {
    // The folder may have moved, been removed, or become unavailable.
  }

  try {
    window.localStorage.removeItem(DESKTOP_WORKSPACE_KEY)
  } catch {
    // Local storage is optional.
  }
  return null
}

export function saveDesktopWorkspaceRoot(root: string): void {
  try {
    window.localStorage.setItem(DESKTOP_WORKSPACE_KEY, root)
  } catch {
    // Local storage is optional.
  }
}

export function clearDesktopWorkspaceRoot(): void {
  try {
    window.localStorage.removeItem(DESKTOP_WORKSPACE_KEY)
  } catch {
    // Local storage is optional.
  }
}