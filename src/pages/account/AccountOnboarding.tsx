import { LoaderCircle, ShieldCheck } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { PageMeta } from '../../components/PageMeta'
import { friendlyAuthError, useAuth } from '../../context/AuthContext'
import {
  clearRegistrationNewsPreference,
  isRecentlyCreatedAccount,
  readRegistrationNewsPreference,
} from '../../lib/accountOnboarding'
import { beginAccountOnboarding, completeAccountOnboarding, getUserProfile } from '../../lib/accounts'
import { joinAccountMailingList } from '../../lib/data'

type SetupState = 'checking' | 'completing' | 'error' | 'unavailable'

export function AccountOnboarding() {
  const auth = useAuth()
  const navigate = useNavigate()
  const [state, setState] = useState<SetupState>('checking')
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const running = useRef(false)

  useEffect(() => {
    if (!auth.user || running.current) return
    let active = true
    running.current = true
    setState('checking')
    setError('')
    void (async () => {
      try {
        let profile = null
        try {
          profile = await getUserProfile(auth.user!.uid)
        } catch {
          // A new account may safely retry the idempotent onboarding marker.
        }
        if (!active) return
        if (profile?.onboarding?.status === 'complete') {
          clearRegistrationNewsPreference()
          navigate('/account', { replace: true })
          return
        }
        if (profile?.onboarding?.status !== 'pending') {
          if (!isRecentlyCreatedAccount(auth.user!.metadata)) {
            setState('unavailable')
            return
          }
          const result = await beginAccountOnboarding()
          if (!result.required) {
            clearRegistrationNewsPreference()
            navigate('/account', { replace: true })
            return
          }
        }

        setState('completing')
        const receiveNews = readRegistrationNewsPreference()
        if (receiveNews) await joinAccountMailingList('account_registration')
        await completeAccountOnboarding({
          termsAccepted: true,
          termsVersion: 'account-terms-v1',
          autofillConsent: true,
          mailingListSelected: receiveNews,
          recoveryPhone: null,
        })
        clearRegistrationNewsPreference()
        if (active) navigate('/account', { replace: true })
      } catch (failure) {
        if (!active) return
        setError(friendlyAuthError(failure))
        setState('error')
      } finally {
        running.current = false
      }
    })()
    return () => { active = false }
  }, [attempt, auth.user, navigate])

  if (auth.loading) return <OnboardingLoader />
  if (!auth.user) return <Navigate to="/account" replace />
  if (state === 'error') {
    return <main className="onboarding-shell"><PageMeta title="Account setup" description="Finish setting up your new account." /><section className="onboarding-unavailable"><ShieldCheck aria-hidden="true" /><h1>Let’s finish setting up your account.</h1><p>{error || 'Account setup could not be completed just now. Please try again.'}</p><button className="button primary" onClick={() => setAttempt((value) => value + 1)}>Try again</button></section></main>
  }
  if (state === 'unavailable') {
    return <main className="onboarding-shell"><PageMeta title="Account setup" description="Set up a newly created account." /><section className="onboarding-unavailable"><ShieldCheck aria-hidden="true" /><h1>Your account is ready.</h1><p>This setup is only needed when an account is first created.</p><button className="button primary" onClick={() => navigate('/account', { replace: true })}>Continue to your account</button></section></main>
  }
  return <OnboardingLoader completing={state === 'completing'} />
}

function OnboardingLoader({ completing = false }: { completing?: boolean }) {
  return <main className="onboarding-shell"><PageMeta title="Setting up your account" description="Preparing your Doxa account." /><section className="onboarding-loader" role="status" aria-label="Preparing account setup"><div><LoaderCircle aria-hidden="true" /></div><h1>{completing ? 'Finishing your account setup' : 'Preparing your account'}</h1><p>{completing ? 'Applying your account preferences securely…' : 'Just a moment while we securely load your setup.'}</p></section></main>
}
