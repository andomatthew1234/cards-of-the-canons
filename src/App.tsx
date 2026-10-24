import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Layout } from './components/Layout'
import { AccountCentreShell } from './components/account/AccountChrome'
import { AuthProvider, useAuth } from './context/AuthContext'
import { CartProvider } from './context/CartContext'
import { CatalogProvider } from './context/CatalogContext'
import { SiteContentProvider } from './context/SiteContentContext'
import { trackPageView } from './lib/analytics'
import { About } from './pages/About'
import { Contact } from './pages/Contact'
import { Home } from './pages/Home'
import { Journal, JournalArticle } from './pages/Journal'
import { NotFound } from './pages/NotFound'
import { ProductDetail } from './pages/ProductDetail'
import { Shop } from './pages/Shop'

const Account = lazy(() => import('./pages/Account').then((module) => ({ default: module.Account })))
const centrePages = () => import('./pages/account/AccountCentrePages')
const AccountDevicesPage = lazy(() => centrePages().then((module) => ({ default: module.AccountDevicesPage })))
const AccountManagementPage = lazy(() => centrePages().then((module) => ({ default: module.AccountManagementPage })))
const AccountOrdersPage = lazy(() => centrePages().then((module) => ({ default: module.AccountOrdersPage })))
const AccountPrivacyPage = lazy(() => centrePages().then((module) => ({ default: module.AccountPrivacyPage })))
const AccountCommunityPage = lazy(() => import('./pages/account/CommunityPage').then((module) => ({ default: module.CommunityPage })))
const AccountTreasuryPage = lazy(() => import('./pages/account/TreasuryPage').then((module) => ({ default: module.TreasuryPage })))
const AccountMailingListPage = lazy(() => import('./pages/account/MailingListPage').then((module) => ({ default: module.MailingListPage })))
const AccountOnboarding = lazy(() => import('./pages/account/AccountOnboarding').then((module) => ({ default: module.AccountOnboarding })))
const ChangeEmailFlow = lazy(() => import('./pages/account/ChangeEmailFlow').then((module) => ({ default: module.ChangeEmailFlow })))
const DeleteAccountFlow = lazy(() => import('./pages/account/DeleteAccountFlow').then((module) => ({ default: module.DeleteAccountFlow })))
const EmailCodeSetup = lazy(() => import('./pages/account/EmailCodeSetup').then((module) => ({ default: module.EmailCodeSetup })))
const PersonalInfoPage = lazy(() => import('./pages/account/PersonalInfoPage').then((module) => ({ default: module.PersonalInfoPage })))
const RecentActivityPage = lazy(() => import('./pages/account/RecentActivityPage').then((module) => ({ default: module.RecentActivityPage })))
const SecurityCentre = lazy(() => import('./pages/account/SecurityCentre').then((module) => ({ default: module.SecurityCentre })))
const TotpSetupFlow = lazy(() => import('./pages/account/TotpSetupFlow').then((module) => ({ default: module.TotpSetupFlow })))
const Admin = lazy(() => import('./pages/Admin').then((module) => ({ default: module.Admin })))
const Cart = lazy(() => import('./pages/Cart').then((module) => ({ default: module.Cart })))
const NewsletterConfirmPage = lazy(() => import('./pages/NewsletterConsent').then((module) => ({ default: module.NewsletterConfirmPage })))
const NewsletterUnsubscribePage = lazy(() => import('./pages/NewsletterConsent').then((module) => ({ default: module.NewsletterUnsubscribePage })))
const CheckoutSuccess = lazy(() => import('./pages/CheckoutResult').then((module) => ({ default: module.CheckoutSuccess })))
const CheckoutCancelled = lazy(() => import('./pages/CheckoutResult').then((module) => ({ default: module.CheckoutCancelled })))

function ScrollToTop() {
  const { pathname, hash } = useLocation()
  useEffect(() => {
    const targetId = hash ? decodeURIComponent(hash.slice(1)) : ''
    let observer: MutationObserver | undefined
    let timeout: number | undefined
    const frame = window.requestAnimationFrame(() => {
      if (!targetId) {
        window.scrollTo({ top: 0 })
        document.getElementById('admin-content')?.scrollTo({ top: 0 })
        return
      }

      const scrollToTarget = () => {
        const target = document.getElementById(targetId)
        if (!target) return false
        target.scrollIntoView({ block: 'start' })
        return true
      }

      if (scrollToTarget()) return
      observer = new MutationObserver(() => {
        if (scrollToTarget()) observer?.disconnect()
      })
      observer.observe(document.body, { childList: true, subtree: true })
      timeout = window.setTimeout(() => observer?.disconnect(), 5_000)
    })
    trackPageView(pathname)
    return () => {
      window.cancelAnimationFrame(frame)
      observer?.disconnect()
      if (timeout) window.clearTimeout(timeout)
    }
  }, [pathname, hash])
  return null
}

