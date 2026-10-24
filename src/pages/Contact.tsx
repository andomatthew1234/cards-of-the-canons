import {
  ArrowUpRight, CheckCircle2, ChevronDown, Clock3, FileText, Flag, LogIn,
  Mail, MailCheck, MessageCircle, Send, UserCheck,
} from 'lucide-react'
import { useState, type FormEvent, type KeyboardEvent } from 'react'
import { Link } from 'react-router-dom'
import { PageMeta } from '../components/PageMeta'
import { useAuth } from '../context/AuthContext'
import { useSiteContent } from '../context/SiteContentContext'
import { trackEvent } from '../lib/analytics'
import { saveEnquiry } from '../lib/data'
import type { EnquiryKind } from '../types'

type SubmissionState = 'idle' | 'submitting' | 'success' | 'error'
type ContactView = 'enquiry' | 'direct'

function submissionError(error: unknown) {
  const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : ''
  if (code.endsWith('/resource-exhausted')) return 'Too many enquiries have been submitted from this connection. Please wait and try again later.'
  if (code.endsWith('/invalid-argument')) return 'Please check each field and try again.'
  if (code.endsWith('/unauthenticated') || code.endsWith('/permission-denied')) return 'We could not verify this submission. Refresh the page and try again.'
  return 'Your enquiry could not be recorded. Please try again shortly.'
}

