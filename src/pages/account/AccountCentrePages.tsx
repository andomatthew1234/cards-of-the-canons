import {
  CheckCircle2, Database, FileText, Laptop, LockKeyhole, Mail, MessagesSquare,
  Package, ShieldCheck, ShoppingBag, Trash2, UserRound,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AccountCentreShell } from '../../components/account/AccountChrome'
import { AccountPanel, AccountRequestError, AccountSettingRow, AccountStatus, AccountTextLink } from '../../components/account/AccountCentreUI'
import { formatMoney } from '../../config'
import { friendlyAuthError, useAuth } from '../../context/AuthContext'
import { getAccountSecurityPolicy, getUserProfile } from '../../lib/accounts'
import { authenticatorFactorId } from '../../lib/authenticatorMfa'
import { getCommunityAttentionCount } from '../../lib/community'
import { getMyMailingListStatus, joinAccountMailingList, leaveAccountMailingList, listOrdersForUser } from '../../lib/data'
import { maskEmail, providerName } from '../../lib/security'
import type { AccountMailingListStatus, AccountSecurityPolicy, Order, UserProfile } from '../../types'

const initialPolicy: AccountSecurityPolicy = {
  version: 1,
  methods: {
    emailCode: { status: 'not_configured', verifiedAt: null },
    authenticator: { status: 'not_configured', verifiedAt: null },
    passkey: { status: 'not_configured', verifiedAt: null },
  },
  requirements: { signIn: false, criticalActions: false, paymentActions: false, passwordlessSignIn: false },
}

function friendlyDate(value?: string) {
  if (!value) return 'Not available'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Not available' : date.toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })
}

function useAccountSummary() {
  const auth = useAuth()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [policy, setPolicy] = useState(initialPolicy)
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [errors, setErrors] = useState<Partial<Record<'profile' | 'policy' | 'orders', string>>>({})
  const [requestVersion, setRequestVersion] = useState(0)
  useEffect(() => {
    if (!auth.user) { setLoading(false); return }
    let active = true
    setLoading(true)
    setErrors({})
    Promise.allSettled([getUserProfile(auth.user.uid), getAccountSecurityPolicy(), listOrdersForUser(auth.user.uid)]).then(([profileResult, policyResult, ordersResult]) => {
      if (!active) return
      if (profileResult.status === 'fulfilled') setProfile(profileResult.value)
      if (policyResult.status === 'fulfilled') setPolicy(policyResult.value.policy)
      if (ordersResult.status === 'fulfilled') setOrders(ordersResult.value)
      setErrors({
        ...(profileResult.status === 'rejected' ? { profile: friendlyAuthError(profileResult.reason) } : {}),
        ...(policyResult.status === 'rejected' ? { policy: friendlyAuthError(policyResult.reason) } : {}),
        ...(ordersResult.status === 'rejected' ? { orders: friendlyAuthError(ordersResult.reason) } : {}),
      })
      setLoading(false)
    })
    return () => { active = false }
  }, [auth.user, requestVersion])
  return { profile, policy, orders, loading, errors, retry: () => setRequestVersion((current) => current + 1) }
}

