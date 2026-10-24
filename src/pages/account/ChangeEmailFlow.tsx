import { AlertTriangle, Check, CheckCircle2, Mail, ShieldCheck } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ReauthenticationPanel } from '../../components/account/ReauthenticationPanel'
import { SecurityFlow } from '../../components/account/SecurityFlow'
import { PageMeta } from '../../components/PageMeta'
import { friendlyAuthError, useAuth } from '../../context/AuthContext'
import { emailMatches, maskEmail, clearSecurityState, readSecurityState, writeSecurityState } from '../../lib/security'

const steps = [
  { number: '01', label: 'Before you continue' },
  { number: '02', label: 'Confirm it’s you' },
  { number: '03', label: 'New email' },
  { number: '04', label: 'Review' },
  { number: '05', label: 'Verify' },
  { number: '06', label: 'Complete' },
]

export function ChangeEmailFlow() {
  const auth = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  // Pending state is scoped to the signed-in account: another account sharing
  // this browser never sees (or clears) somebody else's change.
  const uid = auth.user?.uid ?? null
  const pending = readSecurityState(uid, 'pending-email-change')
  const [step, setStep] = useState(searchParams.get('status') === 'checking' && pending ? 5 : 1)
  const [acknowledged, setAcknowledged] = useState(false)
  const [newEmail, setNewEmail] = useState(pending)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState('')
  const resendRemaining = () => Math.max(0, Math.ceil((Number(readSecurityState(uid, 'email-change-resend') || 0) - Date.now()) / 1000))
  const [resendSeconds, setResendSeconds] = useState(resendRemaining)

  async function checkCompletion(silent = false) {
    if (!newEmail) return
    if (!silent) { setBusy(true); setFeedback('') }
    try {
      const refreshed = await auth.refreshUser()
      if (emailMatches(refreshed.email, newEmail)) {
        clearSecurityState(uid, 'pending-email-change')
        setStep(6)
      } else if (!silent) {
        setFeedback('The new address has not been verified yet. Open the link in your email, then check again.')
      }
    } catch (error) {
      if (!silent) setFeedback(friendlyAuthError(error))
    } finally {
      if (!silent) setBusy(false)
    }
  }

  useEffect(() => {
    if (step !== 5 || !newEmail) return
    void checkCompletion(true)
    const timer = window.setInterval(() => void checkCompletion(true), 10_000)
    return () => window.clearInterval(timer)
    // Auth state is refreshed deliberately on this interval only while verification is pending.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, newEmail])

  useEffect(() => {
    if (resendSeconds <= 0) return
    const timer = window.setInterval(() => setResendSeconds(resendRemaining()), 1000)
    return () => window.clearInterval(timer)
  }, [resendSeconds])

  function acceptNewEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const value = String(new FormData(event.currentTarget).get('newEmail') || '').trim().toLowerCase()
    setFeedback('')
    if (emailMatches(value, auth.user?.email)) {
      setFeedback('Choose an email address different from your current one.')
      return
    }
    setNewEmail(value)
    setStep(4)
  }

  async function confirmChange() {
    if (busy || (step === 5 && resendSeconds > 0)) return
    setBusy(true)
    setFeedback('')
    try {
      await auth.requestEmailChange(newEmail)
      writeSecurityState(uid, 'pending-email-change', newEmail)
      writeSecurityState(uid, 'email-change-resend', String(Date.now() + 60_000))
      setResendSeconds(60)
      setStep(5)
    } catch (error) {
      setFeedback(friendlyAuthError(error))
    } finally {
      setBusy(false)
    }
  }

  function leave() {
    if (step < 5) clearSecurityState(uid, 'pending-email-change')
    navigate('/account/security')
  }

  return <>
    <PageMeta title="Change email" description="Securely change the email address associated with your account." />
    <SecurityFlow title="Change account email" eyebrow="Guided security change" steps={steps} activeStep={step} onBack={leave}>
      {step === 1 && <><div className="security-flow-lead"><Mail aria-hidden="true" /><div><p className="eyebrow">Before you continue</p><h2>Let’s change your email.</h2><p>Changing your email requires re-authentication. We’ll guide you through each step.</p></div></div><div className="security-explainer-grid"><div><h3>Changing your email will</h3><ul className="security-check-list"><li><Check /> Change the address associated with your account</li><li><Check /> Change future account and security communication</li><li><Check /> Require verification of the new address</li><li><Check /> Keep your account, orders and profile information</li></ul></div><div className="security-warning-panel"><h3>Keep in mind</h3><ul><li><AlertTriangle /> You must control the new email address.</li><li><AlertTriangle /> Never change it because someone claiming to be Doxa tells you to.</li><li><AlertTriangle /> We will never ask you to transfer your account to somebody else’s email.</li></ul></div></div><label className="security-acknowledgement"><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} /><span><strong>I understand and want to continue</strong><small>This starts a sensitive account change.</small></span></label><div className="security-flow-actions"><button className="button primary" disabled={!acknowledged} onClick={() => setStep(2)}>Continue</button></div></>}

      {step === 2 && <ReauthenticationPanel onAuthenticated={() => setStep(3)} />}

      {step === 3 && <><div className="security-flow-lead"><Mail aria-hidden="true" /><div><p className="eyebrow">New email</p><h2>What email would you like to use?</h2><p>We will never ask you to change your email. Only use an address that belongs to you.</p></div></div><form className="security-compact-form" onSubmit={acceptNewEmail}><label>New email address<input name="newEmail" type="email" required maxLength={160} autoComplete="email" inputMode="email" autoCapitalize="none" spellCheck={false} defaultValue={newEmail} /></label>{feedback && <p className="form-message error" role="alert">{feedback}</p>}<div className="security-flow-actions split"><button type="button" className="button secondary" onClick={() => setStep(2)}>Back</button><button className="button primary">Review email</button></div></form></>}

      {step === 4 && <><div className="security-flow-lead"><ShieldCheck aria-hidden="true" /><div><p className="eyebrow">Review</p><h2>Summary</h2><p>Let’s check this through one more time.</p></div></div><dl className="security-change-summary"><div><dt>You’re changing your email from</dt><dd>{auth.user?.email}</dd></div><div><dt>To</dt><dd>{newEmail}</dd></div></dl><div className="security-critical-warning"><AlertTriangle aria-hidden="true" /><p>If you set your account email to an address you do not control, another person may be able to gain access to your account. We will never ask you to change your email.</p></div>{feedback && <p className="form-message error" role="alert">{feedback}</p>}<div className="security-flow-actions split"><button className="button secondary" onClick={() => setStep(3)}>No, go back</button><button className="button primary" disabled={busy} onClick={() => void confirmChange()}>{busy ? 'Sending verification…' : 'Confirm email change'}</button></div></>}

      {step === 5 && <><div className="security-flow-lead"><Mail aria-hidden="true" /><div><p className="eyebrow">Verify</p><h2>Check your new email.</h2><p>We need to verify that you control the new email address.</p></div></div><div className="security-verification-destination"><Mail aria-hidden="true" /><div><span>Verification sent to</span><strong>{maskEmail(newEmail)}</strong></div></div><p className="security-flow-copy">Open the secure verification link in the message from Doxa. Your account keeps its current email until the link is completed.</p>{feedback && <p className="form-message error" role="status">{feedback}</p>}<div className="security-flow-actions"><button className="button primary" disabled={busy} onClick={() => void checkCompletion()}>{busy ? 'Checking…' : 'I’ve opened the link — check status'}</button><button className="text-button" disabled={busy || resendSeconds > 0} onClick={() => void confirmChange()}>{resendSeconds > 0 ? `Resend in ${resendSeconds}s` : 'Resend verification link'}</button><button className="text-button" onClick={() => navigate('/account/security')}>Finish later</button></div></>}

      {step === 6 && <div className="security-complete-state"><span><CheckCircle2 aria-hidden="true" /></span><p className="eyebrow">Complete</p><h2>You’re all done.</h2><p>You’ve successfully changed your email.</p><div className="security-complete-summary"><Mail aria-hidden="true" /><div><strong>{maskEmail(newEmail)}</strong><span><CheckCircle2 aria-hidden="true" /> Verified</span></div></div><button className="button primary" onClick={() => navigate('/account/security')}>Return to Security &amp; sign-in</button></div>}
    </SecurityFlow>
  </>
}