export function Contact({ previewMode = false }: { previewMode?: boolean }) {
  const [view, setView] = useState<ContactView>('enquiry')
  const [kind, setKind] = useState<EnquiryKind>('general')
  const [submission, setSubmission] = useState<SubmissionState>('idle')
  const [message, setMessage] = useState('')
  const [manualDetails, setManualDetails] = useState(false)
  const { user } = useAuth()
  const { settings,website } = useSiteContent()
  const pageCopy = website.pages.contact
  const contactCopy = pageCopy.sections
  const accountName = user?.displayName?.trim() ?? ''
  const accountEmail = user?.email?.trim().toLowerCase() ?? ''
  const hasAccountDetails = accountName.length >= 2 && accountEmail.length > 0
  const useAccountDetails = hasAccountDetails && !manualDetails

  function handleViewKeys(event: KeyboardEvent<HTMLButtonElement>) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const next: ContactView = event.key === 'ArrowLeft' || event.key === 'Home' ? 'enquiry' : 'direct'
    setView(next)
    document.getElementById(`contact-${next}-tab`)?.focus()
  }

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
        kind,
        name: useAccountDetails ? accountName : String(fields.get('name') ?? '').trim(),
        email: useAccountDetails ? accountEmail : String(fields.get('email') ?? '').trim().toLowerCase(),
        ...(organisation ? { organisation } : {}),
        message: String(fields.get('message') ?? '').trim(),
        consent: fields.get('consent') === 'on',
      })
      if (result.demo) {
        setSubmission('error')
        setMessage('Enquiry submission is not available in this local environment. Please use the public website to send your message.')
        return
      }
      trackEvent('generate_lead')
      form.reset()
      setKind('general')
      setManualDetails(false)
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

    <div className="contact-switcher-shell contact-switcher-enter"><div className={`contact-view-tabs ${view === 'enquiry' ? 'enquiry-selected' : 'direct-selected'}`} role="tablist" aria-label="Contact options">
      <button id="contact-enquiry-tab" type="button" role="tab" aria-selected={view === 'enquiry'} aria-controls="contact-enquiry-panel" tabIndex={view === 'enquiry' ? 0 : -1} onClick={() => setView('enquiry')} onKeyDown={handleViewKeys}><MessageCircle aria-hidden="true" /><span>{contactCopy.tabs.enquiryLabel}</span></button>
      <button id="contact-direct-tab" type="button" role="tab" aria-selected={view === 'direct'} aria-controls="contact-direct-panel" tabIndex={view === 'direct' ? 0 : -1} onClick={() => setView('direct')} onKeyDown={handleViewKeys}><Mail aria-hidden="true" /><span>{contactCopy.tabs.directLabel}</span></button>
    </div></div>

    <section id="contact-enquiry-panel" className={`contact-layout contact-view-panel living-contact-panel${view === 'enquiry' ? ' active' : ''}`} role="tabpanel" aria-labelledby="contact-enquiry-tab" hidden={view !== 'enquiry'} data-editor-target={previewMode ? 'contact-form' : undefined}>
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
        <fieldset className={`contact-kind-tabs ${kind === 'general' ? 'general-selected' : 'quote-selected'}`} data-kind={kind} disabled={submission === 'submitting'}>
          <legend className="sr-only">What can we help with?</legend>
          <label><input type="radio" name="kind" value="general" checked={kind === 'general'} onChange={() => setKind('general')} /><MessageCircle aria-hidden="true" /><span><strong>General enquiry</strong><small>Questions, ideas and feedback</small></span></label>
          <label><input type="radio" name="kind" value="quote" checked={kind === 'quote'} onChange={() => setKind('quote')} /><FileText aria-hidden="true" /><span><strong>Quote request</strong><small>Quantities, pricing and plans</small></span></label>
        </fieldset>
        <div className="contact-form-body">
          {!user && <div className="contact-signin-prompt"><LogIn aria-hidden="true" /><div><strong>Sign in for a faster enquiry</strong><p>Sign in or register to autofill your name and email address.</p></div><Link className="button secondary" to="/account">Sign in</Link></div>}
          {useAccountDetails ? <div className="contact-account-details" role="status"><UserCheck aria-hidden="true" /><div><strong>Your account details will be included automatically when you submit this form.</strong><p>We have autofilled your name and email address from your account.</p></div><button type="button" className="button secondary" disabled={submission === 'submitting'} onClick={() => setManualDetails(true)}>Enter different details</button></div> : <><div className="contact-details-heading">{hasAccountDetails && <button type="button" className="text-button" disabled={submission === 'submitting'} onClick={() => setManualDetails(false)}>Use my account details instead</button>}</div><div className="two-col" key={user?.uid ?? 'guest'}><label>Full name<input name="name" required minLength={2} maxLength={80} autoComplete="name" defaultValue={accountName} disabled={submission === 'submitting'} /></label><label>Email address<input name="email" type="email" required maxLength={160} autoComplete="email" defaultValue={accountEmail} disabled={submission === 'submitting'} /></label></div><label>Organisation <span>(optional)</span><input name="organisation" maxLength={120} autoComplete="organization" disabled={submission === 'submitting'} /></label></>}
          <label className="contact-message-field" key={kind}><span>{kind === 'quote' ? 'Tell us about your quote request' : 'How can we help?'}</span><small>{kind === 'quote' ? 'Include estimated quantities, timing and any specific collection ideas.' : 'Share your question, idea or feedback with the team.'}</small><textarea name="message" required minLength={10} maxLength={3000} rows={7} placeholder={kind === 'quote' ? 'I’m interested in a quote for…' : 'I’d like to ask about…'} disabled={submission === 'submitting'} /></label>
          <label className="check"><input name="consent" type="checkbox" required disabled={submission === 'submitting'} /> I agree to my details being stored and used to respond to this enquiry.</label>
          {message && <p className={`form-message${submission === 'success' ? ' success' : ' error'}`} role={submission === 'error' ? 'alert' : 'status'}>{message}</p>}
          <button className="button primary contact-submit" disabled={submission === 'submitting'}>{submission === 'submitting' ? 'Sending…' : kind === 'quote' ? 'Send quote request' : 'Send enquiry'} <ArrowUpRight aria-hidden="true" /></button>
        </div>
      </form>
    </section>

    <section id="contact-direct-panel" className={`contact-direct-layout contact-view-panel living-contact-panel${view === 'direct' ? ' active' : ''}`} role="tabpanel" aria-labelledby="contact-direct-tab" hidden={view !== 'direct'} data-editor-target={previewMode ? 'contact-direct' : undefined}>
      <div className="contact-direct-copy"><p className="eyebrow">{contactCopy.direct.eyebrow}</p><h2>{contactCopy.direct.title}</h2><p>{contactCopy.direct.body}</p><a className="contact-email-card" href={`mailto:${settings.contactEmail}`}><span className="contact-email-icon"><Mail aria-hidden="true" /></span><span><small>Email address</small><strong>{settings.contactEmail}</strong></span><ArrowUpRight aria-hidden="true" /></a></div>
      <aside className="contact-direct-details"><p className="eyebrow">{contactCopy.direct.detailsEyebrow}</p><dl><div><dt>Project</dt><dd>{settings.businessName}</dd></div><div><dt>Email</dt><dd><a href={`mailto:${settings.contactEmail}`}>{settings.contactEmail}</a></dd></div><div><dt>{contactCopy.direct.repliesLabel}</dt><dd>{contactCopy.direct.repliesValue}</dd></div></dl><div className="contact-direct-tip"><CheckCircle2 aria-hidden="true" /><p><strong>{contactCopy.direct.tipTitle}</strong><span>{contactCopy.direct.tipBody}</span></p></div></aside>
    </section>
  </>
}
