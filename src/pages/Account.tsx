import { Check, Eye, EyeOff, LoaderCircle } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { PageMeta } from '../components/PageMeta'
import { AccountCentreShell } from '../components/account/AccountChrome'
import { MfaSignInChallenge } from '../components/account/MfaSignInChallenge'
import { appleAuthEnabled, googleAuthEnabled } from '../config'
import { friendlyAuthError, useAuth } from '../context/AuthContext'
import { isRecentlyCreatedAccount } from '../lib/accountOnboarding'
import { getUserProfile } from '../lib/accounts'
import { AccountOverview } from './account/AccountCentrePages'

type Mode = 'signin' | 'register' | 'reset'

export function Account() {
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [feedback, setFeedback] = useState<{ text: string; tone: 'error' | 'success' } | null>(null)
  const [busy, setBusy] = useState<'email' | 'google' | 'apple' | ''>('')
  const [showPassword, setShowPassword] = useState(false)
  const [settingUp, setSettingUp] = useState(false)
  const [onboardingStatus, setOnboardingStatus] = useState<'checking' | 'pending' | 'ready'>('checking')
  const auth = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const returnPath = (location.state as { from?: unknown } | null)?.from
  const destination = typeof returnPath === 'string' && returnPath.startsWith('/account/') && !returnPath.startsWith('//')
    ? returnPath
    : ''
  const disabled = Boolean(busy)

  useEffect(() => {
    if (!auth.user) { setOnboardingStatus('checking'); return }
    let active = true
    setOnboardingStatus('checking')
    void getUserProfile(auth.user.uid).then((profile) => {
      if (!active) return
      const status = profile?.onboarding?.status
      setOnboardingStatus(status === 'pending' || (status !== 'complete' && isRecentlyCreatedAccount(auth.user!.metadata)) ? 'pending' : 'ready')
    }).catch(() => {
      // Onboarding is a guided preference flow, not an authorisation boundary.
      // Do not lock an established customer out if a profile read is transiently
      // unavailable, but never silently skip setup for a newly created account.
      if (active) setOnboardingStatus(isRecentlyCreatedAccount(auth.user!.metadata) ? 'pending' : 'ready')
    })
    return () => { active = false }
  }, [auth.user?.uid])

  async function run(name: typeof busy, action: () => Promise<void>, success?: string) {
    setBusy(name)
    setFeedback(null)
    auth.clearNotice()
    try {
      await action()
      if (success) setFeedback({ text: success, tone: 'success' })
    } catch (error) {
      setFeedback({ text: friendlyAuthError(error), tone: 'error' })
    } finally {
      setBusy('')
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    await run('email', async () => {
      if (mode === 'signin') await auth.signIn(String(form.get('email')), String(form.get('password')))
      if (mode === 'register') {
        setSettingUp(true)
        try {
          await Promise.all([
            auth.register(String(form.get('name')), String(form.get('email')), String(form.get('password'))),
            new Promise((resolve) => window.setTimeout(resolve, 5000)),
          ])
          navigate('/account/onboarding', { replace: true })
        } catch (error) {
          setSettingUp(false)
          throw error
        }
      }
      if (mode === 'reset') await auth.resetPassword(String(form.get('email')))
    }, mode === 'reset' ? 'If an account exists, a password-reset email has been sent.' : undefined)
  }

  async function providerSignIn(provider: 'google' | 'apple') {
    await run(provider, async () => {
      const isNewUser = provider === 'google' ? await auth.signInWithGoogle() : await auth.signInWithApple()
      if (!isNewUser) return
      setSettingUp(true)
      try {
        await new Promise((resolve) => window.setTimeout(resolve, 5000))
        navigate('/account/onboarding', { replace: true })
      } catch (error) {
        setSettingUp(false)
        throw error
      }
    })
  }

  function selectMode(nextMode: Mode) {
    setMode(nextMode)
    setFeedback(null)
    setShowPassword(false)
    auth.clearNotice()
  }

  const intro = <div className="account-intro"><p className="eyebrow">Your collection</p><h1>Keep your orders in one place.</h1><p>Sign in to manage your profile, account security and order history.</p><ul className="account-benefits"><li><Check /> Review your order history</li><li><Check /> Keep your profile details current</li><li><Check /> Use protected account recovery</li></ul></div>

  if (settingUp) {
    return <><PageMeta title="Setting up your account" description="Preparing your Doxa account." /><section className="account-setup-screen" role="status" aria-live="polite"><div className="account-setup-animation" aria-hidden="true"><span className="account-setup-seal">D</span><i /><i /><i /></div><p className="eyebrow">Doxa</p><h1>Setting up your account with us…</h1><p>We’re preparing your secure account and personalising the next steps.</p><div className="account-setup-progress"><span /></div></section></>
  }

  if (auth.loading) {
    return <><PageMeta title="Customer account" description="Sign in with email or Google, create an account, or reset a password." /><section className="account-layout">{intro}<div className="form-card account-card auth-checking" role="status" aria-live="polite"><LoaderCircle className="auth-spinner" /><h2>Checking your account</h2><p>Securely restoring your session…</p></div></section></>
  }
  if (auth.user) {
    if (onboardingStatus === 'checking') return <AccountCentreShell title="Account" description="" eyebrow="" loading><span /></AccountCentreShell>
    if (onboardingStatus === 'pending') return <Navigate to="/account/onboarding" replace />
    return destination ? <Navigate to={destination} replace /> : <AccountOverview />
  }
  if (auth.mfaChallenge) return <><PageMeta title="Verify your sign-in" description="Complete multi-factor authentication with an enrolled security method." /><section className="account-layout">{intro}<MfaSignInChallenge /></section></>

  const displayedFeedback = feedback ?? (auth.notice ? { text: auth.notice, tone: 'error' as const } : null)
  const submitLabel = busy === 'email'
    ? mode === 'signin' ? 'Signing in…' : mode === 'register' ? 'Creating account…' : 'Sending reset email…'
    : mode === 'signin' ? 'Sign in securely' : mode === 'register' ? 'Create account' : 'Send reset email'

  return <><PageMeta title="Customer account" description="Sign in with email or Google, create an account, or reset a password." /><section className="account-layout">{intro}<form className="form-card account-card" onSubmit={submit} aria-busy={disabled}><div className={`tabs ${mode === 'register' ? 'register-selected' : 'signin-selected'}`} role="tablist" aria-label="Account action"><button id="signin-tab" type="button" role="tab" aria-controls="account-form-panel" aria-selected={mode !== 'register'} className={mode !== 'register' ? 'active' : ''} disabled={disabled} onClick={() => selectMode('signin')}>Sign in</button><button id="register-tab" type="button" role="tab" aria-controls="account-form-panel" aria-selected={mode === 'register'} className={mode === 'register' ? 'active' : ''} disabled={disabled} onClick={() => selectMode('register')}>Register</button></div><div id="account-form-panel" role="tabpanel" aria-labelledby={mode === 'register' ? 'register-tab' : 'signin-tab'} className="account-card-header"><p className="eyebrow">{mode === 'signin' ? 'Welcome back' : mode === 'register' ? 'New customer' : 'Account recovery'}</p><h2>{mode === 'signin' ? 'Sign in to your account' : mode === 'register' ? 'Create your account' : 'Reset your password'}</h2><p>{mode === 'reset' ? 'Enter your account email address and we will send recovery instructions.' : 'Choose a secure sign-in method below.'}</p></div>{mode !== 'reset' && <><div className="provider-buttons"><button type="button" className="provider-button google" disabled={disabled || !googleAuthEnabled} onClick={() => void providerSignIn('google')}><span aria-hidden="true">G</span>{busy === 'google' ? 'Connecting to Google…' : 'Continue with Google'}</button>{appleAuthEnabled && <button type="button" className="provider-button apple" disabled={disabled} onClick={() => void providerSignIn('apple')}><span aria-hidden="true">●</span>{busy === 'apple' ? 'Connecting to Apple…' : 'Continue with Apple'}</button>}</div><div className="form-divider"><span>or continue with email</span></div></>}{mode === 'register' && <label>Full name<input name="name" required minLength={2} maxLength={80} autoComplete="name" disabled={disabled} /></label>}<label>Email address<input name="email" type="email" required maxLength={160} autoComplete="email" inputMode="email" autoCapitalize="none" spellCheck={false} value={email} disabled={disabled} onChange={(event) => setEmail(event.target.value)} /></label>{mode !== 'reset' && <label>Password<div className="password-input"><input aria-label="Password" name="password" type={showPassword ? 'text' : 'password'} required minLength={mode === 'register' ? 8 : undefined} autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} disabled={disabled} /><button type="button" className="password-visibility" aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} disabled={disabled} onClick={() => setShowPassword((visible) => !visible)}>{showPassword ? <EyeOff /> : <Eye />}</button></div>{mode === 'register' && <span className="field-help">Use at least eight characters.</span>}</label>}<button className="button primary grow" disabled={disabled}>{submitLabel}</button>{mode === 'signin' && <button className="text-button centred-button" type="button" disabled={disabled} onClick={() => selectMode('reset')}>Forgot your password?</button>}{mode === 'reset' && <button className="text-button centred-button" type="button" disabled={disabled} onClick={() => selectMode('signin')}>Back to sign in</button>}{displayedFeedback && <p className={`form-message ${displayedFeedback.tone}`} role={displayedFeedback.tone === 'error' ? 'alert' : 'status'}>{displayedFeedback.text}</p>}<p className="provider-note">For your security, never share your password with anyone.</p></form></section></>
}