export function AccountOverview() {
  const auth = useAuth()
  const { profile, policy, orders, loading, errors, retry } = useAccountSummary()
  const [communityAttention, setCommunityAttention] = useState(0)
  const [mailingList, setMailingList] = useState<AccountMailingListStatus | null>(null)
  const [mailingBusy, setMailingBusy] = useState(false)
  const [mailingFeedback, setMailingFeedback] = useState('')
  const [overviewErrors, setOverviewErrors] = useState<Partial<Record<'community' | 'mailing', string>>>({})
  const [overviewRequestVersion, setOverviewRequestVersion] = useState(0)
  const authenticatorEnabled = auth.mfaFactors.some((factor) => factor.factorId === authenticatorFactorId)
  const needsAttention = !auth.user?.emailVerified || !authenticatorEnabled
  const name = profile?.displayName || auth.user?.displayName || 'Collector'
  const providerLabel = auth.providers.map(providerName).join(', ') || 'Unavailable'
  const mailingEnabled = mailingList?.status === 'subscribed' || mailingList?.status === 'pending'

  useEffect(() => {
    if (!auth.user) return
    let active = true
    setOverviewErrors({})
    void Promise.allSettled([getCommunityAttentionCount(auth.user.uid), getMyMailingListStatus()]).then(([communityResult, mailingResult]) => {
      if (!active) return
      if (communityResult.status === 'fulfilled') setCommunityAttention(communityResult.value)
      if (mailingResult.status === 'fulfilled') setMailingList(mailingResult.value)
      setOverviewErrors({
        ...(communityResult.status === 'rejected' ? { community: friendlyAuthError(communityResult.reason) } : {}),
        ...(mailingResult.status === 'rejected' ? { mailing: friendlyAuthError(mailingResult.reason) } : {}),
      })
    })
    return () => { active = false }
  }, [auth.user, overviewRequestVersion])

  async function updateMailingList(enabled: boolean) {
    setMailingBusy(true)
    setMailingFeedback('')
    try {
      const result = enabled ? await joinAccountMailingList('account_settings') : await leaveAccountMailingList()
      setMailingList(result)
      setMailingFeedback(enabled ? (result.status === 'pending' ? 'Preference saved. Verify your email to activate it.' : 'Mailing list turned on.') : 'Mailing list turned off.')
    } catch {
      setMailingFeedback('This preference could not be updated. Please try again.')
    } finally {
      setMailingBusy(false)
    }
  }

  return <AccountCentreShell title={`Welcome, ${name.split(' ')[0]}`} eyebrow="Overview" description="A clear view of your account, recent purchases and community activity.">
    {errors.profile && <AccountRequestError message={errors.profile} onRetry={retry} />}
    <div className="account-overview-dashboard" aria-busy={loading}>
      <AccountPanel title="Orders & purchases" description="Your most recent purchase activity." className="account-summary-panel account-overview-orders">
        {errors.orders ? <AccountRequestError message={errors.orders} onRetry={retry} /> : orders[0] ? <div className="account-overview-order-tile"><Package aria-hidden="true" /><div><strong>Order #{orders[0].id}</strong><p>{orders[0].items.length} item line{orders[0].items.length === 1 ? '' : 's'}</p></div><span>{formatMoney(orders[0].totalCents, orders[0].currency)}</span></div> : <div className="account-overview-empty"><ShoppingBag aria-hidden="true" /><p>No purchases yet.</p></div>}
        <AccountTextLink to="/account/orders">View orders & purchases</AccountTextLink>
      </AccountPanel>

      <AccountPanel title="Community" description="New polls and surveys shared with account members." className="account-summary-panel account-overview-community">
        {overviewErrors.community ? <AccountRequestError message={overviewErrors.community} onRetry={() => setOverviewRequestVersion((current) => current + 1)} /> : <div className="account-overview-community-count"><MessagesSquare aria-hidden="true" /><div><strong>{communityAttention}</strong><p>{communityAttention === 1 ? 'survey waiting for you' : communityAttention > 1 ? 'surveys waiting for you' : 'new surveys waiting'}</p></div>{communityAttention > 0 && <AccountStatus tone="warning">New</AccountStatus>}</div>}
        <AccountTextLink to="/account/community">Open Community</AccountTextLink>
      </AccountPanel>

      <AccountPanel title="Mailing list" description="Choose whether to receive occasional collection news and updates." className="account-summary-panel account-overview-mailing">
        {overviewErrors.mailing && <AccountRequestError message={overviewErrors.mailing} onRetry={() => setOverviewRequestVersion((current) => current + 1)} />}
        {!overviewErrors.mailing && <label className="account-overview-mailing-toggle"><span><strong>Mailing-list updates</strong><small>{mailingEnabled ? mailingList?.status === 'pending' ? 'Preference saved; email verification required.' : `On for ${maskEmail(mailingList?.email || auth.user?.email)}` : 'Currently turned off.'}</small></span><input type="checkbox" role="switch" aria-label="Receive mailing-list updates" checked={mailingEnabled} disabled={mailingBusy || mailingList === null} onChange={(event) => void updateMailingList(event.target.checked)} /><i aria-hidden="true" /></label>}
        {mailingFeedback && <p className="account-overview-mailing-feedback" role="status">{mailingFeedback}</p>}
        <AccountTextLink to="/account/mailing-list">Manage mailing list</AccountTextLink>
      </AccountPanel>

      <AccountPanel title="Security checkup" description={needsAttention ? 'One or more account protections need your attention.' : 'Your key account protections are in place.'} className="account-summary-panel account-overview-security">
        {errors.policy && <AccountRequestError message={errors.policy} onRetry={retry} />}
        <div className="account-checkup-heading"><span className={`account-checkup-icon ${needsAttention ? 'warning' : 'positive'}`}><ShieldCheck aria-hidden="true" /></span><div><strong>{needsAttention ? 'Review recommended' : 'Looking good'}</strong><p>{needsAttention ? (!auth.user?.emailVerified ? 'Verify your email to protect recovery and future account changes.' : 'Add an authenticator for stronger sign-in protection.') : 'Your email and additional sign-in protection are configured.'}</p></div><AccountStatus tone={needsAttention ? 'warning' : 'positive'}>{needsAttention ? 'Action available' : 'Protected'}</AccountStatus></div>
        <dl className="account-checkup-list"><div><dt><Laptop aria-hidden="true" /> Recent account activity</dt><dd>{friendlyDate(auth.user?.metadata.lastSignInTime)}</dd></div><div><dt><LockKeyhole aria-hidden="true" /> Current login method</dt><dd>{providerLabel}</dd></div><div><dt><Mail aria-hidden="true" /> Account email</dt><dd>{auth.user?.emailVerified ? 'Verified' : 'Not verified'}</dd></div><div><dt><ShieldCheck aria-hidden="true" /> Additional protection</dt><dd>{authenticatorEnabled ? 'Authenticator enabled' : policy.methods.emailCode.status === 'enabled' ? 'Email code enabled' : 'Not configured'}</dd></div></dl>
        <AccountTextLink to="/account/security">Open security checkup</AccountTextLink>
      </AccountPanel>
    </div>
  </AccountCentreShell>
}

export function AccountOrdersPage() {
  const auth = useAuth()
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [requestVersion, setRequestVersion] = useState(0)
  useEffect(() => {
    if (!auth.user) { setLoading(false); return }
    let active = true
    setLoading(true)
    setError('')
    void listOrdersForUser(auth.user.uid)
      .then((items) => { if (active) setOrders(items) })
      .catch((requestError) => { if (active) setError(friendlyAuthError(requestError)) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [auth.user, requestVersion])
  return <AccountCentreShell title="Orders & purchases" eyebrow="Purchase history" description="Review purchases connected to your customer account.">
    <AccountPanel title="Order history" description="Test purchases are clearly separated from future live orders.">
      {loading ? <p className="account-panel-empty" role="status">Loading your orders…</p> : error ? <AccountRequestError message={error} onRetry={() => setRequestVersion((current) => current + 1)} /> : orders.length ? <div className="account-order-list-v2">{orders.map((order) => <article key={order.id}><span className="account-setting-icon"><ShoppingBag aria-hidden="true" /></span><div><strong>Order #{order.id}</strong><p>{order.items.map((item) => `${item.quantity} × ${item.name}`).join(', ')}</p></div><div><AccountStatus tone={order.paymentEnvironment === 'live' ? 'positive' : 'warning'}>{order.paymentEnvironment === 'live' ? 'Live order' : 'Test order'}</AccountStatus><strong>{formatMoney(order.totalCents, order.currency)}</strong><small>{order.status.replace('_', ' ')}</small></div></article>)}</div> : <div className="account-page-empty"><Package aria-hidden="true" /><h3>No orders yet</h3><p>Purchases made while signed in will appear here.</p><Link className="button secondary" to="/shop">Browse the collection</Link></div>}
    </AccountPanel>
  </AccountCentreShell>
}

export function AccountDevicesPage() {
  const auth = useAuth()
  return <AccountCentreShell title="Sessions & devices" eyebrow="Account activity" description="Review the session information that can be determined truthfully for this account.">
    <AccountPanel title="Current session" description="Firebase securely maintains your signed-in browser session.">
      <AccountSettingRow icon={<Laptop aria-hidden="true" />} title="This browser" tone="positive" status={<AccountStatus tone="positive"><CheckCircle2 aria-hidden="true" /> Current session</AccountStatus>} description={<><p>Last authenticated {friendlyDate(auth.user?.metadata.lastSignInTime)}.</p><small>Browser, device model and location are not collected here, so they are not guessed.</small></>} action={<button className="account-text-button" onClick={() => void auth.logOut()}>Sign out</button>} />
    </AccountPanel>
  </AccountCentreShell>
}

export function AccountPrivacyPage() {
  return <AccountCentreShell title="Privacy & data" eyebrow="Your information" description="Understand what account data is stored and how to ask questions about it.">
    <AccountPanel title="Private account data" description="Access is protected by your authenticated account identity.">
      <AccountSettingRow icon={<UserRound aria-hidden="true" />} title="Profile information" description={<><p>Your name, email address and optional phone number support your account and enquiries.</p><small>Only you and authorised administrators can access private profile records.</small></>} action={<AccountTextLink to="/account/personal-info">Review details</AccountTextLink>} />
      <AccountSettingRow icon={<Package aria-hidden="true" />} title="Order records" description={<><p>Orders connected to your identity are available from your purchase history.</p><small>Completed business records may be retained where operationally or legally required.</small></>} action={<AccountTextLink to="/account/orders">View orders</AccountTextLink>} />
      <AccountSettingRow icon={<LockKeyhole aria-hidden="true" />} title="Authentication data" description={<><p>Firebase Authentication manages sign-in credentials and enrolled security factors.</p><small>Passwords and authenticator secrets are not displayed by this Account Centre.</small></>} />
    </AccountPanel>
    <AccountPanel title="Privacy requests" description="Ask a question or request help with your account data.">
      <AccountSettingRow icon={<FileText aria-hidden="true" />} title="Contact Doxa" description={<p>Use the enquiry form for privacy questions or requests requiring a response.</p>} action={<AccountTextLink to="/contact">Make an enquiry</AccountTextLink>} />
    </AccountPanel>
  </AccountCentreShell>
}

export function AccountManagementPage() {
  const auth = useAuth()
  return <AccountCentreShell title="Account management" eyebrow="Administrative controls" description="Manage account-level actions separately from everyday profile and security settings.">
    {auth.isAdmin && <AccountPanel title="Administrator access" description="This account can open the separate administrator workspace.">
      <AccountSettingRow icon={<ShieldCheck aria-hidden="true" />} title="Administrator workspace" status={<AccountStatus tone="positive">Authorised</AccountStatus>} description={<p>Manage site content, customers and operational records in the dedicated workspace.</p>} action={<Link className="button secondary" to="/admin">Open workspace</Link>} />
    </AccountPanel>}
    <AccountPanel title="Permanent account actions" description="Destructive controls are intentionally isolated from ordinary account settings." className="account-danger-panel">
      <AccountSettingRow icon={<Trash2 aria-hidden="true" />} title="Delete account" tone="danger" description={<><p>Permanently remove your login and private profile.</p><small>Deletion requires acknowledgement, fresh provider-appropriate authentication and a final explicit confirmation.</small></>} action={<Link className="button danger-button" to="/account/manage/delete">Delete account</Link>} />
    </AccountPanel>
  </AccountCentreShell>
}
