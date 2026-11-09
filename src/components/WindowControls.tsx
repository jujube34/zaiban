import { useCallback, useEffect, useMemo, useState } from 'react'
import { Minus, Square, X } from 'lucide-react'
import { getDesktopWindowHandle, isWindowsDesktopRuntime } from '../lib/desktop'

interface WindowControlsProps {
  className?: string
}

function RestoreIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="3.25" y="5.25" width="7.5" height="6.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M5.25 5.25V3.25h6.5v6.5h-1" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  )
}

export function WindowControls({ className = '' }: WindowControlsProps) {
  const appWindow = useMemo(
    () => (isWindowsDesktopRuntime() ? getDesktopWindowHandle() : null),
    [],
  )
  const [maximized, setMaximized] = useState(false)

  const syncMaximized = useCallback(() => {
    if (!appWindow) return
    void appWindow.isMaximized().then(setMaximized).catch(() => undefined)
  }, [appWindow])

  useEffect(() => {
    if (!appWindow) return
    syncMaximized()
    window.addEventListener('resize', syncMaximized)
    return () => window.removeEventListener('resize', syncMaximized)
  }, [appWindow, syncMaximized])

  if (!appWindow) return null

  const toggleMaximize = () => {
    void appWindow
      .toggleMaximize()
      .then(() => appWindow.isMaximized())
      .then(setMaximized)
      .catch(() => undefined)
  }

  return (
    <div className={['window-controls', className].filter(Boolean).join(' ')} aria-label="窗口控制">
      <button
        type="button"
        className="window-control"
        onClick={() => void appWindow.minimize().catch(() => undefined)}
        aria-label="最小化"
        title="最小化"
      >
        <Minus size={15} strokeWidth={1.6} />
      </button>
      <button
        type="button"
        className="window-control"
        onClick={toggleMaximize}
        aria-label={maximized ? '向下还原' : '最大化'}
        title={maximized ? '向下还原' : '最大化'}
      >
        {maximized ? <RestoreIcon /> : <Square size={13} strokeWidth={1.6} />}
      </button>
      <button
        type="button"
        className="window-control window-control--close"
        onClick={() => void appWindow.close().catch(() => undefined)}
        aria-label="关闭"
        title="关闭"
      >
        <X size={15} strokeWidth={1.7} />
      </button>
    </div>
  )
}
