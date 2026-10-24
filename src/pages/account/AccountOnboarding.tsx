import {
  ArrowLeft, ArrowRight, Check, CheckCircle2, ClipboardCheck, LoaderCircle, Mail,
  Phone, ShieldCheck, ShoppingBag, Sparkles, UserRound,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { PageMeta } from '../../components/PageMeta'
import { friendlyAuthError, useAuth } from '../../context/AuthContext'
import { isRecentlyCreatedAccount } from '../../lib/accountOnboarding'
import { beginAccountOnboarding, completeAccountOnboarding, getUserProfile } from '../../lib/accounts'
import { joinAccountMailingList } from '../../lib/data'

const steps = [
  { number: 1, label: 'Terms' },
  { number: 2, label: 'Preferences' },
  { number: 3, label: 'Final checks' },
  { number: 4, label: 'Thank you' },
]

export function AccountOnboarding() {
  const auth = useAuth()
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [mailingList, setMailingList] = useState(false)
  const [recoveryPhoneEnabled, setRecoveryPhoneEnabled] = useState(false)
  const [recoveryPhone, setRecoveryPhone] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [accessState, setAccessState] = useState<'checking' | 'allowed' | 'error' | 'unavailable'>('checking')
  const [accessAttempt, setAccessAttempt] = useState(0)

  useEffect(() => {
    if (!auth.user) return
    let active = true
    setAccessState('checking')
    setError('')
    void (async () => {
      let profile = null
      try {
        profile = await getUserProfile(auth.user!.uid)
      } catch {
        // A recent account can safely retry the idempotent server marker even
        // if its first private-profile read was temporarily unavailable.
      }
      if (!active) return
      if (profile?.onboarding?.status === 'complete') {
        navigate('/account', { replace: true })
        return
      }
      if (profile?.onboarding?.status === 'pending') {
        setAccessState('allowed')
        return
      }
      if (!isRecentlyCreatedAccount(auth.user!.metadata)) {
        setAccessState('unavailable')
        return
      }
      try {
        const result = await beginAccountOnboarding()
        if (!active) return
        if (result.required) setAccessState('allowed')
        else navigate('/account', { replace: true })
      } catch (failure) {
        if (!active) return
        setError(friendlyAuthError(failure))
        setAccessState('error')
      }
    })()
    return () => { active = false }
  }, [accessAttempt, auth.user, navigate])

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [step])

  if (auth.loading) return <OnboardingLoader />
  if (!auth.user) return <Navigate to="/account" replace />
  if (accessState === 'checking') return <OnboardingLoader />
  if (accessState === 'error') {
    return <main className="onboarding-shell"><PageMeta title="Account setup" description="Continue setting up your new account." /><section className="onboarding-unavailable"><ShieldCheck aria-hidden="true" /><h1>Let’s finish setting up your account.</h1><p>{error || 'Account setup could not be loaded just now. Please try again.'}</p><button className="button primary" onClick={() => setAccessAttempt((attempt) => attempt + 1)}>Try again</button></section></main>
  }
  if (accessState === 'unavailable') {
    return <main className="onboarding-shell"><PageMeta title="Account setup" description="Set up a newly created account." /><section className="onboarding-unavailable"><ShieldCheck aria-hidden="true" /><h1>Your account is ready.</h1><p>This setup is only needed when an account is first created.</p><button className="button primary" onClick={() => navigate('/account', { replace: true })}>Continue to your account</button></section></main>
  }

  const firstName = auth.user.displayName?.trim().split(/\s+/)[0] || 'there'
  const phoneIsValid = !recoveryPhoneEnabled || recoveryPhone.trim().length >= 6

  function go(nextStep: number) {
    setError('')
    setStep(nextStep)
  }

  async function complete() {
    if (!termsAccepted || !phoneIsValid) return
    setBusy(true)
    setError('')
    try {
      if (mailingList) await joinAccountMailingList('account_registration')
      await completeAccountOnboarding({
        termsAccepted: true,
        termsVersion: 'account-terms-v1',
        autofillConsent: true,
        mailingListSelected: mailingList,
        recoveryPhone: recoveryPhoneEnabled ? recoveryPhone.trim() : null,
      })
      setStep(4)
    } catch (failure) {
      setError(friendlyAuthError(failure))
    } finally {
      setBusy(false)
    }
  }

  return <main className="onboarding-shell"><PageMeta title="Welcome to Doxa" description="Complete your new account setup." />
    <header className="onboarding-brand"><span aria-hidden="true">D</span><div><strong>Doxa</strong><small>New account setup</small></div></header>
    <div className="onboarding-layout">
      <nav className="onboarding-progress" aria-label="Account setup progress">
        {steps.map((item) => <div key={item.number} className={`${step === item.number ? 'active' : ''} ${step > item.number ? 'complete' : ''}`} aria-current={step === item.number ? 'step' : undefined}><span>{step > item.number ? <Check aria-hidden="true" /> : String(item.number).padStart(2, '0')}</span><strong>{item.label}</strong></div>)}
      </nav>

      <section className="onboarding-card" aria-live="polite">
        {step === 1 && <div className="onboarding-step onboarding-step-enter"><p className="eyebrow">Step 1 of 4</p><h1>Terms and conditions</h1><p className="onboarding-lead">Before we finish your account, please review and accept the account terms below.</p>
          <div className="onboarding-terms"><div><ShieldCheck aria-hidden="true" /><h2>Account terms</h2><span>Version 1</span></div><ul><li>Keep your sign-in details private and tell us if you believe your account has been accessed without permission.</li><li>Provide accurate account information and keep it reasonably up to date.</li><li>Use your account lawfully and respectfully when ordering or taking part in community features.</li><li>Your private account data is used to provide account, checkout, enquiry and security features.</li></ul></div>
          <label className="onboarding-consent"><input type="checkbox" checked={termsAccepted} onChange={(event) => setTermsAccepted(event.target.checked)} /><span><strong>I agree to the account terms and conditions</strong><small>Your acceptance and the current terms version will be recorded with your account.</small></span></label>
          <div className="onboarding-actions"><span /><button className="button primary" disabled={!termsAccepted} onClick={() => go(2)}>Continue <ArrowRight aria-hidden="true" /></button></div>
        </div>}

        {step === 2 && <div className="onboarding-step onboarding-step-enter"><p className="eyebrow">Step 2 of 4</p><h1>Choose your preferences</h1><p className="onboarding-lead">Set a few account preferences now. You can change the optional choices later.</p>
          <div className="onboarding-preferences">
            <label className={mailingList ? 'selected' : ''}><span className="onboarding-choice-icon"><Mail aria-hidden="true" /></span><span><strong>Also sign me up to the mailing list</strong><small>We’ll send you occasional updates and news. You can change this in settings.</small></span><input type="checkbox" checked={mailingList} onChange={(event) => setMailingList(event.target.checked)} /></label>
            <div className={`onboarding-preference-stack ${recoveryPhoneEnabled ? 'selected' : ''}`}><label><span className="onboarding-choice-icon"><Phone aria-hidden="true" /></span><span><strong>Add a recovery contact number</strong><small>Save a private phone number for future account support. This does not enable SMS sign-in or SMS recovery by itself.</small></span><input type="checkbox" checked={recoveryPhoneEnabled} onChange={(event) => { setRecoveryPhoneEnabled(event.target.checked); setError('') }} /></label>{recoveryPhoneEnabled && <div className="onboarding-phone-field"><label htmlFor="onboarding-phone">Phone number</label><input id="onboarding-phone" type="tel" autoComplete="tel" inputMode="tel" maxLength={30} value={recoveryPhone} onChange={(event) => setRecoveryPhone(event.target.value)} placeholder="e.g. 0400 000 000" aria-describedby="onboarding-phone-help" /><small id="onboarding-phone-help">Stored in your private account profile. At least six characters are required.</small></div>}</div>
            <label className="selected required"><span className="onboarding-choice-icon"><ShoppingBag aria-hidden="true" /></span><span><strong>Autofill my details at checkout and on the enquiry page</strong><small>Your signed-in profile can fill your name and email where relevant. This is required for the connected account experience.</small></span><input type="checkbox" checked disabled aria-label="Autofill my details at checkout and on the enquiry page (required)" /></label>
          </div>
          {!phoneIsValid && <p className="form-message error" role="alert">Enter a valid phone number or turn off the recovery contact option.</p>}
          <div className="onboarding-actions"><button className="button secondary" onClick={() => go(1)}><ArrowLeft aria-hidden="true" /> Back</button><button className="button primary" disabled={!phoneIsValid} onClick={() => go(3)}>Review choices <ArrowRight aria-hidden="true" /></button></div>
        </div>}

        {step === 3 && <div className="onboarding-step onboarding-step-enter"><p className="eyebrow">Step 3 of 4</p><h1>Final checks</h1><p className="onboarding-lead">Here’s what will be saved to your account. You can go back if anything needs changing.</p>
          <div className="onboarding-review">
            <article><CheckCircle2 aria-hidden="true" /><div><span>Account terms</span><strong>Accepted</strong><small>Account terms version 1</small></div></article>
            <article><Mail aria-hidden="true" /><div><span>Mailing list</span><strong>{mailingList ? 'Sign me up' : 'Not selected'}</strong><small>{mailingList ? 'A confirmation may be required by email.' : 'You can join later from account settings.'}</small></div><button onClick={() => go(2)}>Change</button></article>
            <article><Phone aria-hidden="true" /><div><span>Recovery contact</span><strong>{recoveryPhoneEnabled ? recoveryPhone.trim() : 'Not added'}</strong><small>{recoveryPhoneEnabled ? 'Saved privately to your profile.' : 'You can add a phone number later.'}</small></div><button onClick={() => go(2)}>Change</button></article>
            <article><ShoppingBag aria-hidden="true" /><div><span>Account autofill</span><strong>Enabled</strong><small>For checkout and enquiry forms while signed in.</small></div></article>
          </div>
          {error && <p className="form-message error" role="alert">{error}</p>}
          <div className="onboarding-actions"><button className="button secondary" disabled={busy} onClick={() => go(2)}><ArrowLeft aria-hidden="true" /> Back</button><button className="button primary" disabled={busy} onClick={() => void complete()}>{busy ? <><LoaderCircle className="auth-spinner" aria-hidden="true" /> Saving your choices…</> : <>Finish setup <ClipboardCheck aria-hidden="true" /></>}</button></div>
        </div>}

        {step === 4 && <div className="onboarding-complete onboarding-step-enter"><div className="onboarding-confetti" aria-hidden="true">{Array.from({ length: 24 }, (_, index) => <i key={index} />)}</div><span className="onboarding-celebration"><Sparkles aria-hidden="true" /></span><p className="eyebrow">You’re ready</p><h1>Thank you, {firstName}!</h1><p>Your account setup is complete. Welcome to Doxa.</p><div className="onboarding-complete-summary"><CheckCircle2 aria-hidden="true" /><div><strong>Everything is set</strong><span>Your preferences have been saved securely.</span></div></div><button className="button primary" onClick={() => navigate('/account', { replace: true })}>Continue to your account <ArrowRight aria-hidden="true" /></button></div>}
      </section>
    </div>
  </main>
}

function OnboardingLoader() {
  return <main className="onboarding-shell"><section className="onboarding-loader" role="status" aria-label="Preparing account setup"><div><LoaderCircle aria-hidden="true" /></div><h1>Preparing your account</h1><p>Just a moment while we securely load your setup.</p></section></main>
}
