import { ArrowLeft, KeyRound, ShieldCheck, Smartphone } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { friendlyAuthError, useAuth } from '../../context/AuthContext'
import { authenticatorFactorId } from '../../lib/authenticatorMfa'

export function MfaSignInChallenge() {
  const auth = useAuth()
  const challenge = auth.mfaChallenge
  const [selectedFactor, setSelectedFactor] = useState(challenge?.factors[0]?.uid ?? '')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!challenge?.factors.some((factor) => factor.uid === selectedFactor)) {
      setSelectedFactor(challenge?.factors[0]?.uid ?? '')
    }
  }, [challenge, selectedFactor])

  if (!challenge) return null
  const selected = challenge.factors.find((factor) => factor.uid === selectedFactor)
  const canUseSelected = selected?.factorId === authenticatorFactorId

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || !selected || !canUseSelected) return
    if (!/^\d{6}$/.test(code)) {
      setError('Enter the current six-digit code from your authenticator app.')
      return
    }
    setBusy(true)
    setError('')
    try {
      await auth.resolveMfaSignIn(selected.uid, code)
    } catch (value) {
      setError(friendlyAuthError(value))
      setCode('')
    } finally {
      setBusy(false)
    }
  }

  return <form className="form-card account-card mfa-signin-card" onSubmit={submit} aria-busy={busy}>
    <div className="mfa-signin-emblem"><ShieldCheck aria-hidden="true" /></div>
    <div className="account-card-header">
      <p className="eyebrow">Additional security check</p>
      <h2>Enter your authenticator code</h2>
      <p>Your first sign-in step was accepted. Complete the sign-in with one of the security methods enrolled on this account.</p>
    </div>

    {challenge.factors.length > 1 && <fieldset className="mfa-factor-picker">
      <legend>Choose a security method</legend>
      {challenge.factors.map((factor) => <label key={factor.uid} className={selectedFactor === factor.uid ? 'selected' : ''}>
        <input type="radio" name="mfaFactor" value={factor.uid} checked={selectedFactor === factor.uid} disabled={busy} onChange={() => { setSelectedFactor(factor.uid); setError(''); setCode('') }} />
        {factor.factorId === authenticatorFactorId ? <Smartphone aria-hidden="true" /> : <KeyRound aria-hidden="true" />}
        <span><strong>{factor.displayName}</strong><small>{factor.factorId === authenticatorFactorId ? 'Authenticator app' : 'Additional security method'}</small></span>
      </label>)}
    </fieldset>}

    {canUseSelected ? <label>Six-digit code
      <input
        name="verificationCode"
        className="mfa-code-input"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]{6}"
        maxLength={6}
        required
        autoFocus
        value={code}
        disabled={busy}
        onChange={(event) => { setCode(event.target.value.replace(/\D/g, '').slice(0, 6)); setError('') }}
      />
      <span className="field-help">Codes change every 30 seconds. Use the newest code shown in your app.</span>
    </label> : <p className="form-message error" role="alert">This enrolled security method is not supported by this version of the sign-in page. Choose another method.</p>}

    {error && <p className="form-message error" role="alert">{error}</p>}
    <button className="button primary grow" disabled={busy || !canUseSelected || code.length !== 6}>{busy ? 'Verifying code…' : 'Verify and sign in'}</button>
    <button className="text-button centred-button mfa-cancel-button" type="button" disabled={busy} onClick={auth.cancelMfaSignIn}><ArrowLeft aria-hidden="true" /> Cancel and return to sign in</button>
    <p className="provider-note">Never share an authenticator code with anyone, including someone claiming to represent Doxa.</p>
  </form>
}
