import { useState } from 'react'
import type { ConfirmSpec } from '../types'
import { Modal } from './Modal'

interface ConfirmDialogProps {
  spec: ConfirmSpec
  onClose: () => void
}

export function ConfirmDialog({ spec, onClose }: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false)

  const confirm = async () => {
    setBusy(true)
    try {
      await spec.onConfirm()
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={spec.title}
      eyebrow="请确认"
      onClose={onClose}
      className="confirm-modal"
      footer={
        <>
          <button type="button" className="button button--ghost" onClick={onClose} disabled={busy}>
            取消
          </button>
          <button
            type="button"
            className={`button ${spec.tone === 'danger' ? 'button--danger' : 'button--primary'}`}
            onClick={confirm}
            disabled={busy}
            data-autofocus
          >
            {busy ? '处理中…' : spec.confirmLabel}
          </button>
        </>
      }
    >
      <p className="confirm-modal__copy">{spec.description}</p>
    </Modal>
  )
}
