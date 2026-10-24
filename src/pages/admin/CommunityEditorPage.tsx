import { BarChart3, Check, ChevronDown, ChevronUp, CopyPlus, Plus, Save, Trash2, UserRound, X } from 'lucide-react'
import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AdminPageHeader, AdminPanel, ConfirmDialog, EmptyState, ErrorState, Field, LoadingState, StatusBadge } from '../../admin/components'
import { useAdminData } from '../../admin/AdminContext'
import { PageMeta } from '../../components/PageMeta'
import { friendlyAuthError } from '../../context/AuthContext'
import { deleteCommunitySurvey, getAdminCommunitySurvey, listCommunityResponses, saveCommunitySurvey } from '../../lib/community'
import type { CommunityAnswer, CommunityQuestion, CommunityResponse, CommunitySurvey, CommunitySurveyStatus } from '../../types'
import { useUnsavedChanges } from '../../admin/utils'

const blankSurvey: CommunitySurvey = { id: '', title: '', description: '', status: 'draft', questions: [], responseCount: 0 }
const questionId = () => `q_${typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID().replaceAll('-', '') : Date.now().toString(36)}`
const newQuestion = (): CommunityQuestion => ({ id: questionId(), prompt: '', type: 'single_choice', required: true, options: ['Option 1', 'Option 2'] })

function answerText(answer: CommunityAnswer | undefined) {
  if (!answer) return 'No answer'
  return Array.isArray(answer.value) ? answer.value.join(', ') || 'No answer' : answer.value || 'No answer'
}

