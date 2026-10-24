import {
  ArrowLeft, BookOpenCheck, ChevronDown, ChevronRight, Circle, CircleUserRound, Clock3, Database, LayoutDashboard, ListChecks, LoaderCircle, LogOut, Mail, Menu, MessagesSquare, Package,
  ShieldCheck, UserRound, X,
} from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { Link, Navigate, NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { getCommunityAttentionCount } from '../../lib/community'
import { maskEmail } from '../../lib/security'
import { PageMeta } from '../PageMeta'

const accountDestinations = [
  { to: '/account/personal-info', label: 'Personal info & details', icon: UserRound },
  { to: '/account/activity', label: 'Recent activity', icon: Clock3 },
  { to: '/account/security', label: 'Security & sign-in', icon: ShieldCheck },
  { to: '/account/devices', label: 'Sessions & devices', icon: ListChecks },
  { to: '/account/privacy', label: 'Privacy & data', icon: Database },
  { to: '/account/mailing-list', label: 'Mailing list', icon: Mail },
  { to: '/account/manage', label: 'Account management', icon: ShieldCheck, danger: true },
]

function pathBelongsTo(pathname: string, destination: { to: string; end?: boolean }) {
  return destination.end ? pathname === destination.to : pathname === destination.to || pathname.startsWith(`${destination.to}/`)
}

export function AccountCentreShell({ title, description, eyebrow, children, loading = false }: { title: string; description: string; eyebrow: string; children: ReactNode; loading?: boolean }) {
  const auth = useAuth()
  const location = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(() => accountDestinations.some((item) => pathBelongsTo(location.pathname, item)))
  const [communityAttention, setCommunityAttention] = useState(0)
  const name = auth.user?.displayName || 'Collector'
  const isOverview = location.pathname === '/account'
  useEffect(() => setMobileOpen(false), [location.pathname])
  useEffect(() => {
    if (accountDestinations.some((item) => pathBelongsTo(location.pathname, item))) setAccountOpen(true)
  }, [location.pathname])
  useEffect(() => {
    if (!auth.user) return
    let active = true
    const refresh = (force = false) => void getCommunityAttentionCount(auth.user!.uid, force).then((count) => { if (active) setCommunityAttention(count) }).catch(() => { if (active) setCommunityAttention(0) })
    refresh()
    const handleUpdate = () => refresh(true)
    window.addEventListener('cards:community-updated', handleUpdate)
    return () => { active = false; window.removeEventListener('cards:community-updated', handleUpdate) }
  }, [auth.user])

  return <RequireAccount>
    <PageMeta title={title} description={description} />
    <div className="account-centre">
      <header className="account-centre-mobile-bar">
        {!isOverview ? <Link to="/account" className="account-mobile-back"><ArrowLeft aria-hidden="true" /> Overview</Link> : <span className="account-mobile-title">Account, profile, and security</span>}
        <button type="button" aria-label={mobileOpen ? 'Close account navigation' : 'Open account navigation'} aria-expanded={mobileOpen} onClick={() => setMobileOpen((open) => !open)}>{mobileOpen ? <X /> : <Menu />}</button>
      </header>
      {mobileOpen && <button className="account-centre-scrim" aria-label="Close account navigation" onClick={() => setMobileOpen(false)} />}
      <aside className={`account-centre-sidebar ${mobileOpen ? 'open' : ''}`}>
        <nav className="account-sidebar-navigation" aria-label="Account Centre">
          <NavLink to="/account" end className={({ isActive }) => `account-primary-link${isActive ? ' active' : ''}`}>{({ isActive }) => <><LayoutDashboard aria-hidden="true" /><span>Overview</span>{isActive ? <Circle className="account-primary-current" aria-hidden="true" /> : <ChevronRight className="account-primary-arrow" aria-hidden="true" />}</>}</NavLink>
          <section className={`account-nav-group account-profile-group ${accountOpen ? 'open' : ''}`}>
            <button type="button" className={`account-profile-toggle ${accountDestinations.some((item) => pathBelongsTo(location.pathname, item)) ? 'current' : ''}`} aria-expanded={accountOpen} aria-controls="account-centre-destinations" onClick={() => setAccountOpen((open) => !open)}>
              <span className="account-profile-icon" aria-hidden="true"><CircleUserRound /></span>
              <span className="account-profile-copy"><strong>Account, profile, and security</strong><span><b>{name}</b><i aria-hidden="true">|</i><small>{maskEmail(auth.user?.email)}</small></span>{auth.isAdmin && <em>Administrator</em>}</span>
              <ChevronDown className="account-nav-chevron" aria-hidden="true" />
            </button>
            {accountOpen && <div id="account-centre-destinations" className="account-nav-group-items">{accountDestinations.map(({ to, label, icon: Icon, danger }) => <NavLink key={to} to={to} className={({ isActive }) => `${isActive ? 'active' : ''}${danger ? ' danger' : ''}`}><Icon aria-hidden="true" /><span>{label}</span></NavLink>)}</div>}
          </section>
          <NavLink to="/account/orders" className={({ isActive }) => `account-primary-link${isActive ? ' active' : ''}`}>{({ isActive }) => <><Package aria-hidden="true" /><span>Orders</span>{isActive ? <Circle className="account-primary-current" aria-hidden="true" /> : <ChevronRight className="account-primary-arrow" aria-hidden="true" />}</>}</NavLink>
          <NavLink to="/account/treasury" className={({ isActive }) => `account-primary-link${isActive ? ' active' : ''}`}>{({ isActive }) => <><BookOpenCheck aria-hidden="true" /><span>My Treasury</span>{isActive ? <Circle className="account-primary-current" aria-hidden="true" /> : <ChevronRight className="account-primary-arrow" aria-hidden="true" />}</>}</NavLink>
          <NavLink to="/account/community" className={({ isActive }) => `account-primary-link account-community-link${isActive ? ' active' : ''}`}>{({ isActive }) => <><span className="account-community-icon"><MessagesSquare aria-hidden="true" />{communityAttention > 0 && <span className="account-community-dot" aria-hidden="true" />}</span><span>Community</span>{isActive ? <Circle className="account-primary-current" aria-hidden="true" /> : <ChevronRight className="account-primary-arrow" aria-hidden="true" />}{communityAttention > 0 && <span className="sr-only">{communityAttention} unanswered {communityAttention === 1 ? 'survey' : 'surveys'}</span>}</>}</NavLink>
        </nav>
        <div className="account-sidebar-footer">
          {auth.isAdmin && <Link to="/admin"><LayoutDashboard aria-hidden="true" /> Administrator workspace</Link>}
          <button type="button" onClick={() => void auth.logOut()}><LogOut aria-hidden="true" /> Sign out</button>
        </div>
      </aside>
      <div className="account-centre-main">
        {loading ? <div className="account-route-loader" role="status" aria-label="Loading account page" aria-live="polite"><span className="account-route-loader-rings" aria-hidden="true"><LoaderCircle /><i /></span><span className="sr-only">Loading account page</span></div> : <><header className="account-centre-page-heading"><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{description}</p></header><div className="account-centre-page-content">{children}</div></>}
      </div>
    </div>
  </RequireAccount>
}

export function RequireAccount({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return <section className="empty-state account-auth-check" role="status"><ShieldCheck aria-hidden="true" /><p>Checking your account…</p></section>
  if (!user) return <Navigate to="/account" replace state={{ from: location.pathname + location.search }} />
  return children
}

/** Older flows import this; their navigation now comes from AccountCentreShell. */
export function AccountNavigation() { return null }
