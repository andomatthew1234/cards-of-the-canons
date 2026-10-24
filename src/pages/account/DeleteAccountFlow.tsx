import { AlertTriangle, Check, ShieldCheck, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { ReauthenticationPanel } from '../../components/account/ReauthenticationPanel'
import { SecurityFlow } from '../../components/account/SecurityFlow'
import { PageMeta } from '../../components/PageMeta'
import { friendlyAuthError, useAuth } from '../../context/AuthContext'

const steps = [
  { number: '01', label: 'Understand deletion' },
  { number: '02', label: 'Confirm it’s you' },
  { number: '03', label: 'Final confirmation' },
  { number: '04', label: 'Complete' },
]

export function DeleteAccountFlow() {
  const auth = useAuth()
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [acknowledged, setAcknowledged] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  function leave() { navigate('/account/manage') }

  async function deleteAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    const confirmation = String(new FormData(event.currentTarget).get('confirmation') || '')
    if (confirmation !== 'DELETE') {
      setError('Type DELETE exactly to confirm permanent account deletion.')
      return
    }
    setBusy(true)
    setError('')
    try {
      await auth.deleteCurrentAccount()
      setStep(4)
    } catch (value) {
      setError(friendlyAuthError(value))
    } finally {
      setBusy(false)
    }
  }

  return <>
    <PageMeta title="Delete account" description="Securely request permanent deletion of your customer account." />
    <SecurityFlow title="Delete account" eyebrow="Permanent account action" steps={steps} activeStep={step} onBack={leave}>
      {step === 1 && <><div className="security-flow-lead danger"><Trash2 aria-hidden="true" /><div><p className="eyebrow">Understand deletion</p><h2>This permanently removes your account.</h2><p>Deletion is intentionally separated from everyday settings.</p></div></div><div className="security-explainer-grid"><div><h3>Account deletion will</h3><ul className="security-check-list"><li><Check /> Remove your login</li><li><Check /> Remove your private customer profile</li><li><Check /> End access to account-only pages</li><li><Check /> Require a new account if you return later</li></ul></div><div className="security-warning-panel danger"><h3>Records that may remain</h3><p>Completed order and business records may need to be retained separately where operationally or legally required. They will not remain available as a customer login.</p>{auth.isAdmin && <p><strong>Administrator warning:</strong> deleting this login also removes its administrator access.</p>}</div></div><label className="security-acknowledgement danger"><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} /><span><strong>I understand this account cannot be restored</strong><small>I want to continue to identity confirmation.</small></span></label><div className="security-flow-actions split"><button className="button secondary" onClick={leave}>Cancel</button><button className="button danger-button" disabled={!acknowledged} onClick={() => setStep(2)}>Continue</button></div></>}
      {step === 2 && <ReauthenticationPanel onAuthenticated={() => setStep(3)} />}
      {step === 3 && <><div className="security-flow-lead danger"><ShieldCheck aria-hidden="true" /><div><p className="eyebrow">Final confirmation</p><h2>One last check.</h2><p>Your identity has been freshly confirmed. This is the final deletion step.</p></div></div><div className="security-critical-warning danger"><AlertTriangle aria-hidden="true" /><p>After you press the final button, your login is deleted immediately. Do not continue if you only intended to sign out or stop receiving email.</p></div><form className="security-compact-form" onSubmit={deleteAccount}><label>Type DELETE to confirm<input name="confirmation" required autoComplete="off" spellCheck={false} /></label>{error && <p className="form-message error" role="alert">{error}</p>}<div className="security-flow-actions split"><button type="button" className="button secondary" onClick={leave}>No, keep my account</button><button className="button danger-button" disabled={busy}>{busy ? 'Deleting account…' : 'Permanently delete account'}</button></div></form></>}
      {step === 4 && <div className="security-complete-state"><span className="danger"><Trash2 aria-hidden="true" /></span><p className="eyebrow">Complete</p><h2>Your account has been deleted.</h2><p>Your login and private profile are no longer available.</p><button className="button primary" onClick={() => navigate('/')}>Return to the storefront</button></div>}
    </SecurityFlow>
  </>
}
