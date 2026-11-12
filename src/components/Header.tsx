import { useEffect, useRef, useState, type RefObject } from 'react'
import {
  Check,
  ChevronDown,
  Download,
  Folder,
  FolderSync,
  Loader2,
  Plus,
  RotateCw,
  Search,
  Smartphone,
  TriangleAlert,
  X,
} from 'lucide-react'
import type { SaveState } from '../types'
import { isWindowsDesktopRuntime } from '../lib/desktop'
import { Brand } from './Brand'
import { WindowControls } from './WindowControls'

interface HeaderProps {
  workspaceName: string
  saveState: SaveState
  canInstall: boolean
  query: string
  onQueryChange: (value: string) => void
  sort: 'recent' | 'name'
  onSortChange: (sort: 'recent' | 'name') => void
  searchInputRef: RefObject<HTMLInputElement | null>
  showTools: boolean
  onAddProject: () => void
  onRefresh: () => void
  onSwitchWorkspace: () => void
  onExport: () => void
  onInstall: () => void
}

export function Header({
  workspaceName,
  saveState,
  canInstall,
  query,
  onQueryChange,
  sort,
  onSortChange,
  searchInputRef,
  showTools,
  onAddProject,
  onRefresh,
  onSwitchWorkspace,
  onExport,
  onInstall,
}: HeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const windowTitlebar = isWindowsDesktopRuntime()

  useEffect(() => {
    if (!menuOpen) return
    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [menuOpen])

  return (
    <header
      className={`app-header ${windowTitlebar ? 'app-header--window-titlebar' : ''}`.trim()}
      data-tauri-drag-region={windowTitlebar ? 'deep' : undefined}
    >
      <div className="app-header__inner">
        <div className="app-header__left">
          <Brand />
          <span className="app-header__divider" />
          <div className="workspace-menu" ref={menuRef}>
            <button
              type="button"
              className={`workspace-trigger ${menuOpen ? 'is-open' : ''}`}
              onClick={() => setMenuOpen((value) => !value)}
              aria-expanded={menuOpen}
              aria-haspopup="menu"
            >
              <Folder size={15} strokeWidth={1.8} />
              <span className="workspace-trigger__name" title={workspaceName}>
                {workspaceName}
              </span>
              <ChevronDown size={14} className="workspace-trigger__chevron" />
            </button>

            {menuOpen && (
              <div className="dropdown" role="menu" aria-label="工作区菜单">
                <div className="dropdown__meta">
                  <span className="dropdown__label">当前工作区</span>
                  <strong>{workspaceName}</strong>
                </div>
                <button
                  type="button"
                  className="dropdown__item"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false)
                    onRefresh()
                  }}
                >
                  <RotateCw size={16} strokeWidth={1.8} />
                  从磁盘重新读取
                </button>
                <button
                  type="button"
                  className="dropdown__item"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false)
                    onSwitchWorkspace()
                  }}
                >
                  <FolderSync size={16} strokeWidth={1.8} />
                  切换工作目录
                </button>
                <div className="dropdown__separator" />
                <button
                  type="button"
                  className="dropdown__item"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false)
                    onExport()
                  }}
                >
                  <Download size={16} strokeWidth={1.8} />
                  导出全部记录
                </button>
                {canInstall && (
                  <button
                    type="button"
                    className="dropdown__item"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false)
                      onInstall()
                    }}
                  >
                    <Smartphone size={16} strokeWidth={1.8} />
                    安装到桌面
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {showTools && (
          <div className="app-header__tools">
            <label className="search-field">
              <Search size={16} strokeWidth={1.8} />
              <input
                ref={searchInputRef}
                type="search"
                value={query}
                onChange={(event) => onQueryChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    onQueryChange('')
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
                  onClick={() => onQueryChange('')}
                  aria-label="清空搜索"
                >
                  <X size={14} />
                </button>
              ) : (
                <kbd className="search-field__shortcut">/</kbd>
              )}
            </label>
            <div className="sort-control">
              <span className="sort-label" id="project-sort-label">排序：</span>
              <div className="sort-switch" role="group" aria-labelledby="project-sort-label">
                <button
                  type="button"
                  className={sort === 'recent' ? 'is-active' : ''}
                  onClick={() => onSortChange('recent')}
                  aria-pressed={sort === 'recent'}
                >
                  最近更新
                </button>
                <button
                  type="button"
                  className={sort === 'name' ? 'is-active' : ''}
                  onClick={() => onSortChange('name')}
                  aria-pressed={sort === 'name'}
                >
                  名称
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="app-header__right">
          <span className={`save-status save-status--${saveState}`} aria-live="polite">
            {saveState === 'saving' ? (
              <Loader2 size={14} className="spin" />
            ) : saveState === 'error' ? (
              <TriangleAlert size={14} />
            ) : (
              <Check size={14} />
            )}
            <span>
              {saveState === 'saving'
                ? '保存中'
                : saveState === 'error'
                  ? '保存失败'
                  : saveState === 'saved'
                    ? '已保存'
                    : '本地存储'}
            </span>
          </span>
          <button
            type="button"
            className="button button--primary button--compact"
            onClick={onAddProject}
            aria-label="添加项目"
          >
            <Plus size={17} strokeWidth={2} />
            <span className="button__label">添加项目</span>
          </button>
          <WindowControls />
        </div>
      </div>
    </header>
  )
}