function LegacyAccountRedirect({ to }: { to: string }) {
  const { search } = useLocation()
  return <Navigate to={`${to}${search}`} replace />
}

function RouteFallback() {
  const { pathname } = useLocation()
  const auth = useAuth()
  if (auth.user && pathname.startsWith('/account')) {
    return <AccountCentreShell title="Account" description="" eyebrow="" loading><span /></AccountCentreShell>
  }
  return <div className="route-loading" role="status" aria-live="polite">Loading…</div>
}

function AppRoutes() {
  const { pathname } = useLocation()
  const routes = <Suspense fallback={<RouteFallback />}><Routes>
    <Route path="/" element={<Home />} />
    <Route path="/home" element={<Navigate to="/" replace />} />
    <Route path="/shop" element={<Shop />} />
    <Route path="/shop/category/:categorySlug" element={<Shop />} />
    <Route path="/product/:slug" element={<ProductDetail />} />
    <Route path="/cart" element={<Cart />} />
    <Route path="/checkout/success" element={<CheckoutSuccess />} />
    <Route path="/checkout/cancelled" element={<CheckoutCancelled />} />
    <Route path="/about" element={<About />} />
    <Route path="/contact" element={<Contact />} />
    <Route path="/journal" element={<Journal />} />
    <Route path="/journal/:slug" element={<JournalArticle />} />
    <Route path="/account" element={<Account />} />
    <Route path="/account/onboarding" element={<AccountOnboarding />} />
    <Route path="/account/personal-info" element={<PersonalInfoPage />} />
    <Route path="/account/activity" element={<RecentActivityPage />} />
    <Route path="/account/security" element={<SecurityCentre />} />
    <Route path="/account/security/email" element={<ChangeEmailFlow />} />
    <Route path="/account/security/email-code" element={<EmailCodeSetup />} />
    <Route path="/account/security/authenticator" element={<TotpSetupFlow />} />
    <Route path="/account/orders" element={<AccountOrdersPage />} />
    <Route path="/account/treasury" element={<AccountTreasuryPage />} />
    <Route path="/account/community" element={<AccountCommunityPage />} />
    <Route path="/account/mailing-list" element={<AccountMailingListPage />} />
    <Route path="/account/devices" element={<AccountDevicesPage />} />
    <Route path="/account/privacy" element={<AccountPrivacyPage />} />
    <Route path="/account/preferences" element={<Navigate to="/account" replace />} />
    <Route path="/account/manage" element={<AccountManagementPage />} />
    <Route path="/account/manage/delete" element={<DeleteAccountFlow />} />
    <Route path="/account/settings" element={<LegacyAccountRedirect to="/account/security" />} />
    <Route path="/account/settings/email" element={<LegacyAccountRedirect to="/account/security/email" />} />
    <Route path="/account/settings/email-code" element={<LegacyAccountRedirect to="/account/security/email-code" />} />
    <Route path="/account/settings/authenticator" element={<LegacyAccountRedirect to="/account/security/authenticator" />} />
    <Route path="/account/settings/delete" element={<LegacyAccountRedirect to="/account/manage/delete" />} />
    <Route path="/admin/*" element={<Admin />} />
    <Route path="/newsletter/confirm" element={<NewsletterConfirmPage />} />
    <Route path="/newsletter/unsubscribe" element={<NewsletterUnsubscribePage />} />
    <Route path="*" element={<NotFound />} />
  </Routes></Suspense>
  return pathname.startsWith('/admin') ? routes : <Layout>{routes}</Layout>
}

export default function App() {
  return <BrowserRouter><AuthProvider><SiteContentProvider><CatalogProvider><CartProvider><ScrollToTop /><AppRoutes /></CartProvider></CatalogProvider></SiteContentProvider></AuthProvider></BrowserRouter>
}
