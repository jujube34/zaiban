import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

interface ModalProps {
  title: string
  eyebrow?: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  className?: string
  size?: 'default' | 'wide' | 'preview'
  closeLabel?: string
  hideHeader?: boolean
}

const layerStack: string[] = []

function focusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => element.offsetParent !== null)
}

export function Modal({
  title,
  eyebrow,
  onClose,
  children,
  footer,
  className = '',
  size = 'default',
  closeLabel = '关闭',
  hideHeader = false,
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  const titleId = useId()
  const layerId = useRef(`modal-${Math.random().toString(36).slice(2)}`)
  onCloseRef.current = onClose

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    layerStack.push(layerId.current)

    const handleKeyDown = (event: KeyboardEvent) => {
      if (layerStack[layerStack.length - 1] !== layerId.current) return
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab' || !dialogRef.current) return

      const focusable = focusableElements(dialogRef.current)
      if (focusable.length === 0) {
        event.preventDefault()
        dialogRef.current.focus()
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown, true)
    const frame = window.requestAnimationFrame(() => {
      const dialog = dialogRef.current
      if (!dialog) return
      const initial =
        dialog.querySelector<HTMLElement>('[data-autofocus]') ??
        dialog.querySelector<HTMLElement>('[data-modal-close]') ??
        focusableElements(dialog)[0] ??
        dialog
      initial.focus({ preventScroll: true })
    })

    return () => {
      window.cancelAnimationFrame(frame)
      document.removeEventListener('keydown', handleKeyDown, true)
      const index = layerStack.indexOf(layerId.current)
      if (index >= 0) layerStack.splice(index, 1)
      document.body.style.overflow = previousOverflow
      if (previousFocus && document.contains(previousFocus)) {
        previousFocus.focus({ preventScroll: true })
      }
    }
  }, [])

  return createPortal(
    <div
      className="modal-layer"
      data-modal-open="true"
      data-layer={size}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCloseRef.current()
      }}
    >
      <div
        ref={dialogRef}
        className={`modal modal--${size} ${className}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={hideHeader ? undefined : titleId}
        aria-label={hideHeader ? title : undefined}
        tabIndex={-1}
      >
        {!hideHeader && (
          <header className="modal__head">
            <div>
              {eyebrow && <p className="eyebrow">{eyebrow}</p>}
              <h2 id={titleId} className="modal__title">
                {title}
              </h2>
            </div>
            <button
              type="button"
              className="icon-button icon-button--quiet"
              onClick={onClose}
              aria-label={closeLabel}
              data-modal-close
            >
              <X size={19} strokeWidth={1.8} />
            </button>
          </header>
        )}
        <div className={`modal__body ${hideHeader ? 'modal__body--flush' : ''}`}>{children}</div>
        {footer && <footer className="modal__footer">{footer}</footer>}
      </div>
    </div>,
    document.body,
  )
}