export function CommunityEditorPage({ isNew = false }: { isNew?: boolean }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const { runAction, busy } = useAdminData()
  const [survey, setSurvey] = useState<CommunitySurvey>({ ...blankSurvey, questions: [newQuestion()] })
  const [baseline, setBaseline] = useState('')
  const [responses, setResponses] = useState<CommunityResponse[]>([])
  const [loading, setLoading] = useState(!isNew)
  const [error, setError] = useState('')
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [resultOpen, setResultOpen] = useState<string | null>(null)
  const dirty = Boolean(baseline) && JSON.stringify(survey) !== baseline
  useUnsavedChanges(dirty, 'Leave the survey editor and discard your unsaved changes?')

  useEffect(() => {
    if (isNew) { const initial = { ...blankSurvey, questions: [newQuestion()] }; setSurvey(initial); setBaseline(JSON.stringify(initial)); return }
    if (!id) return
    setLoading(true)
    void Promise.all([getAdminCommunitySurvey(id), listCommunityResponses(id)]).then(([found, items]) => {
      if (!found) { setError('Survey not found.'); return }
      setSurvey(found); setBaseline(JSON.stringify(found)); setResponses(items)
    }).catch((loadError) => setError(friendlyAuthError(loadError))).finally(() => setLoading(false))
  }, [id, isNew])

  const aggregates = useMemo(() => survey.questions.map((question) => {
    if (question.type === 'short_text') return { question, counts: [] as Array<[string, number]> }
    const counts = new Map(question.options.map((option) => [option, 0]))
    responses.forEach((response) => {
      const value = response.answers.find((answer) => answer.questionId === question.id)?.value
      const values = Array.isArray(value) ? value : typeof value === 'string' ? [value] : []
      values.forEach((entry) => counts.set(entry, (counts.get(entry) ?? 0) + 1))
    })
    return { question, counts: [...counts.entries()] }
  }), [responses, survey.questions])

  if (loading) return <LoadingState label="Loading survey…" />
  if (error && !isNew) return <ErrorState message={error} />
  const updateQuestion = (index: number, patch: Partial<CommunityQuestion>) => setSurvey((current) => ({ ...current, questions: current.questions.map((question, questionIndex) => questionIndex === index ? { ...question, ...patch } : question) }))
  const moveQuestion = (index: number, direction: -1 | 1) => setSurvey((current) => {
    const questions = [...current.questions]; const target = index + direction
    if (target < 0 || target >= questions.length) return current
    ;[questions[index], questions[target]] = [questions[target], questions[index]]
    return { ...current, questions }
  })
  const save = async (event: FormEvent) => {
    event.preventDefault(); setError('')
    const input = { ...(survey.id ? { id: survey.id } : {}), title: survey.title, description: survey.description, status: survey.status, questions: survey.questions }
    const success = await runAction('save-community-survey', async () => {
      const savedId = await saveCommunitySurvey(input)
      setSurvey((current) => ({ ...current, id: savedId })); navigate(`/admin/community/${encodeURIComponent(savedId)}`, { replace: isNew })
    }, isNew ? 'Survey created.' : 'Survey changes saved.')
    if (success) setBaseline(JSON.stringify({ ...survey, id: survey.id || input.id || survey.id }))
  }
  const remove = async () => {
    if (!survey.id) return
    const success = await runAction('delete-community-survey', () => deleteCommunitySurvey(survey.id), 'Survey and its responses were deleted.')
    if (success) navigate('/admin/community', { replace: true })
  }
  const statusCopy: Record<CommunitySurveyStatus, string> = { draft: 'Only administrators can view this survey.', published: 'Visible and accepting responses in customer accounts.', closed: 'Visible as closed; existing responses remain available.' }
  return <>
    <PageMeta title={`${isNew ? 'Create survey' : survey.title} — Admin`} description="Create and review a community survey." />
    <AdminPageHeader title={isNew ? 'Create survey' : survey.title} description="Build the questions, control availability, and review individual and aggregated responses." breadcrumbs={[{ label: 'Community', to: '/admin/community' }, { label: isNew ? 'Create survey' : survey.title }]} actions={<div className="admin-page-actions"><Link className="button secondary" to="/admin/community">Back</Link><button className="button primary" type="submit" form="community-editor" disabled={!dirty || busy === 'save-community-survey'}><Save />{busy === 'save-community-survey' ? 'Saving…' : 'Save survey'}</button></div>} />
    {error && <p className="form-status error" role="alert">{error}</p>}
    <form id="community-editor" className="admin-editor-layout community-editor" onSubmit={save}>
      <div className="admin-editor-main">
        <AdminPanel title="Survey details" description="Introduce the topic clearly before asking for a response."><div className="admin-form-grid"><Field label="Title" wide><input required minLength={2} maxLength={140} value={survey.title} onChange={(event) => setSurvey((current) => ({ ...current, title: event.target.value }))} /></Field><Field label="Introduction" hint="Optional context shown before the questions." wide><textarea rows={4} maxLength={2000} value={survey.description} onChange={(event) => setSurvey((current) => ({ ...current, description: event.target.value }))} /></Field></div></AdminPanel>
        <AdminPanel title="Questions" description="Use a mix of choice and written-response questions." action={<button className="button secondary" type="button" onClick={() => setSurvey((current) => ({ ...current, questions: [...current.questions, newQuestion()] }))}><Plus /> Add question</button>}>
          <div className="community-question-builder">{survey.questions.map((question, index) => <section key={question.id} className="community-builder-card"><header><span>{String(index + 1).padStart(2, '0')}</span><strong>Question {index + 1}</strong><div><button type="button" aria-label={`Move question ${index + 1} up`} disabled={index === 0} onClick={() => moveQuestion(index, -1)}><ChevronUp /></button><button type="button" aria-label={`Move question ${index + 1} down`} disabled={index === survey.questions.length - 1} onClick={() => moveQuestion(index, 1)}><ChevronDown /></button><button type="button" aria-label={`Duplicate question ${index + 1}`} onClick={() => setSurvey((current) => ({ ...current, questions: current.questions.flatMap((item, itemIndex) => itemIndex === index ? [item, { ...item, id: questionId() }] : [item]) }))}><CopyPlus /></button><button type="button" aria-label={`Delete question ${index + 1}`} disabled={survey.questions.length === 1} onClick={() => setSurvey((current) => ({ ...current, questions: current.questions.filter((_, itemIndex) => itemIndex !== index) }))}><Trash2 /></button></div></header><div className="admin-form-grid"><Field label="Question" wide><input required minLength={2} maxLength={500} value={question.prompt} onChange={(event) => updateQuestion(index, { prompt: event.target.value })} /></Field><Field label="Answer type"><select value={question.type} onChange={(event) => { const type = event.target.value as CommunityQuestion['type']; updateQuestion(index, { type, options: type === 'short_text' ? [] : question.options.length >= 2 ? question.options : ['Option 1', 'Option 2'] }) }}><option value="single_choice">Choose one</option><option value="multiple_choice">Choose several</option><option value="short_text">Written answer</option></select></Field><label className="admin-check"><input type="checkbox" checked={question.required} onChange={(event) => updateQuestion(index, { required: event.target.checked })} /><span><strong>Required</strong><small>A response must be provided.</small></span></label></div>
            {question.type !== 'short_text' && <div className="community-option-builder"><strong>Answer choices</strong>{question.options.map((option, optionIndex) => <div key={`${question.id}-${optionIndex}`}><input aria-label={`Question ${index + 1} option ${optionIndex + 1}`} required minLength={1} maxLength={160} value={option} onChange={(event) => updateQuestion(index, { options: question.options.map((item, itemIndex) => itemIndex === optionIndex ? event.target.value : item) })} /><button type="button" aria-label={`Remove option ${optionIndex + 1}`} disabled={question.options.length <= 2} onClick={() => updateQuestion(index, { options: question.options.filter((_, itemIndex) => itemIndex !== optionIndex) })}><X /></button></div>)}<button className="text-button" type="button" disabled={question.options.length >= 12} onClick={() => updateQuestion(index, { options: [...question.options, `Option ${question.options.length + 1}`] })}><Plus /> Add choice</button></div>}
          </section>)}</div>
        </AdminPanel>
      </div>
      <aside className="admin-editor-aside"><AdminPanel title="Availability"><div className="admin-form-stack"><Field label="Status"><select value={survey.status} onChange={(event) => setSurvey((current) => ({ ...current, status: event.target.value as CommunitySurveyStatus }))}><option value="draft">Draft</option><option value="published">Open for responses</option><option value="closed">Closed</option></select></Field><div className="admin-publish-summary"><StatusBadge tone={survey.status === 'published' ? 'positive' : survey.status === 'closed' ? 'warning' : 'neutral'}>{survey.status === 'published' ? 'Open' : survey.status}</StatusBadge><p>{statusCopy[survey.status]}</p></div></div></AdminPanel><AdminPanel title="Responses"><div className="community-response-summary"><BarChart3 aria-hidden="true" /><strong>{responses.length}</strong><span>{responses.length === 1 ? 'community response' : 'community responses'}</span></div></AdminPanel>{!isNew && <AdminPanel title="Danger zone" description="Deletion also permanently removes every response."><button className="button danger-button grow" type="button" onClick={() => setDeleteOpen(true)}><Trash2 /> Delete survey</button></AdminPanel>}</aside>
    </form>
    {!isNew && <section className="community-results-section"><header><p className="eyebrow">Community insight</p><h2>Survey results</h2><p>Review the overall picture, then open an individual response for the full detail.</p></header>{responses.length ? <><div className="community-result-grid">{aggregates.map(({ question, counts }) => <AdminPanel key={question.id} title={question.prompt} description={question.type === 'short_text' ? `${responses.filter((response) => answerText(response.answers.find((answer) => answer.questionId === question.id)) !== 'No answer').length} written responses` : 'Response distribution'}>{question.type === 'short_text' ? <div className="community-written-preview">{responses.slice(0, 3).map((response) => <blockquote key={response.id}>{answerText(response.answers.find((answer) => answer.questionId === question.id))}</blockquote>)}</div> : <div className="community-bars">{counts.map(([option, count]) => <div key={option}><span><strong>{option}</strong><em>{count}</em></span><div><i style={{ width: `${responses.length ? (count / responses.length) * 100 : 0}%` }} /></div></div>)}</div>}</AdminPanel>)}</div><AdminPanel title="Individual responses" description="Responses include the account identity captured securely when they were submitted."><div className="community-response-list">{responses.map((response) => <article key={response.id}><button type="button" aria-expanded={resultOpen === response.id} onClick={() => setResultOpen((current) => current === response.id ? null : response.id)}><UserRound aria-hidden="true" /><span><strong>{response.respondentName}</strong><small>{response.respondentEmail || 'Email unavailable'}</small></span><Check aria-hidden="true" /></button>{resultOpen === response.id && <dl>{survey.questions.map((question) => <div key={question.id}><dt>{question.prompt}</dt><dd>{answerText(response.answers.find((answer) => answer.questionId === question.id))}</dd></div>)}</dl>}</article>)}</div></AdminPanel></> : <EmptyState title="No responses yet" description={survey.status === 'draft' ? 'Publish this survey when it is ready for the community.' : 'Responses will appear here as community members submit them.'} />}</section>}
    <ConfirmDialog open={deleteOpen} title="Delete this survey?" description={`This permanently deletes “${survey.title}” and all ${responses.length} response${responses.length === 1 ? '' : 's'}. This cannot be undone.`} confirmLabel="Delete survey and responses" busy={busy === 'delete-community-survey'} onCancel={() => setDeleteOpen(false)} onConfirm={() => void remove()} />
  </>
}
