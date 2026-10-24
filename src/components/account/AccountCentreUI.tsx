import { ArrowRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

export function AccountPanel({ title, description, children, className = '' }: { title: string; description?: string; children: ReactNode; className?: string }) {
  return <section className={`account-panel ${className}`}><header><h2>{title}</h2>{description && <p>{description}</p>}</header><div className="account-panel-body">{children}</div></section>
}

export function AccountSettingRow({ icon, title, description, status, action, tone = 'neutral' }: { icon: ReactNode; title: string; description: ReactNode; status?: ReactNode; action?: ReactNode; tone?: 'neutral' | 'positive' | 'warning' | 'danger' }) {
  return <div className={`account-setting-row security-setting-row ${tone}`}><span className="account-setting-icon">{icon}</span><div className="account-setting-copy"><div><h3>{title}</h3>{status}</div><div>{description}</div></div>{action && <div className="account-setting-action">{action}</div>}</div>
}

export function AccountStatus({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'positive' | 'warning' | 'danger' }) {
  return <span className={`account-status ${tone}`}>{children}</span>
}

export function AccountTextLink({ to, children }: { to: string; children: ReactNode }) {
  return <Link className="account-text-link" to={to}>{children}<ArrowRight aria-hidden="true" /></Link>
}

export function AccountFeedback({ tone, children }: { tone: 'success' | 'error'; children: ReactNode }) {
  return <p className={`account-feedback ${tone}`} role={tone === 'error' ? 'alert' : 'status'}>{children}</p>
}

export function AccountRequestError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <div className="account-feedback account-request-error error" role="alert"><span>{message}</span><button type="button" className="account-text-button" onClick={onRetry}>Try again</button></div>
}
