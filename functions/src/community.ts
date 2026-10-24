import { FieldValue } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { z } from 'zod'
import { authorizeRequest, requireAdminContext, type CallableRequestLike } from './authorization'
import { db } from './firebase'
import { checkRateLimit } from './rateLimit'

const callableOptions = { region: 'australia-southeast1', enforceAppCheck: process.env.FUNCTIONS_EMULATOR !== 'true' }
const questionId = z.string().trim().min(1).max(80).regex(/^[A-Za-z0-9_-]+$/)
const option = z.string().trim().min(1).max(160)

export const communityQuestionSchema = z.object({
  id: questionId,
  prompt: z.string().trim().min(2).max(500),
  type: z.enum(['single_choice', 'multiple_choice', 'short_text']),
  required: z.boolean(),
  options: z.array(option).max(12),
}).strict().superRefine((question, context) => {
  if (question.type === 'short_text' && question.options.length) {
    context.addIssue({ code: 'custom', path: ['options'], message: 'Short-answer questions cannot have choices.' })
  }
  if (question.type !== 'short_text' && question.options.length < 2) {
    context.addIssue({ code: 'custom', path: ['options'], message: 'Choice questions require at least two choices.' })
  }
  if (new Set(question.options.map((value) => value.toLocaleLowerCase())).size !== question.options.length) {
    context.addIssue({ code: 'custom', path: ['options'], message: 'Choices must be unique.' })
  }
})

export const saveCommunitySurveySchema = z.object({
  id: z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/).optional(),
  title: z.string().trim().min(2).max(140),
  description: z.string().trim().max(2000),
  status: z.enum(['draft', 'published', 'closed']),
  questions: z.array(communityQuestionSchema).min(1).max(24),
}).strict().superRefine((survey, context) => {
  const ids = survey.questions.map((question) => question.id)
  if (new Set(ids).size !== ids.length) context.addIssue({ code: 'custom', path: ['questions'], message: 'Question IDs must be unique.' })
})

const answerSchema = z.object({
  questionId,
  value: z.union([z.string().trim().max(2000), z.array(z.string().trim().min(1).max(160)).max(12)]),
}).strict()

export const submitCommunityResponseSchema = z.object({
  surveyId: z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/),
  answers: z.array(answerSchema).max(24),
}).strict()

export function validateCommunityAnswers(
  questions: z.infer<typeof communityQuestionSchema>[],
  answers: z.infer<typeof answerSchema>[],
) {
  const byQuestion = new Map(answers.map((answer) => [answer.questionId, answer.value]))
  if (byQuestion.size !== answers.length || answers.some((answer) => !questions.some((question) => question.id === answer.questionId))) {
    throw new HttpsError('invalid-argument', 'The response contains an unknown or repeated question.')
  }
  for (const question of questions) {
    const value = byQuestion.get(question.id)
    const empty = value === undefined || value === '' || (Array.isArray(value) && value.length === 0)
    if (question.required && empty) throw new HttpsError('invalid-argument', 'Please answer every required question.')
    if (empty) continue
    if (question.type === 'short_text') {
      if (typeof value !== 'string' || value.length > 2000) throw new HttpsError('invalid-argument', 'A written answer is not valid.')
    } else if (question.type === 'single_choice') {
      if (typeof value !== 'string' || !question.options.includes(value)) throw new HttpsError('invalid-argument', 'A selected answer is not valid.')
    } else {
      if (!Array.isArray(value) || new Set(value).size !== value.length || value.some((entry) => !question.options.includes(entry))) {
        throw new HttpsError('invalid-argument', 'One or more selected answers are not valid.')
      }
    }
  }
}

export const saveCommunitySurvey = onCall(callableOptions, async (request) => {
  const caller = await requireAdminContext(request as CallableRequestLike)
  const parsed = saveCommunitySurveySchema.safeParse(request.data)
  if (!parsed.success) throw new HttpsError('invalid-argument', parsed.error.issues[0]?.message || 'Please check the survey fields.')
  const { id, ...survey } = parsed.data
  const ref = id ? db.collection('communitySurveys').doc(id) : db.collection('communitySurveys').doc()
  await db.runTransaction(async (transaction) => {
    const existing = await transaction.get(ref)
    const current = existing.data()
    const now = FieldValue.serverTimestamp()
    transaction.set(ref, {
      ...survey,
      responseCount: typeof current?.responseCount === 'number' ? current.responseCount : 0,
      createdBy: typeof current?.createdBy === 'string' ? current.createdBy : caller.uid,
      createdAt: current?.createdAt ?? now,
      updatedBy: caller.uid,
      updatedAt: now,
      ...(survey.status === 'published' && !current?.publishedAt ? { publishedAt: now } : {}),
      ...(survey.status === 'closed' && current?.status !== 'closed' ? { closedAt: now } : {}),
    })
  })
  return { id: ref.id }
})

export const deleteCommunitySurvey = onCall(callableOptions, async (request) => {
  await requireAdminContext(request as CallableRequestLike)
  const parsed = z.object({ surveyId: z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/) }).strict().safeParse(request.data)
  if (!parsed.success) throw new HttpsError('invalid-argument', 'A valid survey is required.')
  const ref = db.collection('communitySurveys').doc(parsed.data.surveyId)
  if (!(await ref.get()).exists) throw new HttpsError('not-found', 'Survey not found.')
  await db.recursiveDelete(ref)
  return { deleted: true }
})

export const submitCommunityResponse = onCall(callableOptions, async (request) => {
  const caller = await authorizeRequest(request as CallableRequestLike)
  const parsed = submitCommunityResponseSchema.safeParse(request.data)
  if (!parsed.success) throw new HttpsError('invalid-argument', 'Please check your answers and try again.')
  await checkRateLimit(`community-response:${caller.uid}`, 40, 60)
  const surveyRef = db.collection('communitySurveys').doc(parsed.data.surveyId)
  const responseRef = surveyRef.collection('responses').doc(caller.uid)
  const authUser = await getAuth().getUser(caller.uid)
  await db.runTransaction(async (transaction) => {
    const [surveySnapshot, responseSnapshot] = await Promise.all([transaction.get(surveyRef), transaction.get(responseRef)])
    if (!surveySnapshot.exists) throw new HttpsError('not-found', 'This survey is no longer available.')
    const survey = surveySnapshot.data()
    if (survey?.status !== 'published') throw new HttpsError('failed-precondition', 'This survey is not accepting responses.')
    const questions = z.array(communityQuestionSchema).safeParse(survey.questions)
    if (!questions.success) throw new HttpsError('failed-precondition', 'This survey is not available right now.')
    validateCommunityAnswers(questions.data, parsed.data.answers)
    transaction.set(responseRef, {
      surveyId: surveyRef.id,
      userId: caller.uid,
      respondentName: authUser.displayName?.trim().slice(0, 120) || 'Community member',
      respondentEmail: (authUser.email || caller.email || '').trim().toLowerCase().slice(0, 160),
      answers: parsed.data.answers,
      createdAt: responseSnapshot.data()?.createdAt ?? FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })
    if (!responseSnapshot.exists) transaction.update(surveyRef, { responseCount: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() })
  })
  return { submitted: true }
})
