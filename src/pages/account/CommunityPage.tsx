import { CheckCircle2, ChevronDown, CircleHelp, MessagesSquare, Send } from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { AccountCentreShell } from '../../components/account/AccountChrome'
import { useAuth } from '../../context/AuthContext'
import { friendlyAuthError } from '../../context/AuthContext'
import { getMyCommunityResponse, listCommunitySurveys, submitCommunityAnswers } from '../../lib/community'
import type { CommunityAnswer, CommunityResponse, CommunitySurvey } from '../../types'

type AnswerState = Record<string, string | string[]>

function responseToState(response: CommunityResponse | null): AnswerState {
  return Object.fromEntries((response?.answers ?? []).map((answer) => [answer.questionId, answer.value]))
}

function SurveyCard({ survey, initialResponse }: { survey: CommunitySurvey; initialResponse: CommunityResponse | null }) {
  const [open, setOpen] = useState(survey.status === 'published' && !initialResponse)
  const [answers, setAnswers] = useState<AnswerState>(() => responseToState(initialResponse))
  const [response, setResponse] = useState(initialResponse)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const closed = survey.status === 'closed'

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true); setError(''); setSaved(false)
    try {
      const payload: CommunityAnswer[] = survey.questions.map((question) => ({ questionId: question.id, value: answers[question.id] ?? (question.type === 'multiple_choice' ? [] : '') }))
      await submitCommunityAnswers(survey.id, payload)
      const next = { id: 'current', surveyId: survey.id, userId: '', respondentName: '', respondentEmail: '', answers: payload }
      setResponse(next); setSaved(true)
    } catch (submissionError) {
      setError(friendlyAuthError(submissionError))
    } finally { setBusy(false) }
  }

  return <article className={`community-survey-card ${open ? 'open' : ''}`}>
    <button className="community-survey-summary" type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
      <span className="community-survey-icon" aria-hidden="true">{response ? <CheckCircle2 /> : <CircleHelp />}</span>
      <span><small>{closed ? 'Closed survey' : response ? 'Response submitted' : 'Open survey'}</small><strong>{survey.title}</strong><em>{survey.description || `${survey.questions.length} question${survey.questions.length === 1 ? '' : 's'}`}</em></span>
      <ChevronDown aria-hidden="true" />
    </button>
    {open && <div className="community-survey-body">
      {closed && <div className="community-closed-note"><CheckCircle2 aria-hidden="true" /><span><strong>This survey is closed.</strong>{response ? ' Your response is shown below.' : ' It is no longer accepting responses.'}</span></div>}
      <form onSubmit={submit}>
        {survey.questions.map((question, index) => <fieldset key={question.id} className="community-question" disabled={closed}>
          <legend><span>{String(index + 1).padStart(2, '0')}</span>{question.prompt}{question.required && <small>Required</small>}</legend>
          {question.type === 'short_text' ? <textarea aria-label={question.prompt} rows={4} required={question.required} maxLength={2000} value={typeof answers[question.id] === 'string' ? answers[question.id] as string : ''} onChange={(event) => setAnswers((current) => ({ ...current, [question.id]: event.target.value }))} /> : <div className="community-options">{question.options.map((option) => {
            const current = answers[question.id]
            const checked = question.type === 'multiple_choice' ? Array.isArray(current) && current.includes(option) : current === option
            return <label key={option}><input type={question.type === 'multiple_choice' ? 'checkbox' : 'radio'} name={question.id} value={option} checked={checked} required={question.required && question.type === 'single_choice'} onChange={(event) => setAnswers((existing) => {
              if (question.type === 'single_choice') return { ...existing, [question.id]: option }
              const selected = Array.isArray(existing[question.id]) ? existing[question.id] as string[] : []
              return { ...existing, [question.id]: event.target.checked ? [...selected, option] : selected.filter((item) => item !== option) }
            })} /><span>{option}</span></label>
          })}</div>}
        </fieldset>)}
        {error && <p className="form-status error" role="alert">{error}</p>}
        {saved && <p className="community-saved" role="status"><CheckCircle2 aria-hidden="true" /> Your response has been saved.</p>}
        {!closed && <div className="community-submit-row"><p>{response ? 'You can update your response while this survey remains open.' : 'Your answers are visible only to you and the Doxa administrators.'}</p><button className="button primary" type="submit" disabled={busy}><Send aria-hidden="true" />{busy ? 'Saving…' : response ? 'Update response' : 'Submit response'}</button></div>}
      </form>
    </div>}
  </article>
}

export function CommunityPage() {
  const { user } = useAuth()
  const [surveys, setSurveys] = useState<CommunitySurvey[]>([])
  const [responses, setResponses] = useState<Record<string, CommunityResponse | null>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!user) return
    let active = true
    void listCommunitySurveys().then(async (items) => {
      const pairs = await Promise.all(items.map(async (survey) => [survey.id, await getMyCommunityResponse(survey.id, user.uid)] as const))
      if (active) { setSurveys(items); setResponses(Object.fromEntries(pairs)) }
    }).catch((loadError) => { if (active) setError(friendlyAuthError(loadError)) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [user])
  const openCount = useMemo(() => surveys.filter((survey) => survey.status === 'published').length, [surveys])
  return <AccountCentreShell title="Community" eyebrow="Have your say" description="Share your thoughts through community polls and surveys from Doxa.">
    <section className="community-account-intro"><MessagesSquare aria-hidden="true" /><div><h2>{openCount ? `${openCount} open ${openCount === 1 ? 'survey' : 'surveys'}` : 'Community responses'}</h2><p>Your feedback helps shape future collections and the experience around them.</p></div></section>
    {loading ? <div className="community-state" role="status">Loading community surveys…</div> : error ? <div className="community-state error" role="alert">{error}</div> : surveys.length ? <div className="community-survey-list">{surveys.map((survey) => <SurveyCard key={survey.id} survey={survey} initialResponse={responses[survey.id] ?? null} />)}</div> : <div className="community-empty"><MessagesSquare aria-hidden="true" /><h2>No community surveys are open</h2><p>New opportunities to have your say will appear here.</p></div>}
  </AccountCentreShell>
}
