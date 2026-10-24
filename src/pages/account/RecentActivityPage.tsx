import {
  AlertCircle, CheckCircle2, Clock3, KeyRound, LogIn, MapPin, Package,
  RefreshCw, ShieldCheck, Smartphone, UserRound,
} from 'lucide-react'
import { useEffect, useMemo, useState, type ComponentType } from 'react'
import { Link } from 'react-router-dom'
import { AccountCentreShell } from '../../components/account/AccountChrome'
import { AccountPanel, AccountStatus } from '../../components/account/AccountCentreUI'
import { formatMoney } from '../../config'
import { useAuth } from '../../context/AuthContext'
import { listAccountActivity } from '../../lib/accountActivity'
import type { AccountActivityEvent, AccountActivityType } from '../../types'

type ActivityFilter = 'all' | AccountActivityEvent['category']

const filters: Array<{ value: ActivityFilter; label: string }> = [
  { value: 'all', label: 'All activity' },
  { value: 'security', label: 'Security' },
  { value: 'profile', label: 'Profile' },
  { value: 'purchase', label: 'Purchases' },
]

const eventIcons: Record<AccountActivityType, ComponentType<{ 'aria-hidden'?: boolean }>> = {
  login: LogIn,
  order_purchased: Package,
  email_changed: UserRound,
  password_changed: KeyRound,
  phone_changed: Smartphone,
  profile_changed: UserRound,
  mfa_enrolled: ShieldCheck,
  mfa_removed: ShieldCheck,
}

function eventDate(value: unknown) {
  if (value instanceof Date) return value
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') return value.toDate() as Date
  if (typeof value === 'string' || typeof value === 'number') return new Date(value)
  return null
}

function dayLabel(value: unknown) {
  const date = eventDate(value)
  if (!date || Number.isNaN(date.getTime())) return 'Date unavailable'
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  const key = date.toDateString()
  if (key === today.toDateString()) return 'Today'
  if (key === yesterday.toDateString()) return 'Yesterday'
  return date.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

function timeLabel(value: unknown) {
  const date = eventDate(value)
  if (!date || Number.isNaN(date.getTime())) return 'Time unavailable'
  return date.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })
}

function ApproximateLocationMap({ event }: { event: AccountActivityEvent }) {
  if (!event.location) return <div className="activity-location-unavailable"><MapPin aria-hidden="true" /><div><strong>Location unavailable</strong><p>A coarse IP location provider is not connected, so this sign-in is not placed on a map.</p></div></div>
  const x = Math.max(2, Math.min(98, ((event.location.longitude + 180) / 360) * 100))
  const y = Math.max(4, Math.min(96, ((90 - event.location.latitude) / 180) * 100))
  const place = [event.location.city, event.location.region, event.location.country].filter(Boolean).join(', ')
  return <figure className="activity-location-map">
    <div className="activity-map-canvas" role="img" aria-label={`Approximate sign-in location: ${place}`}>
      <svg viewBox="0 0 100 50" aria-hidden="true" preserveAspectRatio="none">
        <path d="M6 13 13 7l12 2 7 7-5 7-9-1-4 8-7-5Z" />
        <path d="m26 29 7 4 4 11-6 5-4-10-5-5Z" />
        <path d="m43 11 8-5 9 4 8-2 11 6 12 1 4 8-10 4-8-3-5 4-11-2-6 7-7-5 2-8-8-4Z" />
        <path d="m55 29 11 2 5 8-7 9-7-5-5-9Z" />
        <path d="m82 37 9-2 6 5-4 7-11-2Z" />
      </svg>
      <span className="activity-map-marker" style={{ left: `${x}%`, top: `${y}%` }}><MapPin aria-hidden="true" /></span>
    </div>
    <figcaption><strong>{place}</strong><span>Approximate IP-based location</span></figcaption>
    <p>IP locations are approximate. VPNs and mobile networks can make a sign-in appear somewhere else.</p>
  </figure>
}

