import { AlertCircle, BadgeDollarSign, ChevronRight, FlaskConical, Inbox, LoaderCircle, Search } from 'lucide-react'
import { useEffect, useRef, type ReactNode } from 'react'
import { Link } from 'react-router-dom'

export function AdminPageHeader({ eyebrow, title, description, actions, breadcrumbs }: { eyebrow?: string; title: string; description: string; actions?: ReactNode; breadcrumbs?: Array<{ label: string; to?: string }> }) {
  return <>
    {breadcrumbs && <nav className="admin-breadcrumbs" aria-label="Breadcrumb">{breadcrumbs.map((item, index) => <span key={`${item.label}-${index}`}>{index > 0 && <ChevronRight aria-hidden="true" />}{item.to ? <Link to={item.to}>{item.label}</Link> : <span aria-current="page">{item.label}</span>}</span>)}</nav>}
    <header className="admin-page-header"><div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h1>{title}</h1><p>{description}</p></div>{actions && <div className="admin-page-actions">{actions}</div>}</header>
  </>
}

export function AdminPanel({ title, description, action, children, className = '' }: { title?: string; description?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={`admin-card ${className}`}>{(title || description || action) && <header className="admin-card-header"><div>{title && <h2>{title}</h2>}{description && <p>{description}</p>}</div>{action}</header>}{children}</section>
}

export function SearchField({ value, onChange, placeholder = 'Search', label = 'Search' }: { value: string; onChange: (value: string) => void; placeholder?: string; label?: string }) {
  return <label className="admin-search"><span className="sr-only">{label}</span><Search aria-hidden="true" /><input type="search" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} /></label>
}

export function StatusBadge({ children, tone }: { children: ReactNode; tone?: 'positive' | 'warning' | 'danger' | 'neutral' | 'info' }) {
  return <span className={`admin-status-badge ${tone ?? 'neutral'}`}>{children}</span>
}

export function OrderEnvironmentBadge({ environment }: { environment?: 'test' | 'live' }) {
  const live = environment === 'live'
  return <span className={`admin-order-environment ${live ? 'live' : 'test'}`}>{live ? <BadgeDollarSign aria-hidden="true" /> : <FlaskConical aria-hidden="true" />}<span>{live ? 'Live order' : 'Sandbox test'}</span></span>
}

export function EmptyState({ title, description, action, icon }: { title: string; description: string; action?: ReactNode; icon?: ReactNode }) {
  return <div className="admin-empty">{icon ?? <Inbox aria-hidden="true" />}<h2>{title}</h2><p>{description}</p>{action}</div>
}

export function LoadingState({ label = 'Loading workspace…' }: { label?: string }) {
  return <div className="admin-state" role="status"><LoaderCircle className="spin" aria-hidden="true" /><p>{label}</p></div>
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <div className="admin-state error" role="alert"><AlertCircle aria-hidden="true" /><h2>We could not complete this request</h2><p>{message}</p>{onRetry && <button className="button secondary" onClick={onRetry}>Try again</button>}</div>
}

export function ConfirmDialog({ open, title, description, confirmLabel = 'Confirm', busy = false, onConfirm, onCancel }: { open: boolean; title: string; description: string; confirmLabel?: string; busy?: boolean; onConfirm: () => void; onCancel: () => void }) {
  const cancelRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    cancelRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) { onCancel(); return }
      if (event.key !== 'Tab') return
      const items = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])') ?? [])
      if (!items.length) return
      const first = items[0]; const last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => { document.removeEventListener('keydown', onKeyDown); previousFocus?.focus() }
  }, [open, busy, onCancel])
  if (!open) return null
  return <div className="admin-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onCancel() }}><div ref={dialogRef} className="admin-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-description"><h2 id="confirm-title">{title}</h2><p id="confirm-description">{description}</p><div className="admin-dialog-actions"><button ref={cancelRef} className="button secondary" disabled={busy} onClick={onCancel}>Cancel</button><button className="button danger-button" disabled={busy} onClick={onConfirm}>{busy ? 'Working…' : confirmLabel}</button></div></div></div>
}

export function Field({ label, hint, children, wide = false }: { label: string; hint?: string; children: ReactNode; wide?: boolean }) {
  return <label className={`admin-field ${wide ? 'wide' : ''}`}><span>{label}</span>{hint && <small>{hint}</small>}{children}</label>
}

export function RichTextField({ label, hint, value, onChange, maxLength = 5000, rows = 7, required = false }: { label: string; hint?: string; value: string; onChange: (value: string) => void; maxLength?: number; rows?: number; required?: boolean }) {
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const insert = (before: string, after = before, placeholder = 'text') => {
    const input = inputRef.current
    if (!input) return
    const start = input.selectionStart
    const end = input.selectionEnd
    const selected = value.slice(start, end) || placeholder
    const next = `${value.slice(0, start)}${before}${selected}${after}${value.slice(end)}`.slice(0, maxLength)
    onChange(next)
    window.requestAnimationFrame(() => {
      input.focus()
      input.setSelectionRange(start + before.length, Math.min(start + before.length + selected.length, next.length))
    })
  }
  return <div className="admin-field admin-rich-field wide"><span>{label}</span>{hint && <small>{hint}</small>}<div className="admin-rich-toolbar" role="toolbar" aria-label={`${label} formatting`}><button type="button" onClick={() => insert('**', '**', 'bold text')} aria-label="Bold"><strong>B</strong></button><button type="button" onClick={() => insert('*', '*', 'italic text')} aria-label="Italic"><em>I</em></button><button type="button" onClick={() => insert('- ', '', 'list item')} aria-label="Bulleted list">• List</button><button type="button" onClick={() => insert('[', '](https://example.com)', 'link text')} aria-label="Link">Link</button></div><textarea ref={inputRef} required={required} maxLength={maxLength} rows={rows} value={value} onChange={(event) => onChange(event.target.value)} /><small className="admin-character-count">{value.length.toLocaleString('en-AU')} / {maxLength.toLocaleString('en-AU')}</small></div>
}
