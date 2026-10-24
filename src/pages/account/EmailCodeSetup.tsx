import { AlertTriangle, ArrowRight, Check, Clock3, KeyRound, Mail, ShieldCheck } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { SecurityFlow } from '../../components/account/SecurityFlow'
import { PageMeta } from '../../components/PageMeta'
import { useAuth } from '../../context/AuthContext'
import { getAccountSecurityPolicy } from '../../lib/accounts'
import { maskEmail } from '../../lib/security'
import type { AccountSecurityCapabilities } from '../../types'

const steps = [
  { number: '01', label: 'Learn about email codes' },
  { number: '02', label: 'Confirm your email' },
  { number: '03', label: 'Verify your email' },
  { number: '04', label: 'Choose your protection' },
  { number: '05', label: 'Complete' },
]

const unavailable: AccountSecurityCapabilities = {
  emailCodeDelivery: false,
  passwordlessEmailCode: false,
  authenticator: false,
  passkeys: false,
  explanation: 'Secure email-code delivery is not configured for this site yet.',
}

export function EmailCodeSetup() {
  const auth = useAuth()
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [revealed, setRevealed] = useState(false)
  const [capabilities, setCapabilities] = useState(unavailable)
  useEffect(() => {
    if (!auth.user) return
    void getAccountSecurityPolicy().then((result) => setCapabilities(result.capabilities)).catch(() => undefined)
  }, [auth.user])
  const email = auth.user?.email ?? ''

  return <>
    <PageMeta title="Email code protection" description="Learn about additional email security checks for your account." />
    <SecurityFlow title="Email code protection" eyebrow="Security method setup" steps={steps} activeStep={step} onBack={() => navigate('/account/security')}>
      {step === 1 && <><div className="security-flow-lead"><ShieldCheck aria-hidden="true" /><div><p className="eyebrow">Learn about email codes</p><h2>Add another account check.</h2><p>We’ll help you understand how email verification codes can protect selected actions.</p></div></div><div className="security-time-note"><Clock3 aria-hidden="true" /><span><strong>Time required</strong> About 2 minutes once secure delivery is available</span></div><div className="security-learning-grid"><article><Mail aria-hidden="true" /><h3>One-time delivery</h3><p>A short code is sent to your trusted email and can be used only once.</p></article><article><Clock3 aria-hidden="true" /><h3>Short expiry</h3><p>Codes expire quickly and verification attempts are strictly limited.</p></article><article><KeyRound aria-hidden="true" /><h3>Additional protection</h3><p>A code can follow your normal sign-in for selected sensitive actions.</p></article><article><ShieldCheck aria-hidden="true" /><h3>Built to grow</h3><p>The policy supports stronger methods such as authenticator apps and passkeys later.</p></article></div><div className="security-terminology-note"><AlertTriangle aria-hidden="true" /><p><strong>An important distinction:</strong> an email code used instead of a password is passwordless email sign-in. It is not two-factor authentication. An email code requested after another method is an additional security check.</p></div><ul className="security-check-list compact"><li><Check /> You must retain access to your trusted email.</li><li><Check /> Codes must never be shared with another person.</li><li><Check /> Doxa will never ask you to read a code aloud.</li></ul><div className="security-flow-actions"><button className="button primary" onClick={() => setStep(2)}>Continue</button></div></>}

      {step === 2 && <><div className="security-flow-lead"><Mail aria-hidden="true" /><div><p className="eyebrow">Confirm your email</p><h2>Use this email for security codes?</h2><p>This must be an address you control and check regularly.</p></div></div><div className="security-email-confirmation"><Mail aria-hidden="true" /><div><span>Current account email</span><strong>{revealed ? email : maskEmail(email)}</strong><button type="button" onClick={() => setRevealed((value) => !value)}>{revealed ? 'Hide address' : 'Reveal address'}</button></div><span className={`security-status ${auth.user?.emailVerified ? 'positive' : 'warning'}`}>{auth.user?.emailVerified ? 'Verified' : 'Not verified'}</span></div>{!auth.user?.emailVerified && <div className="security-critical-warning"><AlertTriangle aria-hidden="true" /><p>Your account email must be verified before it can become a trusted security destination. Return to Security &amp; sign-in to send a verification email.</p></div>}<div className="security-flow-actions split"><button className="button secondary" onClick={() => setStep(1)}>Back</button>{auth.user?.emailVerified ? <button className="button primary" onClick={() => setStep(3)}>Yes, continue</button> : <Link className="button primary" to="/account/security">Verify my email first <ArrowRight aria-hidden="true" /></Link>}</div></>}

      {step === 3 && <><div className="security-flow-lead"><KeyRound aria-hidden="true" /><div><p className="eyebrow">Verify your email</p><h2>Secure code delivery is not connected yet.</h2><p>No code has been sent and no protection setting has been changed.</p></div></div><div className="security-unavailable-panel"><AlertTriangle aria-hidden="true" /><div><h3>Why setup stops here</h3><p>{capabilities.explanation}</p><p>A production six-digit code requires cryptographically secure generation, hashed server storage, expiry, one-time use, attempt limits, resend throttling and a trusted transactional email service. The server-owned policy structure is ready, but enabling this screen before delivery exists would create fake security.</p></div></div><div className="security-future-policy"><h3>Protection choices prepared for later</h3><div><span><strong>Full protection</strong><small>Sign-in and critical actions</small></span><span className="security-status neutral">Unavailable</span></div><div><span><strong>Custom protection</strong><small>Choose protected action categories</small></span><span className="security-status neutral">Unavailable</span></div><div><span><strong>Passwordless sign-in</strong><small>Email code instead of a password; not 2FA by itself</small></span><span className="security-status neutral">Unavailable</span></div><div><span><strong>Passwordless + action protection</strong><small>Passwordless entry plus a fresh code for critical changes</small></span><span className="security-status neutral">Unavailable</span></div></div><div className="security-flow-actions split"><button className="button secondary" onClick={() => setStep(2)}>Back</button><button className="button primary" onClick={() => navigate('/account/security')}>Return to Security &amp; sign-in</button></div></>}
    </SecurityFlow>
  </>
}