function ActivityItem({ event }: { event: AccountActivityEvent }) {
  const Icon = eventIcons[event.type] || Clock3
  const orderAmount = event.type === 'order_purchased' && typeof event.metadata?.totalCents === 'number'
    ? formatMoney(event.metadata.totalCents)
    : null
  // Anything that is not explicit server evidence (including entries written
  // before provenance existed) is presented as unverified rather than as an
  // authoritative record.
  const unverified = event.verification !== 'server'
  return <article className={`activity-timeline-item ${event.category}`}>
    <span className="activity-timeline-icon"><Icon aria-hidden={true} /></span>
    <div className="activity-timeline-copy">
      <header><div><h3>{event.title}</h3><p>{event.description}</p></div><div className="activity-timing"><time>{timeLabel(event.createdAt)}</time>{unverified && <span className="account-status warning" title="Reported by your device rather than independently verified by a trusted service.">Unverified</span>}</div></header>
      {orderAmount && <div className="activity-order-detail"><span>{orderAmount}</span>{typeof event.metadata?.itemCount === 'number' && <small>{event.metadata.itemCount} item line{event.metadata.itemCount === 1 ? '' : 's'}</small>}<Link to="/account/orders">View orders</Link></div>}
      {event.type === 'login' && <ApproximateLocationMap event={event} />}
    </div>
  </article>
}

export function RecentActivityPage() {
  const auth = useAuth()
  const [events, setEvents] = useState<AccountActivityEvent[]>([])
  const [filter, setFilter] = useState<ActivityFilter>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = async () => {
    if (!auth.user) return
    setLoading(true)
    setError('')
    try {
      setEvents(await listAccountActivity(auth.user.uid))
    } catch {
      setError('Recent activity could not be loaded. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [auth.user?.uid])
  const visible = useMemo(() => filter === 'all' ? events : events.filter((event) => event.category === filter), [events, filter])
  const grouped = useMemo(() => visible.reduce<Array<{ label: string; events: AccountActivityEvent[] }>>((groups, event) => {
    const label = dayLabel(event.createdAt)
    const current = groups.at(-1)
    if (current?.label === label) current.events.push(event)
    else groups.push({ label, events: [event] })
    return groups
  }, []), [visible])

  return <AccountCentreShell title="Recent activity" eyebrow="Profile activity" description="Review important changes, purchases and sign-ins connected to your account.">
    <aside className="activity-privacy-note"><ShieldCheck aria-hidden="true" /><div><strong>Private to your account</strong><p>Activity is written by trusted services and retained for 180 days. Entries labelled “Unverified” were reported by your device and are not independently confirmed. Passwords, authenticator secrets and raw IP addresses are never shown here.</p></div></aside>

    <AccountPanel title="Account history" description="Events are recorded from the moment this feature was enabled; earlier history cannot be reconstructed safely.">
      <div className="activity-filter-bar" role="tablist" aria-label="Filter recent activity">
        {filters.map((item) => <button key={item.value} type="button" role="tab" aria-selected={filter === item.value} onClick={() => setFilter(item.value)}>{item.label}</button>)}
      </div>

      {loading ? <div className="activity-loading" role="status"><RefreshCw aria-hidden="true" /> Loading recent activity…</div>
        : error ? <div className="activity-error" role="alert"><AlertCircle aria-hidden="true" /><div><strong>Activity unavailable</strong><p>{error}</p><button type="button" className="account-text-button" onClick={() => void load()}>Try again</button></div></div>
          : grouped.length ? <div className="activity-timeline">{grouped.map((group) => <section key={group.label} className="activity-day"><h2>{group.label}</h2><div>{group.events.map((event) => <ActivityItem key={event.id} event={event} />)}</div></section>)}</div>
            : <div className="activity-empty"><CheckCircle2 aria-hidden="true" /><h3>{events.length ? 'No activity in this category' : 'No recent activity yet'}</h3><p>{events.length ? 'Choose another filter to review your account history.' : 'New sign-ins, profile and security changes, and completed purchases will appear here.'}</p></div>}
    </AccountPanel>
  </AccountCentreShell>
}
