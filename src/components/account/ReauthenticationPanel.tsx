import { ArrowLeft, CheckCircle2, KeyRound, ShieldCheck, Smartphone } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { friendlyAuthError, useAuth } from '../../context/AuthContext'
import { authenticatorFactorId } from '../../lib/authenticatorMfa'
import { providerName } from '../../lib/security'
import { ProviderIcon } from './ProviderIcon'

export function ReauthenticationPanel({ onAuthenticated, headingId, onBusyChange }: { onAuthenticated: () => void | Promise<void>; headingId?: string; onBusyChange?: (busy: boolean) => void }) {
  const auth = useAuth()
  const providers = [...new Set(auth.providers)]
  const [selected, setSelected] = useState(providers.includes('password') ? 'password' : providers[0] ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [selectedFactor, setSelectedFactor] = useState('')
  const [verificationCode, setVerificationCode] = useState('')
  const challenge = auth.mfaReauthenticationChallenge
  const activeFactor = challenge?.factors.find((factor) => factor.uid === selectedFactor) ?? challenge?.factors[0]

  useEffect(() => {
    if (!challenge) {
      setSelectedFactor('')
      setVerificationCode('')
      return
    }
    if (!challenge.factors.some((factor) => factor.uid === selectedFactor)) setSelectedFactor(challenge.factors[0]?.uid ?? '')
  }, [challenge, selectedFactor])

  async function confirm(providerId: string, password?: string) {
    setBusy(true)
    onBusyChange?.(true)
    setError('')
    try {
      const result = await auth.reauthenticate(providerId, password)
      if (result !== 'mfa-required') await onAuthenticated()
    } catch (value) {
      setError(friendlyAuthError(value))
    } finally {
      setBusy(false)
      onBusyChange?.(false)
    }
  }

  function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    void confirm('password', String(form.get('currentPassword') || ''))
  }

  async function submitMfa(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!activeFactor || busy) return
    if (activeFactor.factorId !== authenticatorFactorId) {
      setError('Choose a supported security method to continue.')
      return
    }
    if (!/^\d{6}$/.test(verificationCode)) {
      setError('Enter the current six-digit code from your authenticator app.')
      return
    }
    setBusy(true)
    onBusyChange?.(true)
    setError('')
    try {
      await auth.resolveMfaReauthentication(activeFactor.uid, verificationCode)
      await onAuthenticated()
    } catch (value) {
      setError(friendlyAuthError(value))
      setVerificationCode('')
    } finally {
      setBusy(false)
      onBusyChange?.(false)
    }
  }

  if (challenge) return <div className="reauth-panel reauth-mfa-panel">
    <div className="security-flow-lead"><Smartphone aria-hidden="true" /><div><p className="eyebrow">Second security step</p><h2 id={headingId}>Enter your authenticator code</h2><p>Your password or connected provider has been confirmed. Now enter the current code from an enrolled authenticator app.</p></div></div>
    <form className="security-compact-form" onSubmit={submitMfa}>
      {challenge.factors.length > 1 && <fieldset className="mfa-factor-picker"><legend>Choose a security method</legend>{challenge.factors.map((factor) => <label key={factor.uid} className={activeFactor?.uid === factor.uid ? 'selected' : ''}><input type="radio" name="reauthFactor" value={factor.uid} checked={activeFactor?.uid === factor.uid} disabled={busy} onChange={() => { setSelectedFactor(factor.uid); setVerificationCode(''); setError('') }} />{factor.factorId === authenticatorFactorId ? <Smartphone aria-hidden="true" /> : <KeyRound aria-hidden="true" />}<span><strong>{factor.displayName}</strong><small>{factor.factorId === authenticatorFactorId ? 'Authenticator app' : 'Additional security method'}</small></span></label>)}</fieldset>}
      {activeFactor && challenge.factors.length === 1 && <div className="reauth-factor-summary"><Smartphone aria-hidden="true" /><div><span>Security method</span><strong>{activeFactor.displayName}</strong></div></div>}
      {activeFactor?.factorId === authenticatorFactorId ? <label>Six-digit authenticator code<input name="verificationCode" className="mfa-code-input" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required autoFocus value={verificationCode} disabled={busy} onChange={(event) => { setVerificationCode(event.target.value.replace(/\D/g, '').slice(0, 6)); setError('') }} /><span className="field-help">Use the newest code shown in your authenticator app.</span></label> : <p className="form-message error" role="alert">This enrolled security method is not supported by this version of the confirmation page.</p>}
      {error && <p className="form-message error" role="alert">{error}</p>}
      <button className="button primary" disabled={busy || activeFactor?.factorId !== authenticatorFactorId || verificationCode.length !== 6}>{busy ? 'Verifying code…' : 'Verify authenticator code'}</button>
      <button type="button" className="text-button reauth-back-button" disabled={busy} onClick={() => { auth.cancelMfaReauthentication(); setError(''); setVerificationCode('') }}><ArrowLeft aria-hidden="true" /> Back to confirmation methods</button>
    </form>
    <p className="security-reassurance"><CheckCircle2 aria-hidden="true" /> Both security steps must be verified before this account change can continue.</p>
  </div>

  return <div className="reauth-panel">
    <div className="security-flow-lead"><ShieldCheck aria-hidden="true" /><div><h2 id={headingId}>Confirm it’s you</h2><p>Use one of the sign-in methods already connected to this account.</p></div></div>
    {providers.length > 1 && <div className="reauth-method-tabs" role="tablist" aria-label="Confirmation method">
      {providers.map((providerId) => <button type="button" role="tab" aria-selected={selected === providerId} className={selected === providerId ? 'active' : ''} key={providerId} onClick={() => { setSelected(providerId); setError('') }}><ProviderIcon providerId={providerId} /> {providerName(providerId)}</button>)}
    </div>}
    {selected === 'password' ? <form className="security-compact-form" onSubmit={submitPassword}>
      <label>Current password<input name="currentPassword" type="password" required autoComplete="current-password" disabled={busy} /></label>
      <button className="button primary" disabled={busy}>{busy ? 'Confirming…' : 'Confirm identity'}</button>
    </form> : <button type="button" className="provider-confirm-button" disabled={busy || !selected} onClick={() => void confirm(selected)}><ProviderIcon providerId={selected} /><span>{busy ? 'Opening secure sign-in…' : `Continue with ${providerName(selected)}`}</span></button>}
    <p className="security-reassurance"><CheckCircle2 aria-hidden="true" /> Your password and provider credentials are handled only by the sign-in service.</p>
    {error && <p className="form-message error" role="alert">{error}</p>}
  </div>
}
