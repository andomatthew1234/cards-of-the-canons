import {
  AlertTriangle, CheckCircle2, LockKeyhole, Mail,
  ShieldCheck, Smartphone, X,
} from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { AccountCentreShell } from '../../components/account/AccountChrome'
import { ReauthenticationPanel } from '../../components/account/ReauthenticationPanel'
import { AccountFeedback, AccountPanel, AccountSettingRow, AccountStatus, AccountTextLink } from '../../components/account/AccountCentreUI'
import { ProviderIcon } from '../../components/account/ProviderIcon'
import { friendlyAuthError, useAuth } from '../../context/AuthContext'
import { getAccountSecurityPolicy } from '../../lib/accounts'
import { authenticatorFactorId } from '../../lib/authenticatorMfa'
import { maskEmail, providerName } from '../../lib/security'
import type { AccountSecurityCapabilities, AccountSecurityPolicy } from '../../types'

const unavailablePolicy: AccountSecurityPolicy = {
  version: 1,
  methods: {
    emailCode: { status: 'not_configured', verifiedAt: null },
    authenticator: { status: 'not_configured', verifiedAt: null },
    passkey: { status: 'not_configured', verifiedAt: null },
  },
  requirements: { signIn: false, criticalActions: false, paymentActions: false, passwordlessSignIn: false },
}

const unavailableCapabilities: AccountSecurityCapabilities = {
  emailCodeDelivery: false,
  passwordlessEmailCode: false,
  authenticator: false,
  passkeys: false,
  explanation: 'Secure email-code delivery is not configured for this site yet.',
}

function useCooldown(key: string, durationSeconds = 60) {
  const storageKey = `cards.security.cooldown.${key}`
  const remaining = () => Math.max(0, Math.ceil((Number(sessionStorage.getItem(storageKey) || 0) - Date.now()) / 1000))
  const [seconds, setSeconds] = useState(remaining)
  useEffect(() => {
    if (seconds <= 0) return
    const timer = window.setInterval(() => setSeconds(remaining()), 1000)
    return () => window.clearInterval(timer)
  }, [seconds])
  return { seconds, begin: () => { sessionStorage.setItem(storageKey, String(Date.now() + durationSeconds * 1000)); setSeconds(durationSeconds) } }
}

