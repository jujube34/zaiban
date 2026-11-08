import {
  isDesktopRuntime,
  loadDesktopWorkspaceRoot,
  saveDesktopWorkspaceRoot,
} from './desktop'

const DATABASE_NAME = 'zaiban-local'
const STORE_NAME = 'handles'
const WORKSPACE_KEY = 'workspace-root'
const VERSION = 1

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, VERSION)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('无法打开本地存储'))
  })
}

export async function loadWorkspaceHandle(): Promise<FileSystemDirectoryHandle | null> {
  if (isDesktopRuntime()) return loadDesktopWorkspaceRoot()
  try {
    const database = await openDatabase()
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readonly')
      const request = transaction.objectStore(STORE_NAME).get(WORKSPACE_KEY)
      request.onsuccess = () => resolve((request.result as FileSystemDirectoryHandle | undefined) ?? null)
      request.onerror = () => reject(request.error ?? new Error('读取工作区失败'))
      transaction.oncomplete = () => database.close()
    })
  } catch {
    return null
  }
}

export async function saveWorkspaceHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  if (isDesktopRuntime()) {
    const desktopRoot = (handle as unknown as { root?: unknown }).root
    if (typeof desktopRoot === 'string') saveDesktopWorkspaceRoot(desktopRoot)
    return
  }

  const database = await openDatabase()
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite')
      transaction.objectStore(STORE_NAME).put(handle, WORKSPACE_KEY)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error ?? new Error('保存工作区失败'))
      transaction.onabort = () => reject(transaction.error ?? new Error('保存工作区已中止'))
    })
  } finally {
    database.close()
  }
}
