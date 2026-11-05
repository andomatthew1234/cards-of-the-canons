import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AdminDataProvider } from '../../admin/AdminContext'
import { AdminLayout } from '../../admin/AdminLayout'
import { LoadingState } from '../../admin/components'
import { PageMeta } from '../../components/PageMeta'
import { useAuth } from '../../context/AuthContext'
import { AnalyticsPage } from './AnalyticsPage'
import { CommunityEditorPage } from './CommunityEditorPage'
import { CommunityPage } from './CommunityPage'
import { CustomerDetailPage } from './CustomerDetailPage'
import { CustomersPage } from './CustomersPage'
import { DashboardPage } from './DashboardPage'
import { EnquiriesPage } from './EnquiriesPage'
import { EnquiryDetailPage } from './EnquiryDetailPage'
import { EmailCampaignsPage } from './EmailCampaignsPage'
import { MailingListPage } from './MailingListPage'
import { NotificationsPage } from './NotificationsPage'
import { OrderDetailPage } from './OrderDetailPage'
import { OrdersPage } from './OrdersPage'
import { ProductEditorPage } from './ProductEditorPage'
import { ProductsPage } from './ProductsPage'
import { SettingsPage } from './SettingsPage'
import { TermsSettingsPage } from './TermsSettingsPage'
import { SocialMediaSettingsPage } from './SocialMediaSettingsPage'
import { WebsiteEditorPage } from './WebsiteEditorPage'
import { WebsiteDraftPreviewPage } from './WebsiteDraftPreview'
import { TreasuryPage } from './TreasuryPage'
import { JournalPage } from './JournalPage'
import { JournalEditorPage } from './JournalEditorPage'

export function AdminRoutes() {
  const { pathname } = useLocation()
  const { user, isAdmin, loading } = useAuth()
  if (loading) return <main className="admin-gate"><LoadingState label="Checking administrator access…" /></main>
  if (!isAdmin) return <main className="admin-gate"><PageMeta title="Administrator access" description="Restricted administrator area." /><div className="admin-access-card"><span className="admin-brand-mark">D</span><p className="eyebrow">Doxa</p><h1>Administrator access required</h1><p>{user ? 'This account does not have administrator access.' : 'Sign in with an authorised administrator account to continue.'}</p><Link className="button primary" to="/account">Go to account</Link><Link className="text-button" to="/">Return to storefront</Link></div></main>
  if (pathname === '/admin/website/preview') return <WebsiteDraftPreviewPage />
  return <AdminDataProvider><AdminLayout><Routes>
    <Route index element={<DashboardPage />} />
    <Route path="notifications" element={<NotificationsPage />} />
    <Route path="products" element={<ProductsPage />} />
    <Route path="products/new" element={<ProductEditorPage isNew />} />
    <Route path="products/:id" element={<ProductEditorPage />} />
    <Route path="orders" element={<OrdersPage />} />
    <Route path="orders/:id" element={<OrderDetailPage />} />
    <Route path="treasury" element={<TreasuryPage />} />
    <Route path="customers" element={<CustomersPage />} />
    <Route path="customers/:id" element={<CustomerDetailPage />} />
    <Route path="community" element={<CommunityPage />} />
    <Route path="community/new" element={<CommunityEditorPage isNew />} />
    <Route path="community/:id" element={<CommunityEditorPage />} />
    <Route path="enquiries" element={<EnquiriesPage />} />
    <Route path="enquiries/:id" element={<EnquiryDetailPage />} />
    <Route path="mailing-list" element={<MailingListPage />} />
    <Route path="email-campaigns" element={<EmailCampaignsPage />} />
    <Route path="journal" element={<JournalPage />} />
    <Route path="journal/new" element={<JournalEditorPage isNew />} />
    <Route path="journal/:id" element={<JournalEditorPage />} />
    <Route path="website" element={<WebsiteEditorPage />} />
    <Route path="website/preview" element={<WebsiteDraftPreviewPage />} />
    <Route path="content" element={<Navigate to="/admin/website" replace />} />
    <Route path="content/:page" element={<Navigate to="/admin/website" replace />} />
    <Route path="analytics" element={<AnalyticsPage />} />
    <Route path="settings" element={<SettingsPage />} />
    <Route path="settings/terms" element={<TermsSettingsPage />} />
    <Route path="settings/social-media" element={<SocialMediaSettingsPage />} />
    <Route path="*" element={<div className="admin-access-card"><h1>Admin page not found</h1><p>The requested workspace page does not exist.</p><Link className="button secondary" to="/admin">Return to dashboard</Link></div>} />
  </Routes></AdminLayout></AdminDataProvider>
}