export function SecurityCentre() {
  const auth = useAuth()
  const [policy, setPolicy] = useState(unavailablePolicy)
  const [capabilities, setCapabilities] = useState(unavailableCapabilities)
  const [loading, setLoading] = useState(true)
  const [passwordOpen, setPasswordOpen] = useState(false)
  const [busy, setBusy] = useState('')
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  const verificationCooldown = useCooldown('verification-email')
  const providers = useMemo(() => auth.user?.providerData ?? [], [auth.user])
  const hasPassword = auth.providers.includes('password')
  const authenticatorFactors = useMemo(() => auth.mfaFactors.filter((factor) => factor.factorId === authenticatorFactorId), [auth.mfaFactors])
  const authenticatorEnabled = authenticatorFactors.length > 0
  const emailCodeEnabled = policy.methods.emailCode.status === 'enabled'
  const email = auth.user?.email ?? ''
  const attentionNeeded = !auth.user?.emailVerified || !authenticatorEnabled

  useEffect(() => {
    if (!auth.user) return
    let active = true
    void getAccountSecurityPolicy().then((result) => {
      if (!active) return
      setPolicy(result.policy)
      setCapabilities(result.capabilities)
    }).catch(() => undefined).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [auth.user])

  async function run(name: string, action: () => Promise<void>, success: string) {
    setBusy(name)
    setFeedback(null)
    try {
      await action()
      setFeedback({ tone: 'success', text: success })
    } catch (error) {
      setFeedback({ tone: 'error', text: friendlyAuthError(error) })
    } finally {
      setBusy('')
    }
  }

  function resendVerification() {
    void run('verification', async () => { await auth.resendVerification(); verificationCooldown.begin() }, 'A new verification email has been sent. Check your inbox and spam folder.')
  }

  function refreshStatus() {
    void run('refresh', async () => { await auth.refreshUser() }, 'Your email status has been refreshed.')
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const currentPassword = String(form.get('currentPassword') || '')
    const nextPassword = String(form.get('newPassword') || '')
    const confirmation = String(form.get('confirmPassword') || '')
    if (nextPassword !== confirmation) {
      setFeedback({ tone: 'error', text: 'The new passwords do not match.' })
      return
    }
    setBusy('password')
    setFeedback(null)
    try {
      const outcome = await auth.changePassword(currentPassword, nextPassword)
      if (outcome === 'mfa-required') {
        // The shared reauthentication challenge now owns the flow; the panel
        // below finishes the staged password change after the code is entered.
        return
      }
      setPasswordOpen(false)
      setFeedback({ tone: 'success', text: 'Your password has been changed securely.' })
    } catch (error) {
      setFeedback({ tone: 'error', text: friendlyAuthError(error) })
    } finally {
      setBusy('')
    }
  }

  function closePasswordDialog() {
    // Closing the dialog abandons any staged change and its MFA challenge.
    auth.cancelPendingSecurityAction()
    setPasswordOpen(false)
  }

  function passwordChangeFinished() {
    setPasswordOpen(false)
    setFeedback({ tone: 'success', text: 'Your password has been changed securely.' })
  }

  return <AccountCentreShell title="Security & sign-in" eyebrow="Account protection" description="Manage how you sign in and the security methods protecting sensitive account actions.">
    {feedback && <AccountFeedback tone={feedback.tone}>{feedback.text}</AccountFeedback>}
    <section className={`account-security-health ${attentionNeeded ? 'warning' : 'positive'}`} aria-busy={loading}>
      {attentionNeeded ? <AlertTriangle aria-hidden="true" /> : <ShieldCheck aria-hidden="true" />}
      <div><p className="eyebrow">Security status</p><h2>{attentionNeeded ? 'Your account has a security recommendation' : 'Your account is protected'}</h2><p>{!auth.user?.emailVerified ? 'Verify your email address to protect recovery and future account changes.' : !authenticatorEnabled ? 'Add an authenticator app for a strong second sign-in step.' : 'Your email is verified and an authenticator app is enrolled.'}</p></div>
      <AccountStatus tone={attentionNeeded ? 'warning' : 'positive'}>{attentionNeeded ? 'Review recommended' : 'Protected'}</AccountStatus>
    </section>

    <AccountPanel title="Email & sign-in" description="Every method currently connected to this Firebase account.">
      <div className="account-group-label">How you sign in</div>
      {providers.map((provider) => <AccountSettingRow key={provider.providerId} icon={<ProviderIcon providerId={provider.providerId} />} title={providerName(provider.providerId)} tone="positive" status={<AccountStatus tone="positive"><CheckCircle2 aria-hidden="true" /> Connected</AccountStatus>} description={<><p>{provider.providerId === 'password' ? 'Use your account email and password.' : maskEmail(provider.email || email)}</p><small>{provider.providerId === 'password' ? 'Password changes require your current password.' : `Sensitive changes reopen ${providerName(provider.providerId)} securely.`}</small></>} />)}
      <div className="account-group-label">Email verification</div>
      <AccountSettingRow icon={<Mail aria-hidden="true" />} title="Account email" tone={auth.user?.emailVerified ? 'positive' : 'warning'} status={<AccountStatus tone={auth.user?.emailVerified ? 'positive' : 'warning'}>{auth.user?.emailVerified ? <CheckCircle2 aria-hidden="true" /> : <AlertTriangle aria-hidden="true" />}{auth.user?.emailVerified ? 'Verified' : 'Not verified'}</AccountStatus>} description={<><p>{maskEmail(email)}</p><small>{auth.user?.emailVerified ? 'Your address has been confirmed and is ready to use.' : 'Verification protects recovery and sensitive account changes.'}</small></>} action={<AccountTextLink to="/account/security/email">Change email</AccountTextLink>} />
      <div className={`account-verification-actions ${auth.user?.emailVerified ? 'verified' : 'unverified'}`}><div><strong>{auth.user?.emailVerified ? 'Your email is verified' : 'Your email is not verified'}</strong><p>{auth.user?.emailVerified ? 'No action is needed.' : 'Send another verification email or refresh after completing it.'}</p></div><div>{!auth.user?.emailVerified && <button className="button secondary" disabled={busy === 'verification' || verificationCooldown.seconds > 0} onClick={resendVerification}>{busy === 'verification' ? 'Sending…' : verificationCooldown.seconds > 0 ? `Resend in ${verificationCooldown.seconds}s` : 'Resend verification email'}</button>}<button className="account-text-button" disabled={busy === 'refresh'} onClick={refreshStatus}>{busy === 'refresh' ? 'Checking…' : 'Refresh status'}</button></div></div>
    </AccountPanel>

    {hasPassword && <AccountPanel title="Password" description="Password controls appear only because email-and-password sign-in is linked.">
      <AccountSettingRow icon={<LockKeyhole aria-hidden="true" />} title="Change password" description={<><p>Choose a new password after confirming the current one.</p><small>Your password is handled only by Firebase Authentication.</small></>} action={<button className="account-text-button" onClick={() => { auth.cancelPendingSecurityAction(); setPasswordOpen(true) }}>Change password</button>} />
    </AccountPanel>}

    <AccountPanel title="2-Step Verification" description="Additional checks used after your first sign-in method succeeds.">
      <AccountSettingRow icon={<Smartphone aria-hidden="true" />} title="Authenticator app" tone={authenticatorEnabled ? 'positive' : 'neutral'} status={<AccountStatus tone={authenticatorEnabled ? 'positive' : 'neutral'}>{authenticatorEnabled ? <><CheckCircle2 aria-hidden="true" /> Enabled</> : 'Not configured'}</AccountStatus>} description={<><p>{authenticatorEnabled ? authenticatorFactors.map((factor) => factor.displayName).join(', ') : 'Use rotating six-digit codes from a compatible authenticator app.'}</p><small>{authenticatorEnabled ? 'Enrollment status comes directly from Firebase Authentication.' : 'Recommended for stronger account protection.'}</small></>} action={<AccountTextLink to="/account/security/authenticator">{authenticatorEnabled ? 'Manage' : 'Set up'}</AccountTextLink>} />
      {(emailCodeEnabled || capabilities.emailCodeDelivery) && <AccountSettingRow icon={<Mail aria-hidden="true" />} title="Email-code protection" status={<AccountStatus tone={emailCodeEnabled ? 'positive' : 'neutral'}>{emailCodeEnabled ? 'Enabled' : 'Not configured'}</AccountStatus>} description={<><p>{emailCodeEnabled ? maskEmail(email) : capabilities.explanation}</p><small>Email codes remain separate from authenticator MFA.</small></>} action={<AccountTextLink to="/account/security/email-code">{emailCodeEnabled ? 'Manage' : 'Set up'}</AccountTextLink>} />}
    </AccountPanel>

    {passwordOpen && <div className="security-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closePasswordDialog() }}>
      <section className="security-modal" role="dialog" aria-modal="true" aria-labelledby="password-dialog-title">
        <div className="security-modal-header"><div><p className="eyebrow">Sensitive action</p><h2 id="password-dialog-title">Change your password</h2><p>Confirm your existing password before choosing a new one.</p></div><button className="icon-button" aria-label="Close password change" onClick={closePasswordDialog}><X aria-hidden="true" /></button></div>
        {auth.mfaReauthenticationChallenge
          ? <ReauthenticationPanel onAuthenticated={passwordChangeFinished} />
          : <form className="security-compact-form" onSubmit={changePassword}><label>Current password<input name="currentPassword" type="password" required autoComplete="current-password" /></label><label>New password<input name="newPassword" type="password" required minLength={8} maxLength={128} autoComplete="new-password" /></label><label>Confirm new password<input name="confirmPassword" type="password" required minLength={8} maxLength={128} autoComplete="new-password" /></label><div className="security-form-actions"><button type="button" className="button secondary" onClick={closePasswordDialog}>Cancel</button><button className="button primary" disabled={busy === 'password'}>{busy === 'password' ? 'Changing…' : 'Change password'}</button></div></form>}
      </section>
    </div>}
  </AccountCentreShell>
}
