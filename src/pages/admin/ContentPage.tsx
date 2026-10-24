import { ArrowRight, Home, Info, Mail } from 'lucide-react'
import { Link } from 'react-router-dom'
import { AdminPageHeader, AdminPanel, StatusBadge } from '../../admin/components'
import { PageMeta } from '../../components/PageMeta'
import { defaultPageContent } from '../../context/SiteContentContext'
import { useSiteContent } from '../../context/SiteContentContext'

export function ContentPage() {
  const { pages, settings } = useSiteContent()
  const editable = [
    { title: 'Home', description: 'Hero, moving values, featured collection, story copy and imagery.', to: '/admin/content/home', icon: Home, status: pages.home?.status ?? defaultPageContent.home.status },
    { title: 'About', description: 'Purpose, introduction and page imagery.', to: '/admin/content/about', icon: Info, status: pages.about?.status ?? defaultPageContent.about.status },
  ]
  return <>
    <PageMeta title="Website content — Admin" description="Choose a public page or content area to edit." />
    <AdminPageHeader eyebrow="Website" title="Website content" description="Select the public page or content area you wish to update." />
    <AdminPanel className="admin-content-directory"><div className="admin-content-grid">{editable.map(({ title, description, to, icon: Icon, status }) => <Link to={to} key={to}><span className="admin-content-icon"><Icon /></span><span><strong>{title}</strong><small>{description}</small></span><StatusBadge tone={status === 'published' ? 'positive' : 'neutral'}>{status}</StatusBadge><ArrowRight /></Link>)}<Link to="/admin/settings#general"><span className="admin-content-icon"><Mail /></span><span><strong>Contact details</strong><small>Public business name and contact email.</small></span><StatusBadge tone={settings.status === 'draft' ? 'neutral' : 'positive'}>{settings.status ?? 'published'}</StatusBadge><ArrowRight /></Link></div></AdminPanel>
    <p className="admin-footnote">The editor deliberately uses structured sections so public pages remain consistent, accessible and difficult to break.</p>
  </>
}
