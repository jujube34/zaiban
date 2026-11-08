import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { X } from 'lucide-react'

type ResizeDirection = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

const DIRECTIONS: ResizeDirection[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

interface ResizableImageProps {
  src: string
  alt: string
  width: number
  onResize: (width: number) => void
  onRemove?: () => void
}

export function ResizableImage({ src, alt, width, onResize, onRemove }: ResizableImageProps) {
  const [selected, setSelected] = useState(false)
  const [resizing, setResizing] = useState(false)
  const [localWidth, setLocalWidth] = useState(width)
  const widthRef = useRef(width)
  const previousWidthRef = useRef(width)
  const ratioRef = useRef(1)
  const figureRef = useRef<HTMLElement>(null)
  const cleanupRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (resizing || width === previousWidthRef.current) return
    previousWidthRef.current = width
    setLocalWidth(width)
    widthRef.current = width
  }, [width, resizing])

  useEffect(() => {
    if (!selected) return
    const handleOutside = (event: globalThis.PointerEvent) => {
      if (!figureRef.current?.contains(event.target as Node)) setSelected(false)
    }
    document.addEventListener('pointerdown', handleOutside)
    return () => document.removeEventListener('pointerdown', handleOutside)
  }, [selected])

  useEffect(
    () => () => {
      cleanupRef.current?.()
    },
    [],
  )

  const beginResize = (event: PointerEvent<HTMLSpanElement>, direction: ResizeDirection) => {
    event.preventDefault()
    event.stopPropagation()
    setSelected(true)

    const startX = event.clientX
    const startY = event.clientY
    const startWidth =
      figureRef.current?.getBoundingClientRect().width ?? widthRef.current
    const ratio = ratioRef.current || 1
    const parentWidth = figureRef.current?.parentElement?.getBoundingClientRect().width ?? window.innerWidth
    const maxWidth = Math.max(160, Math.min(parentWidth, 1400))
    let changed = false

    const handleMove = (moveEvent: globalThis.PointerEvent) => {
      moveEvent.preventDefault()
      const dx = moveEvent.clientX - startX
      const dy = moveEvent.clientY - startY
      const horizontal =
        direction.includes('e') ? dx : direction.includes('w') ? -dx : 0
      const vertical =
        direction.includes('s') ? dy * ratio : direction.includes('n') ? -dy * ratio : 0
      const isCorner =
        (direction.includes('e') || direction.includes('w')) &&
        (direction.includes('n') || direction.includes('s'))
      const delta = isCorner ? (horizontal + vertical) / 2 : horizontal || vertical
      const next = Math.min(maxWidth, Math.max(80, startWidth + delta))
      widthRef.current = next
      changed = true
      setLocalWidth(next)
    }

    const finish = () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', finish)
      cleanupRef.current = null
      setResizing(false)
      if (changed) onResize(Math.round(widthRef.current))
    }

    cleanupRef.current = finish
    window.addEventListener('pointermove', handleMove, { passive: false })
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', finish)
    setResizing(true)
  }

  return (
    <figure
      ref={figureRef}
      className={`resizable-image ${selected ? 'is-selected' : ''} ${resizing ? 'is-resizing' : ''}`}
      style={{ width: `${localWidth}px` }}
      tabIndex={0}
      role="group"
      aria-label={alt}
      onPointerDown={() => setSelected(true)}
      onFocus={() => setSelected(true)}
    >
      <img
        src={src}
        alt={alt}
        draggable={false}
        onLoad={(event) => {
          const image = event.currentTarget
          if (image.naturalWidth > 0 && image.naturalHeight > 0) {
            ratioRef.current = image.naturalWidth / image.naturalHeight
          }
        }}
      />
      {selected && (
        <>
          {DIRECTIONS.map((direction) => (
            <span
              key={direction}
              className={`resize-handle resize-handle--${direction}`}
              onPointerDown={(event) => beginResize(event, direction)}
              role="presentation"
            />
          ))}
          {onRemove && (
            <button
              type="button"
              className="resizable-image__remove"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation()
                onRemove()
              }}
              aria-label={`移除图片 ${alt}`}
              title="移除图片"
            >
              <X size={14} strokeWidth={2} />
            </button>
          )}
        </>
      )}
    </figure>
  )
}
