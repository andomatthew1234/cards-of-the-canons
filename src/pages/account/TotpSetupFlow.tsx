import { AlertTriangle, Check, CheckCircle2, Clipboard, Clock3, KeyRound, LoaderCircle, ShieldCheck, Smartphone, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { toDataURL } from 'qrcode'
import { ReauthenticationPanel } from '../../components/account/ReauthenticationPanel'
import { SecurityFlow } from '../../components/account/SecurityFlow'
import { PageMeta } from '../../components/PageMeta'
import { friendlyAuthError, useAuth } from '../../context/AuthContext'
import { authenticatorFactorId, type MfaFactorSummary, type TotpEnrollmentDraft } from '../../lib/authenticatorMfa'

const steps = [
  { number: '01', label: 'About authenticator apps' },
  { number: '02', label: 'Confirm it’s you' },
  { number: '03', label: 'Set up authenticator' },
  { number: '04', label: 'Verify setup' },
  { number: '05', label: 'Complete' },
]

export function TotpSetupFlow() {
  const auth = useAuth()
  const navigate = useNavigate()
  const enrolled = useMemo(() => auth.mfaFactors.filter((factor) => factor.factorId === authenticatorFactorId), [auth.mfaFactors])
  const [step, setStep] = useState(enrolled.length ? 5 : 1)
  const [draft, setDraft] = useState<TotpEnrollmentDraft | null>(null)
  const [qrImage, setQrImage] = useState('')
  const [verificationCode, setVerificationCode] = useState('')
  const [displayName, setDisplayName] = useState('Authenticator app')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [removeTarget, setRemoveTarget] = useState<MfaFactorSummary | null>(null)
  const [removeStage, setRemoveStage] = useState<'confirm' | 'reauth' | ''>('')
  const [removed, setRemoved] = useState(false)
  const [completedEnrollment, setCompletedEnrollment] = useState(false)

  useEffect(() => {
    let cancelled = false
    if (!draft) { setQrImage(''); return }
    void toDataURL(draft.qrCodeUrl, { width: 260, margin: 2, errorCorrectionLevel: 'M', color: { dark: '#2f211a', light: '#ffffff' } })
      .then((image) => { if (!cancelled) setQrImage(image) })
      .catch(() => { if (!cancelled) setError('The QR code could not be rendered. Use the manual setup key instead.') })
    return () => { cancelled = true }
  }, [draft])

  async function createSecret() {
    setStep(3)
    setBusy(true)
    setError('')
    setDraft(null)
    try {
      setDraft(await auth.beginTotpEnrollment())
    } catch (value) {
      setError(friendlyAuthError(value))
    } finally {
      setBusy(false)
    }
  }

  async function copySecret() {
    if (!draft) return
    setCopied(false)
    try {
      await navigator.clipboard.writeText(draft.secretKey)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2500)
    } catch {
      setError('The setup key could not be copied automatically. Select and copy it manually.')
    }
  }

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!draft || busy) return
    if (!/^\d{6}$/.test(verificationCode)) {
      setError('Enter the current six-digit code from your authenticator app.')
      return
    }
    setBusy(true)
    setError('')
    try {
      await auth.completeTotpEnrollment(draft, verificationCode, displayName.trim() || 'Authenticator app')
      await auth.refreshMfaFactors()
      setDraft(null)
      setVerificationCode('')
      setCompletedEnrollment(true)
      setStep(5)
    } catch (value) {
      setError(friendlyAuthError(value))
      setVerificationCode('')
    } finally {
      setBusy(false)
    }
  }

  async function removeFactor() {
    if (!removeTarget || busy) return
    setBusy(true)
    setError('')
    try {
      await auth.removeMfaFactor(removeTarget.uid)
      setRemoveTarget(null)
      setRemoveStage('')
      setRemoved(true)
    } catch (value) {
      setError(friendlyAuthError(value))
      setRemoveStage('')
      setRemoveTarget(null)
    } finally {
      setBusy(false)
    }
  }

  function leave() {
    setDraft(null)
    navigate('/account/security')
  }

  const hasAuthenticator = enrolled.length > 0

  return <>
    <PageMeta title="Authenticator app" description="Set up and manage Firebase-native authenticator app multi-factor authentication." />
    <SecurityFlow title="Authenticator app" eyebrow="Multi-factor authentication" steps={steps} activeStep={step} onBack={leave}>
      {step === 1 && <>
        <div className="security-flow-lead"><Smartphone aria-hidden="true" /><div><p className="eyebrow">About authenticator apps</p><h2>Protect sign-in with a rotating code.</h2><p>An authenticator app creates a new security code on your device every 30 seconds. It does not rely on text messages or email delivery.</p></div></div>
        <div className="security-learning-grid totp-learning-grid"><article><Clock3 aria-hidden="true" /><h3>Always rotating</h3><p>Each six-digit code works only for a short time.</p></article><article><ShieldCheck aria-hidden="true" /><h3>Firebase protected</h3><p>Firebase securely verifies the second factor after your password or Google sign-in.</p></article><article><Smartphone aria-hidden="true" /><h3>Widely compatible</h3><p>Use Google Authenticator, Microsoft Authenticator, 1Password or another TOTP-compatible app.</p></article><article><KeyRound aria-hidden="true" /><h3>No delivery delay</h3><p>Codes are generated on your device, even when email or SMS is unavailable.</p></article></div>
        {!auth.user?.emailVerified && <div className="security-critical-warning"><AlertTriangle aria-hidden="true" /><p>Firebase requires a verified email address before multi-factor authentication can be enrolled. Verify your account email, then return here.</p></div>}
        <div className="security-warning-panel totp-access-warning"><h3>Keep access to your authenticator</h3><p>If you lose access to your only enrolled second factor, you may be unable to sign in. Recovery codes are not available in this release.</p></div>
        <div className="security-flow-actions split"><button className="button secondary" onClick={leave}>Cancel</button><button className="button primary" disabled={!auth.user?.emailVerified} onClick={() => setStep(2)}>Continue</button></div>
      </>}

      {step === 2 && <ReauthenticationPanel onAuthenticated={() => void createSecret()} />}

      {step === 3 && <>
        <div className="security-flow-lead"><Smartphone aria-hidden="true" /><div><p className="eyebrow">Set up authenticator</p><h2>Scan this with your authenticator app.</h2><p>The QR code contains a one-time setup secret generated by Firebase for this account.</p></div></div>
        {busy && <div className="totp-loading" role="status"><LoaderCircle className="auth-spinner" aria-hidden="true" /><strong>Generating secure setup details…</strong></div>}
        {draft && <div className="totp-setup-grid">
          <div className="totp-qr-panel">{qrImage ? <img src={qrImage} alt="QR code for enrolling this account in an authenticator app" /> : <div className="totp-qr-placeholder" role="status"><LoaderCircle className="auth-spinner" aria-hidden="true" /> Preparing QR code…</div>}<p>Scan this with your authenticator app</p></div>
          <div className="totp-manual-panel"><p className="eyebrow">Can’t scan it?</p><h3>Enter the setup key manually</h3><p>Add a time-based account in your authenticator app, then enter this key.</p><div className="totp-secret-key"><code>{draft.secretKey}</code><button type="button" onClick={() => void copySecret()} aria-label="Copy manual setup key"><Clipboard aria-hidden="true" /> {copied ? 'Copied' : 'Copy'}</button></div><div className="security-critical-warning"><AlertTriangle aria-hidden="true" /><p>Keep this setup key private. Anyone who has it can generate security codes for your account.</p></div></div>
        </div>}
        {error && <p className="form-message error" role="alert">{error}</p>}
        <div className="security-flow-actions split"><button className="button secondary" onClick={leave}>Cancel setup</button>{!draft && !busy ? <button className="button primary" onClick={() => void createSecret()}>Try again</button> : <button className="button primary" disabled={!draft || busy} onClick={() => { setError(''); setStep(4) }}>I’ve added the account</button>}</div>
      </>}

      {step === 4 && <>
        <div className="security-flow-lead"><ShieldCheck aria-hidden="true" /><div><p className="eyebrow">Verify setup</p><h2>Enter the current six-digit code.</h2><p>Firebase will verify the code and complete enrollment. The setup key is never compared or validated by this website.</p></div></div>
        <form className="security-compact-form totp-verification-form" onSubmit={verify}>
          <label>Authenticator name<input name="displayName" maxLength={40} autoComplete="off" value={displayName} disabled={busy} onChange={(event) => setDisplayName(event.target.value)} /><span className="field-help">This name helps you recognise the enrolled factor later.</span></label>
          <label>Six-digit code<input name="verificationCode" className="mfa-code-input" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required autoFocus value={verificationCode} disabled={busy} onChange={(event) => { setVerificationCode(event.target.value.replace(/\D/g, '').slice(0, 6)); setError('') }} /><span className="field-help">Use the newest code shown in your authenticator app.</span></label>
          {error && <p className="form-message error" role="alert">{error}</p>}
          <div className="security-flow-actions split"><button type="button" className="button secondary" disabled={busy} onClick={() => { setError(''); setStep(3) }}>Back</button><button className="button primary" disabled={busy || verificationCode.length !== 6}>{busy ? 'Verifying…' : 'Verify and enable'}</button></div>
        </form>
      </>}

      {step === 5 && removeStage !== 'reauth' && (completedEnrollment ? <div className="security-complete-state"><span><CheckCircle2 aria-hidden="true" /></span><p className="eyebrow">Complete</p><h2>Authenticator app protection is enabled.</h2><p>Your authenticator app is now enrolled as a Firebase multi-factor security method.</p><div className="security-complete-summary"><Smartphone aria-hidden="true" /><div><strong>{displayName.trim() || 'Authenticator app'}</strong><span><CheckCircle2 aria-hidden="true" /> Enabled</span></div></div><button className="button primary" onClick={leave}>Return to Profile &amp; Security</button></div> : hasAuthenticator ? <>
        <div className="security-flow-lead"><CheckCircle2 aria-hidden="true" /><div><p className="eyebrow">{removed ? 'Updated' : 'Protection enabled'}</p><h2>Authenticator app protection is enabled.</h2><p>Firebase will require an enrolled security method after a supported first-factor sign-in.</p></div></div>
        <div className="totp-factor-list">{enrolled.map((factor) => <article key={factor.uid}><span><Smartphone aria-hidden="true" /></span><div><strong>{factor.displayName}</strong><p>Authenticator app · Added {new Date(factor.enrollmentTime).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}</p></div><button type="button" className="security-row-button danger-text" onClick={() => { setError(''); setRemoveTarget(factor); setRemoveStage('confirm') }}><Trash2 aria-hidden="true" /> Remove</button></article>)}</div>
        <div className="security-warning-panel totp-access-warning"><h3>Do not remove access prematurely</h3><p>Keep your authenticator app available. Losing your only enrolled factor can prevent account access.</p></div>
        {error && <p className="form-message error" role="alert">{error}</p>}
        <div className="security-flow-actions"><button className="button primary" onClick={leave}>Return to Profile &amp; Security</button></div>
      </> : removed ? <div className="security-complete-state"><span><CheckCircle2 aria-hidden="true" /></span><p className="eyebrow">Complete</p><h2>Authenticator app removed.</h2><p>Firebase no longer lists an authenticator app as an enrolled second factor for this account.</p><button className="button primary" onClick={leave}>Return to Profile &amp; Security</button></div> : <div className="security-complete-state"><span><Smartphone aria-hidden="true" /></span><p className="eyebrow">Not configured</p><h2>No authenticator app is enrolled.</h2><p>Return to the Security Centre to begin setup.</p><button className="button primary" onClick={leave}>Return to Profile &amp; Security</button></div>)}

      {removeStage === 'reauth' && <div className="totp-removal-reauth"><ReauthenticationPanel onAuthenticated={() => void removeFactor()} />{error && <p className="form-message error" role="alert">{error}</p>}</div>}
    </SecurityFlow>

    {removeStage === 'confirm' && removeTarget && <div className="security-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) { setRemoveStage(''); setRemoveTarget(null) } }}><section className="security-modal" role="dialog" aria-modal="true" aria-labelledby="remove-authenticator-title"><div className="security-modal-header"><div><p className="eyebrow">Remove security method</p><h2 id="remove-authenticator-title">Remove {removeTarget.displayName}?</h2><p>This authenticator will stop working as a second factor immediately.</p></div></div><div className="security-critical-warning danger"><AlertTriangle aria-hidden="true" /><p>If this is your only enrolled second factor, your account will no longer have authenticator-app protection. Firebase may also sign you out after unenrollment.</p></div><div className="security-form-actions"><button className="button secondary" onClick={() => { setRemoveStage(''); setRemoveTarget(null) }}>Keep authenticator</button><button className="button danger-button" onClick={() => setRemoveStage('reauth')}>Continue to identity check</button></div></section></div>}
  </>
}
