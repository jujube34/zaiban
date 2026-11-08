export interface ProjectNote {
  id: string
  body: string
  createdAt: string
  updatedAt: string
}

export interface ProjectReference {
  id: string
  path: string
  name: string
  addedAt: string
}

export interface ProjectData {
  app: 'prjm'
  kind: 'project'
  version: 1
  name: string
  folder: string
  createdAt: string
  updatedAt: string
  notes: ProjectNote[]
  references: ProjectReference[]
}

export interface TrackedProject {
  folder: string
  addedAt: string
}

export interface WorkspaceData {
  app: 'prjm'
  kind: 'workspace'
  version: 1
  name: string
  createdAt: string
  updatedAt: string
  projects: TrackedProject[]
}

export interface ProjectView {
  folder: string
  handle: FileSystemDirectoryHandle | null
  data: ProjectData
  addedAt: string
  missing?: boolean
  loadError?: string
}

export interface ProjectCandidate {
  folder: string
  handle: FileSystemDirectoryHandle
  existing: ProjectData | null
  error?: string
}

export interface FolderEntry {
  name: string
  kind: 'file' | 'directory'
  handle: FileSystemFileHandle | FileSystemDirectoryHandle
  size?: number
  lastModified?: number
}

export type SaveState = 'idle' | 'saving' | 'saved' | 'error'

export interface PreviewTarget {
  projectFolder: string
  path: string
  name: string
}

export interface ConfirmSpec {
  title: string
  description: string
  confirmLabel: string
  tone?: 'danger' | 'default'
  onConfirm: () => void | Promise<void>
}

declare global {
  interface Window {
    showDirectoryPicker?: (options?: {
      id?: string
      mode?: 'read' | 'readwrite'
      startIn?: FileSystemHandle | string
    }) => Promise<FileSystemDirectoryHandle>
  }

  interface FileSystemHandle {
    queryPermission?: (descriptor?: { mode?: 'read' | 'readwrite' }) => Promise<PermissionState>
    requestPermission?: (descriptor?: { mode?: 'read' | 'readwrite' }) => Promise<PermissionState>
  }

  interface FileSystemDirectoryHandle {
    entries: () => AsyncIterableIterator<[string, FileSystemHandle]>
    values: () => AsyncIterableIterator<FileSystemHandle>
    keys: () => AsyncIterableIterator<string>
  }

  interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
  }
}
