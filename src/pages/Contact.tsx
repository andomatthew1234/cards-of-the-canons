import { ArrowUpRight, ChevronDown, Clock3, Flag, LogIn, MailCheck, Send, UserCheck } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { PageMeta } from '../components/PageMeta'
import { useAuth } from '../context/AuthContext'
import { useSiteContent } from '../context/SiteContentContext'
import { trackEvent } from '../lib/analytics'
import { getUserProfile } from '../lib/accounts'
import { saveEnquiry } from '../lib/data'

type SubmissionState = 'idle' | 'submitting' | 'success' | 'error'
function submissionError(error: unknown) {
  const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : ''
  if (code.endsWith('/resource-exhausted')) return 'Too many enquiries have been submitted from this connection. Please wait and try again later.'
  if (code.endsWith('/invalid-argument')) return 'Please check each field and try again.'
  if (code.endsWith('/unauthenticated') || code.endsWith('/permission-denied')) return 'We could not verify this submission. Refresh the page and try again.'
  return 'Your enquiry could not be recorded. Please try again shortly.'
}

export function Contact({ previewMode = false }: { previewMode?: boolean }) {
  const [submission, setSubmission] = useState<SubmissionState>('idle')
  const [message, setMessage] = useState('')
  const [manualDetails, setManualDetails] = useState(false)
  const [accountDetailsOverride, setAccountDetailsOverride] = useState(false)
  const [autofillEnabled, setAutofillEnabled] = useState<boolean | null>(null)
  const { user } = useAuth()
  const { website } = useSiteContent()
  const pageCopy = website.pages.contact
  const contactCopy = pageCopy.sections
  const accountName = user?.displayName?.trim() ?? ''
  const accountEmail = user?.email?.trim().toLowerCase() ?? ''
  const hasAccountDetails = accountName.length >= 2 && accountEmail.length > 0
  const useAccountDetails = hasAccountDetails && !manualDetails && (accountDetailsOverride || autofillEnabled === true)

  useEffect(() => {
    let active = true
    setManualDetails(false)
    setAccountDetailsOverride(false)
    if (!user) { setAutofillEnabled(null); return () => { active = false } }
    setAutofillEnabled(null)
    void getUserProfile(user.uid)
      .then((profile) => { if (active) setAutofillEnabled(profile?.preferences?.checkoutAndEnquiryAutofill !== false) })
      .catch(() => { if (active) setAutofillEnabled(true) })
    return () => { active = false }
  }, [user?.uid])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submission === 'submitting') return
    const form = event.currentTarget
    const fields = new FormData(form)
    const organisation = useAccountDetails ? '' : String(fields.get('organisation') ?? '').trim()
    setSubmission('submitting')
    setMessage('')
    try {
      const result = await saveEnquiry({
        kind: 'general',
        name: useAccountDetails ? accountName : String(fields.get('name') ?? '').trim(),
        email: useAccountDetails ? accountEmail : String(fields.get('email') ?? '').trim().toLowerCase(),
        ...(organisation ? { organisation } : {}),
        message: String(fields.get('message') ?? '').trim(),
        // Sending an enquiry is an affirmative request for a response. Record
        // that narrow, service-only consent without making people negotiate a
        // redundant checkbox before they can contact us.
        consent: true,
      })
      if (result.demo) {
        setSubmission('error')
        setMessage('Enquiry submission is not available in this local environment. Please use the public website to send your message.')
        return
      }
      trackEvent('generate_lead')
      form.reset()
      setManualDetails(false)
      setAccountDetailsOverride(false)
      setSubmission('success')
      setMessage('Thank you. Your enquiry has been recorded for the Doxa team to review.')
    } catch (error) {
      setSubmission('error')
      setMessage(submissionError(error))
    }
  }

  return <>
    {!previewMode && <PageMeta title={pageCopy.seo.title} description={pageCopy.seo.description} image={pageCopy.seo.socialImageUrl || undefined} />}
    <header className="page-hero contact-page-hero living-contact-hero" data-editor-target={previewMode ? 'contact-introduction' : undefined}><p className="eyebrow contact-enter contact-enter-1">{pageCopy.eyebrow}</p><h1 className="contact-enter contact-enter-2" data-editor-target={previewMode ? 'contact-heading' : undefined}>{pageCopy.title}</h1><p className="contact-enter contact-enter-3">{pageCopy.body}</p></header>

    <section className="contact-layout contact-view-panel living-contact-panel active" data-editor-target={previewMode ? 'contact-form' : undefined}>
      <aside className="contact-process">
        <div className="contact-open-status"><span aria-hidden="true" /><strong>{contactCopy.enquiry.openLabel}</strong></div>
        <div className="contact-readiness-note"><Flag aria-hidden="true" /><div><strong>{contactCopy.enquiry.quotePromptTitle}</strong><p>{contactCopy.enquiry.quotePromptBody}</p></div></div>
        <div className="contact-process-heading"><p className="eyebrow">{contactCopy.enquiry.processEyebrow}</p><h2>{contactCopy.enquiry.processTitle}</h2><p>{contactCopy.enquiry.processBody}</p></div>
        <ol className="contact-timeline">
          <li><div className="contact-timeline-icon"><Send aria-hidden="true" /></div><div><strong>{contactCopy.enquiry.steps[0].title}</strong><p>{contactCopy.enquiry.steps[0].body}</p></div></li>
          <li className="contact-timeline-connector" aria-hidden="true"><ChevronDown /></li>
          <li><div className="contact-timeline-icon"><Clock3 aria-hidden="true" /></div><div><strong>{contactCopy.enquiry.steps[1].title}</strong><p>{contactCopy.enquiry.steps[1].body}</p></div></li>
          <li className="contact-timeline-connector" aria-hidden="true"><ChevronDown /></li>
          <li><div className="contact-timeline-icon"><MailCheck aria-hidden="true" /></div><div><strong>{contactCopy.enquiry.steps[2].title}</strong><p>{contactCopy.enquiry.steps[2].body}</p></div></li>
        </ol>
      </aside>

      <form className="form-card contact-form-card" onSubmit={submit} aria-busy={submission === 'submitting'}>
        <div className="contact-form-body">
          {!user && <div className="contact-signin-prompt"><LogIn aria-hidden="true" /><div><strong>Sign in for a faster enquiry</strong><p>Sign in or register to autofill your name and email address.</p></div><Link className="button secondary" to="/account">Sign in</Link></div>}
          {useAccountDetails ? <div className="contact-account-details" role="status"><UserCheck aria-hidden="true" /><div><strong>Your account details will be included automatically when you submit this form.</strong><p>We have autofilled your name and email address from your account.</p></div><button type="button" className="button secondary" disabled={submission === 'submitting'} onClick={() => setManualDetails(true)}>Enter different details</button></div> : <><div className="contact-details-heading">{hasAccountDetails && <button type="button" className="text-button" disabled={submission === 'submitting'} onClick={() => { setManualDetails(false); setAccountDetailsOverride(true) }}>Use my account details instead</button>}</div><div className="two-col" key={`${user?.uid ?? 'guest'}-${autofillEnabled}`}><label>Full name<input name="name" required minLength={2} maxLength={80} autoComplete="name" defaultValue={autofillEnabled === false ? '' : accountName} disabled={submission === 'submitting'} /></label><label>Email address<input name="email" type="email" required maxLength={160} autoComplete="email" defaultValue={autofillEnabled === false ? '' : accountEmail} disabled={submission === 'submitting'} /></label></div><label>Organisation <span>(optional)</span><input name="organisation" maxLength={120} autoComplete="organization" disabled={submission === 'submitting'} /></label></>}
          <label className="contact-message-field"><span>How can we help?</span><small>Share your question, idea, quote requirements or feedback with the team.</small><textarea name="message" required minLength={10} maxLength={3000} rows={7} placeholder="I’d like to ask about…" disabled={submission === 'submitting'} /></label>
          {message && <p className={`form-message${submission === 'success' ? ' success' : ' error'}`} role={submission === 'error' ? 'alert' : 'status'}>{message}</p>}
          <button className="button primary contact-submit" disabled={submission === 'submitting'}>{submission === 'submitting' ? 'Sending…' : 'Send enquiry'} <ArrowUpRight aria-hidden="true" /></button>
        </div>
      </form>
    </section>
  </>
}
