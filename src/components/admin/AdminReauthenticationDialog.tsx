import { X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { ReauthenticationPanel } from '../account/ReauthenticationPanel'

export function AdminReauthenticationDialog({
  open,
  actionLabel,
  onCancel,
  onAuthenticated,
}: {
  open: boolean
  actionLabel: string
  onCancel: () => void
  onAuthenticated: () => void | Promise<void>
}) {
  const auth = useAuth()
  const dialogRef = useRef<HTMLElement>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    const frame = requestAnimationFrame(() => {
      const dialog = dialogRef.current
      ;(dialog?.querySelector<HTMLElement>('input:not([disabled])') ?? dialog?.querySelector<HTMLElement>('button:not([disabled])'))?.focus()
    })
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) {
        event.preventDefault()
        auth.cancelMfaReauthentication()
        onCancel()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => { cancelAnimationFrame(frame); document.removeEventListener('keydown', onKeyDown) }
  }, [auth, busy, onCancel, open])

  if (!open) return null
  return <div className="security-modal-backdrop" role="presentation" onMouseDown={(event) => {
    if (event.target === event.currentTarget && !busy) { auth.cancelMfaReauthentication(); onCancel() }
  }}>
    <section ref={dialogRef} className="security-modal journal-reauth-modal" role="dialog" aria-modal="true" aria-labelledby="admin-reauth-title">
      <div className="journal-reauth-modal-bar"><div><p className="eyebrow">Confirm this email action</p><p>{actionLabel}</p></div><button type="button" className="icon-button" aria-label="Cancel identity confirmation" disabled={busy} onClick={() => { auth.cancelMfaReauthentication(); onCancel() }}><X aria-hidden="true" /></button></div>
      <ReauthenticationPanel headingId="admin-reauth-title" onBusyChange={setBusy} onAuthenticated={onAuthenticated} />
    </section>
  </div>
}
