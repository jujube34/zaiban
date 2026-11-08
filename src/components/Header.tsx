import { useEffect, useRef, useState } from 'react'
import {
  Check,
  ChevronDown,
  Download,
  Folder,
  FolderSync,
  Loader2,
  Plus,
  RotateCw,
  Smartphone,
  TriangleAlert,
} from 'lucide-react'
import type { SaveState } from '../types'
import { Brand } from './Brand'

interface HeaderProps {
  workspaceName: string
  saveState: SaveState
  canInstall: boolean
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
  onAddProject,
  onRefresh,
  onSwitchWorkspace,
  onExport,
  onInstall,
}: HeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

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
    <header className="app-header">
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
                <div className="dropdown__note">数据留在本机，不会上传。</div>
              </div>
            )}
          </div>
        </div>

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
        </div>
      </div>
    </header>
  )
}
