import { CheckCircle2, Clock3, Mail, ShieldCheck } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AccountCentreShell } from '../../components/account/AccountChrome'
import { AccountPanel, AccountSettingRow, AccountStatus } from '../../components/account/AccountCentreUI'
import { friendlyAuthError, useAuth } from '../../context/AuthContext'
import { getMyMailingListStatus, joinAccountMailingList, leaveAccountMailingList } from '../../lib/data'
import { maskEmail } from '../../lib/security'
import type { AccountMailingListStatus } from '../../types'

export function MailingListPage() {
  const auth = useAuth()
  const [membership, setMembership] = useState<AccountMailingListStatus | null>(null)
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState<'loading' | 'joining' | 'leaving' | ''>('loading')
  const [feedback, setFeedback] = useState<{ tone: 'error' | 'success'; text: string } | null>(null)

  useEffect(() => {
    if (!auth.user) return
    let active = true
    setBusy('loading')
    void getMyMailingListStatus()
      .then((result) => { if (active) setMembership(result) })
      .catch((error) => { if (active) setFeedback({ tone: 'error', text: friendlyAuthError(error) }) })
      .finally(() => { if (active) setBusy('') })
    return () => { active = false }
  }, [auth.user])

  async function join() {
    if (!consent) return
    setBusy('joining')
    setFeedback(null)
    try {
      const result = await joinAccountMailingList('account_settings')
      setMembership(result)
      setConsent(false)
      setFeedback({ tone: 'success', text: result.status === 'subscribed' ? 'You are now on the mailing list.' : 'Your preference has been saved.' })
    } catch (error) {
      setFeedback({ tone: 'error', text: friendlyAuthError(error) })
    } finally {
      setBusy('')
    }
  }

  async function leave() {
    setBusy('leaving')
    setFeedback(null)
    try {
      const result = await leaveAccountMailingList()
      setMembership(result)
      setFeedback({ tone: 'success', text: 'You have left the mailing list.' })
    } catch (error) {
      setFeedback({ tone: 'error', text: friendlyAuthError(error) })
    } finally {
      setBusy('')
    }
  }

  const status = membership?.status ?? 'not_joined'
  const joined = status === 'subscribed'
  const pending = status === 'pending'
  const displayEmail = maskEmail(membership?.email || auth.user?.email)

  return <AccountCentreShell title="Mailing list" eyebrow="Communication preferences" description="Choose whether you would like to receive occasional Doxa news and collection updates.">
    <AccountPanel title="Your mailing-list preference" description="This preference is connected to the email address on your account.">
      <AccountSettingRow icon={joined ? <CheckCircle2 aria-hidden="true" /> : pending ? <Clock3 aria-hidden="true" /> : <Mail aria-hidden="true" />} title={joined ? 'You are on the mailing list' : pending ? 'Your preference is recorded' : 'Join the mailing list'} tone={joined ? 'positive' : pending ? 'warning' : 'neutral'} status={<AccountStatus tone={joined ? 'positive' : pending ? 'warning' : 'neutral'}>{joined ? 'Joined' : pending ? 'Pending verification' : 'Not joined'}</AccountStatus>} description={<><p>{joined ? `Updates will be sent to ${displayEmail}.` : pending ? `We have saved your choice for ${displayEmail}. Verify your account email to activate it.` : `Use ${displayEmail} for occasional news, product announcements and community updates.`}</p><small>You can change this preference here at any time.</small></>} />

      {busy === 'loading' ? <p className="account-panel-empty" role="status">Loading your mailing-list preference…</p> : joined ? <div className="mailing-list-actions"><p>Leaving stops future mailing-list messages. It does not affect essential account or order messages.</p><button type="button" className="button secondary" disabled={busy === 'leaving'} onClick={() => void leave()}>{busy === 'leaving' ? 'Updating…' : 'Leave mailing list'}</button></div> : <div className="mailing-list-join"><label><input type="checkbox" checked={consent} disabled={Boolean(busy)} onChange={(event) => setConsent(event.target.checked)} /><span><strong>Yes, add me to the mailing list</strong><small>I would like to receive occasional Doxa news and updates at the email shown above.</small></span></label><button type="button" className="button primary" disabled={!consent || Boolean(busy)} onClick={() => void join()}>{busy === 'joining' ? 'Saving preference…' : pending ? 'Save preference again' : 'Join mailing list'}</button></div>}

      {pending && !membership?.emailVerified && <aside className="mailing-list-verification"><ShieldCheck aria-hidden="true" /><div><strong>Verify your account email</strong><p>Your preference is safely recorded, but the address will not be treated as active until it has been verified.</p></div><Link to="/account/security">Review email status</Link></aside>}
      {feedback && <p className={`form-message ${feedback.tone}`} role={feedback.tone === 'error' ? 'alert' : 'status'}>{feedback.text}</p>}
    </AccountPanel>
    <p className="mailing-list-footnote">We send occasional collection news and community updates. Every mailing includes a clear way to unsubscribe.</p>
  </AccountCentreShell>
}
