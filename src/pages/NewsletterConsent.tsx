import { CheckCircle2, Mail, ShieldAlert, XCircle } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { PageMeta } from '../components/PageMeta'
import { confirmNewsletterSubscription, unsubscribeNewsletter } from '../lib/data'

type Action = 'confirm' | 'unsubscribe'
type Phase = 'working' | 'confirmed' | 'suppressed' | 'unsubscribed' | 'invalid' | 'error'

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,200}$/

/** Keeps a server-supplied absolute consent URL inside this site's routes. */
function consentPath(url?: string) {
  if (!url) return undefined
  try {
    const parsed = new URL(url, window.location.origin)
    return `${parsed.pathname}${parsed.search}`
  } catch {
    return undefined
  }
}

/**
 * Public, token-gated consent pages. The token is presented to the server and
 * never rendered, logged or stored; every state change happens in the callable
 * function, so a page refresh cannot mutate anything.
 */
function ConsentResult({ action, phase, unsubscribePath }: { action: Action; phase: Phase; unsubscribePath?: string }) {
  if (phase === 'working') {
    return <div className="security-complete-state"><span><Mail aria-hidden="true" /></span><p className="eyebrow">Working</p><h2>Checking your link…</h2><p>This only takes a moment.</p></div>
  }
  if (phase === 'confirmed') {
    return <div className="security-complete-state"><span><CheckCircle2 aria-hidden="true" /></span><p className="eyebrow">Confirmed</p><h2>You’re on the list.</h2><p>Your subscription is confirmed. You can stop the updates at any time.</p>{unsubscribePath && <p className="security-flow-copy"><Link to={unsubscribePath}>Unsubscribe using your personal link</Link></p>}<div className="button-row"><Link className="button primary" to="/">Return home</Link></div></div>
  }
  if (phase === 'unsubscribed') {
    return <div className="security-complete-state"><span><CheckCircle2 aria-hidden="true" /></span><p className="eyebrow">Unsubscribed</p><h2>You’ve been unsubscribed.</h2><p>This address is suppressed and will not receive further updates.</p><div className="button-row"><Link className="button primary" to="/">Return home</Link></div></div>
  }
  if (phase === 'suppressed') {
    return <div className="security-complete-state"><span className="danger"><ShieldAlert aria-hidden="true" /></span><p className="eyebrow">Not confirmed</p><h2>This address is unsubscribed.</h2><p>The link is no longer able to change that. Contact us if you believe this is a mistake.</p><div className="button-row"><Link className="button primary" to="/">Return home</Link></div></div>
  }
  if (phase === 'invalid') {
    return <div className="security-complete-state"><span className="danger"><XCircle aria-hidden="true" /></span><p className="eyebrow">Link not valid</p><h2>This link is no longer valid.</h2><p>{action === 'confirm'
      ? 'Confirmation links are single-use and expire after seven days. Request a new signup to receive a fresh link.'
      : 'This unsubscribe link could not be recognised. Use the unsubscribe link from a message, or contact us.'}</p><div className="button-row"><Link className="button primary" to="/">Return home</Link></div></div>
  }
  return <div className="security-complete-state"><span className="danger"><ShieldAlert aria-hidden="true" /></span><p className="eyebrow">Something went wrong</p><h2>We could not complete that request.</h2><p>The service could not be reached. Please try the link again in a moment.</p><div className="button-row"><Link className="button primary" to="/">Return home</Link></div></div>
}

export function NewsletterConsentPage({ action }: { action: Action }) {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''
  const [phase, setPhase] = useState<Phase>('working')
  const [unsubscribePath, setUnsubscribePath] = useState<string | undefined>(undefined)
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    if (!TOKEN_PATTERN.test(token)) {
      setPhase('invalid')
      return
    }
    const run = action === 'confirm' ? confirmNewsletterSubscription : unsubscribeNewsletter
    void run(token).then((result) => {
      if (action === 'confirm') {
        if (result.confirmed) {
          setUnsubscribePath(consentPath(result.unsubscribeUrl))
          setPhase('confirmed')
        } else if (result.status === 'unsubscribed') setPhase('suppressed')
        else setPhase('invalid')
      } else if (result.unsubscribed) setPhase('unsubscribed')
      else setPhase('invalid')
    }).catch(() => setPhase('invalid'))
  }, [action, token])

  return <section className="not-found-page">
    <PageMeta
      title={action === 'confirm' ? 'Confirm subscription' : 'Unsubscribe'}
      description={action === 'confirm' ? 'Confirm your Doxa mailing-list subscription.' : 'Unsubscribe from Doxa mailing-list updates.'}
      noIndex
    />
    <ConsentResult action={action} phase={phase} unsubscribePath={unsubscribePath} />
  </section>
}

export function NewsletterConfirmPage() {
  return <NewsletterConsentPage action="confirm" />
}

export function NewsletterUnsubscribePage() {
  return <NewsletterConsentPage action="unsubscribe" />
}
