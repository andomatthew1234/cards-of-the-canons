import { CreditCard, LayoutTemplate, ShieldCheck } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AdminPageHeader, AdminPanel, ConfirmDialog, ErrorState, LoadingState, StatusBadge } from '../../admin/components'
import { useAdminData } from '../../admin/AdminContext'
import { PageMeta } from '../../components/PageMeta'
import { getCommerceStatus, setLivePayments, type CommerceStatus } from '../../lib/data'

export function SettingsPage() {
  const { busy,runAction } = useAdminData()
  const [commerce,setCommerce] = useState<CommerceStatus | null>(null)
  const [commerceError,setCommerceError] = useState('')
  const [loading,setLoading] = useState(true)
  const [liveDialog,setLiveDialog] = useState(false)
  const loadCommerce = async () => {
    setLoading(true)
    setCommerceError('')
    try { setCommerce(await getCommerceStatus()) }
    catch { setCommerce(null);setCommerceError('The protected Stripe configuration could not be verified. Checkout status is unknown; no activation controls are available.') }
    finally { setLoading(false) }
  }
  useEffect(() => { void loadCommerce() },[])
  const updateLivePayments = async (enabled:boolean) => {
    const success = await runAction('live-payments',async () => { await setLivePayments(enabled) },enabled?'Live payments enabled.':'Live checkout locked.')
    if (success) setCommerce((current) => current ? {...current,livePaymentsEnabled:enabled} : current)
    setLiveDialog(false)
  }
  if (loading) return <LoadingState label="Loading protected settings…" />
  return <>
    <PageMeta title="Settings — Admin" description="Manage protected operational settings." />
    <AdminPageHeader eyebrow="Administration" title="Settings" description="Operational controls that remain separate from public website editing." />
    {commerceError && <ErrorState message={commerceError} onRetry={() => void loadCommerce()} />}
    <div className="admin-settings-main">
      <AdminPanel title="Website presentation" description="Business details, branding, content, navigation, theme and SEO now use the draft-and-publish Website Editor."><div className="admin-form-stack"><div className="admin-security-note"><LayoutTemplate /><p>Direct edits to live content are disabled. This prevents a partial save from leaving the public site in an inconsistent state.</p></div><Link className="button primary" to="/admin/website"><LayoutTemplate /> Open Website Editor</Link></div></AdminPanel>
      <AdminPanel title="Payments" description="Stripe Checkout environment and protected launch controls." className="admin-settings-section"><div id="payments" className="admin-payment-control">{commerce ? <><div className="admin-publish-summary"><StatusBadge tone={commerce.paymentEnvironment === 'live' ? commerce.livePaymentsActuallyAllowed ? 'positive' : 'warning' : 'info'}>{commerce.paymentEnvironment === 'live' ? commerce.livePaymentsActuallyAllowed ? 'Live payments active' : 'Live checkout locked' : 'Stripe sandbox active'}</StatusBadge><p>{commerce.paymentEnvironment === 'test' ? 'Customers can complete Stripe’s test checkout without making a real payment.' : commerce.livePaymentsActuallyAllowed ? 'The storefront can create live Stripe payments.' : commerce.livePaymentsEnabled ? 'Live checkout was enabled previously, but current credentials or webhook evidence no longer pass verification.' : 'Live credentials are installed, but checkout remains blocked until it is explicitly enabled.'}</p></div><div className="admin-security-note"><ShieldCheck /><p>Only authorised administrators can use this control. Website content cannot change payment credentials or checkout security behaviour.</p></div>{commerce.paymentEnvironment === 'live' && (commerce.livePaymentsEnabled ? <button className="button secondary danger" disabled={busy === 'live-payments'} onClick={() => void updateLivePayments(false)}>Lock live checkout</button> : <button className="button primary" disabled={!commerce.readyForLiveActivation || busy === 'live-payments'} onClick={() => setLiveDialog(true)}><CreditCard /> Enable live payments</button>)}{commerce.paymentEnvironment === 'test' && <button className="button secondary" disabled>Live activation available after launch setup</button>}</> : <div className="admin-security-note"><ShieldCheck /><p>Payment configuration is unavailable. The dashboard will not infer a test or live state.</p></div>}</div></AdminPanel>
    </div>
    <ConfirmDialog open={liveDialog} title="Enable real payments?" description="This immediately allows the storefront to create live Stripe Checkout Sessions that can move real money. Use it only after products, stock, shipping, policies, live credentials and the live webhook have passed launch testing." confirmLabel="Enable live payments" busy={busy === 'live-payments'} onConfirm={() => void updateLivePayments(true)} onCancel={() => setLiveDialog(false)} />
  </>
}
