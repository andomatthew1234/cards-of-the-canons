import { CheckCircle2, Mail, Pencil, Phone, UserRound, X } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { AccountCentreShell } from '../../components/account/AccountChrome'
import { AccountFeedback, AccountPanel, AccountSettingRow, AccountStatus, AccountTextLink } from '../../components/account/AccountCentreUI'
import { friendlyAuthError, useAuth } from '../../context/AuthContext'
import { getUserProfile, saveUserProfile } from '../../lib/accounts'
import { maskEmail } from '../../lib/security'
import type { UserProfile } from '../../types'

export function PersonalInfoPage() {
  const auth = useAuth()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    if (!auth.user) return
    let active = true
    void getUserProfile(auth.user.uid).then((value) => { if (active) setProfile(value) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [auth.user])

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!auth.user) return
    const form = new FormData(event.currentTarget)
    const displayName = String(form.get('displayName') || '').trim()
    const phone = String(form.get('phone') || '').trim()
    setBusy(true)
    setFeedback(null)
    void (async () => {
      try {
        await auth.updateDisplayName(displayName)
        await saveUserProfile(auth.user!.uid, { displayName, phone })
        setProfile((current) => ({ displayName, phone, email: current?.email ?? auth.user?.email ?? '', createdAt: current?.createdAt }))
        setEditing(false)
        setFeedback({ tone: 'success', text: 'Your personal information has been updated.' })
      } catch (error) {
        setFeedback({ tone: 'error', text: friendlyAuthError(error) })
      } finally {
        setBusy(false)
      }
    })()
  }

  const name = profile?.displayName || auth.user?.displayName || 'Collector'
  return <AccountCentreShell title="Personal info & details" eyebrow="Your identity" description="Manage the profile and contact information used across your account.">
    {feedback && <AccountFeedback tone={feedback.tone}>{feedback.text}</AccountFeedback>}
    <AccountPanel title="Basic information" description="These details identify you within Doxa.">
      {!editing ? <>
        <AccountSettingRow icon={<UserRound aria-hidden="true" />} title="Name" description={<><p>{loading ? 'Loading…' : name}</p><small>Used on your account and when you submit an enquiry while signed in.</small></>} action={<button className="account-text-button" onClick={() => setEditing(true)}><Pencil aria-hidden="true" /> Edit</button>} />
        <AccountSettingRow icon={<Phone aria-hidden="true" />} title="Phone" description={<><p>{profile?.phone || 'Not provided'}</p><small>Optional contact information stored in your private profile.</small></>} action={<button className="account-text-button" onClick={() => setEditing(true)}><Pencil aria-hidden="true" /> Edit</button>} />
      </> : <form className="account-edit-form" onSubmit={submit}>
        <div className="account-edit-heading"><div><h3>Edit personal information</h3><p>Update the details used across your account.</p></div><button type="button" className="icon-button" aria-label="Close personal information editor" onClick={() => setEditing(false)}><X aria-hidden="true" /></button></div>
        <div className="security-form-grid"><label>Display name<input name="displayName" defaultValue={name} minLength={2} maxLength={80} required autoComplete="name" /></label><label>Phone <span>(optional)</span><input name="phone" type="tel" defaultValue={profile?.phone ?? ''} maxLength={30} autoComplete="tel" /></label></div>
        <div className="security-form-actions"><button type="button" className="button secondary" onClick={() => setEditing(false)}>Cancel</button><button className="button primary" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button></div>
      </form>}
    </AccountPanel>
    <AccountPanel title="Contact information" description="Your account email is managed as a protected sign-in detail.">
      <AccountSettingRow icon={<Mail aria-hidden="true" />} title="Email address" tone={auth.user?.emailVerified ? 'positive' : 'warning'} status={<AccountStatus tone={auth.user?.emailVerified ? 'positive' : 'warning'}>{auth.user?.emailVerified && <CheckCircle2 aria-hidden="true" />}{auth.user?.emailVerified ? 'Verified' : 'Not verified'}</AccountStatus>} description={<><p>{maskEmail(auth.user?.email)}</p><small>Changing this address requires fresh provider-aware authentication.</small></>} action={<AccountTextLink to="/account/security/email">Change email</AccountTextLink>} />
    </AccountPanel>
  </AccountCentreShell>
}
