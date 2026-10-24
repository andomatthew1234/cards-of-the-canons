import { BarChart3, Bell, BookOpenCheck, BookOpenText, Inbox, LayoutDashboard, LayoutTemplate, LogOut, Mail, Mails, Menu, MessagesSquare, Package, PanelLeftClose, PanelLeftOpen, Settings, ShoppingBag, Store, UserRound, Users, X } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { PageTransition } from '../components/PageTransition'
import { useAuth } from '../context/AuthContext'
import { useAdminData } from './AdminContext'

const navGroups = [
  { label: 'Overview', items: [{ to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true }, { to: '/admin/notifications', label: 'Notifications', icon: Bell }] },
  { label: 'Commerce', items: [{ to: '/admin/products', label: 'Products', icon: Package }, { to: '/admin/orders', label: 'Orders', icon: ShoppingBag }, { to: '/admin/treasury', label: 'Treasury & codes', icon: BookOpenCheck }] },
  { label: 'Customers', items: [{ to: '/admin/customers', label: 'Customer accounts', icon: Users }, { to: '/admin/community', label: 'Community', icon: MessagesSquare }, { to: '/admin/enquiries', label: 'Enquiries', icon: Inbox }, { to: '/admin/mailing-list', label: 'Mailing list', icon: Mail }, { to: '/admin/email-campaigns', label: 'Email campaigns & queue', icon: Mails }] },
  { label: 'Website', items: [{ to: '/admin/website', label: 'Website editor', icon: LayoutTemplate }, { to: '/admin/journal', label: 'Journal', icon: BookOpenText }, { to: '/admin/analytics', label: 'Analytics', icon: BarChart3 }, { to: '/admin/settings', label: 'Settings', icon: Settings }] },
]

export function AdminLayout({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  const editorRoute = pathname.startsWith('/admin/website') || pathname.startsWith('/admin/email-campaigns')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => editorRoute && localStorage.getItem('doxa:editor-admin-nav') !== 'expanded')
  const { user, logOut } = useAuth()
  const { toast, dismissToast } = useAdminData()
  useEffect(() => setDrawerOpen(false), [pathname])
  useEffect(() => {
    if (!editorRoute) setSidebarCollapsed(false)
    else if (localStorage.getItem('doxa:editor-admin-nav') !== 'expanded') setSidebarCollapsed(true)
  }, [editorRoute])
  useEffect(() => {
    document.body.classList.add('admin-body')
    return () => document.body.classList.remove('admin-body')
  }, [])
  const toggleSidebar = () => setSidebarCollapsed((current) => {
    const next = !current
    localStorage.setItem('doxa:editor-admin-nav', next ? 'collapsed' : 'expanded')
    return next
  })
  return <div className={`admin-app${editorRoute ? ' website-editor-route' : ''}${editorRoute && sidebarCollapsed ? ' admin-nav-collapsed' : ''}`}>
    <a className="skip-link" href="#admin-content">Skip to admin content</a>
    <button className="admin-mobile-bar" onClick={() => setDrawerOpen(true)} aria-expanded={drawerOpen} aria-controls="admin-sidebar"><Menu /><span>Administration</span></button>
    {drawerOpen && <button className="admin-drawer-scrim" aria-label="Close navigation" onClick={() => setDrawerOpen(false)} />}
    <aside id="admin-sidebar" className={`admin-sidebar ${drawerOpen ? 'open' : ''}`}>
      <div className="admin-brand"><span className="admin-brand-mark">D</span><span><strong>Doxa</strong><small>Administrator</small></span>{editorRoute && <button className="admin-sidebar-collapse" aria-label={sidebarCollapsed ? 'Expand administrator navigation' : 'Collapse administrator navigation'} aria-expanded={!sidebarCollapsed} onClick={toggleSidebar}>{sidebarCollapsed ? <PanelLeftOpen /> : <PanelLeftClose />}</button>}<button className="admin-sidebar-mobile-close" aria-label="Close navigation" onClick={() => setDrawerOpen(false)}><X /></button></div>
      <nav aria-label="Administrator navigation">{navGroups.map((group) => <div className="admin-nav-group" key={group.label}><p>{group.label}</p>{group.items.map((item) => { const { to, label, icon: Icon } = item; return <NavLink key={to} to={to} title={sidebarCollapsed ? label : undefined} data-tooltip={label} aria-label={sidebarCollapsed ? label : undefined} end={'end' in item ? item.end : undefined}><Icon aria-hidden="true" /><span>{label}</span></NavLink> })}</div>)}</nav>
      <div className="admin-sidebar-footer"><Link to="/" data-tooltip="View storefront" aria-label={sidebarCollapsed ? 'View storefront' : undefined}><Store aria-hidden="true" /><span>View storefront</span></Link><div className="admin-profile"><UserRound aria-hidden="true" /><span><strong>{user?.displayName || 'Administrator'}</strong><small>{user?.email || 'Signed in'}</small></span><button title="Sign out" data-tooltip="Sign out" aria-label="Sign out" onClick={() => void logOut()}><LogOut /></button></div></div>
    </aside>
    <main id="admin-content" className="admin-content" tabIndex={-1}><PageTransition>{children}</PageTransition></main>
    {toast && <div className={`admin-toast ${toast.tone}`} role="status"><span>{toast.message}</span><button aria-label="Dismiss notification" onClick={dismissToast}><X /></button></div>}
  </div>
}
