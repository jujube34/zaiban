import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'

export interface ToastMessage {
  id: number
  message: string
  tone?: 'default' | 'success' | 'error'
}

interface ToastProps {
  toast: ToastMessage | null
  onDismiss: () => void
}

export function Toast({ toast, onDismiss }: ToastProps) {
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    if (!toast) return
    if (timerRef.current) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(onDismiss, toast.tone === 'error' ? 5200 : 3400)
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current)
    }
  }, [toast, onDismiss])

  if (!toast) return null

  const Icon = toast.tone === 'error' ? AlertCircle : toast.tone === 'success' ? CheckCircle2 : Info

  return (
    <div className={`toast toast--${toast.tone ?? 'default'}`} role="status" aria-live="polite">
      <Icon size={17} strokeWidth={1.9} />
      <span>{toast.message}</span>
      <button type="button" className="toast__close" onClick={onDismiss} aria-label="关闭提示">
        <X size={15} />
      </button>
    </div>
  )
}

export function useToast() {
  const [toast, setToast] = useState<ToastMessage | null>(null)
  const showToast = useCallback((message: string, tone: ToastMessage['tone'] = 'default') => {
    setToast({ id: Date.now() + Math.random(), message, tone })
  }, [])
  const dismissToast = useCallback(() => setToast(null), [])
  return { toast, showToast, dismissToast }
}
