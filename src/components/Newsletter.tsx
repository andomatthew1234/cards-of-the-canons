import { ArrowRight } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { trackEvent } from '../lib/analytics'
import { saveNewsletter } from '../lib/data'
import { useSiteContent } from '../context/SiteContentContext'

type NewsletterProps = {
  title?: string
  showEyebrow?: boolean
}

export function Newsletter({ title, showEyebrow = true }: NewsletterProps = {}) {
  const [state, setState] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const { website } = useSiteContent()
  const copy = website.copy.newsletter

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (state === 'submitting') return
    const form = event.currentTarget
    const fields = new FormData(form)
    setState('submitting')
    setMessage('')
    try {
      const result = await saveNewsletter(String(fields.get('email') ?? ''), 'home')
      if (result.demo) {
        setState('error')
        setMessage('Mailing-list signup is not available in this local environment.')
        return
      }
      trackEvent('newsletter_signup')
      form.reset()
      setState('success')
      setMessage('Request received. No further action is required; a confirmation email will be sent if this address was added.')
    } catch {
      setState('error')
      setMessage('We could not complete your signup. Please wait a moment and try again.')
    }
  }

  return <section className="newsletter" aria-labelledby="newsletter-title">
    <div>{showEyebrow && <p className="eyebrow light">{copy.eyebrow}</p>}<h2 id="newsletter-title">{title ?? copy.title}</h2><p>{copy.body}</p></div>
    <form onSubmit={submit} aria-busy={state === 'submitting'}><label htmlFor="newsletter-email">Email address</label><div className="inline-input"><input id="newsletter-email" name="email" type="email" autoComplete="email" placeholder={copy.emailPlaceholder} required maxLength={160} disabled={state === 'submitting'} /><button aria-label="Join the mailing list" disabled={state === 'submitting'}>{state === 'submitting' ? 'Joining…' : <ArrowRight />}</button></div><label className="check"><input name="consent" type="checkbox" required disabled={state === 'submitting'} /> {copy.consentLabel}</label>{message && <p className={`newsletter-message ${state}`} role={state === 'error' ? 'alert' : 'status'}>{message}</p>}</form>
  </section>
}
