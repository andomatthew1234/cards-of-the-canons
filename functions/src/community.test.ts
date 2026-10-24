import { HttpsError } from 'firebase-functions/v2/https'
import { describe, expect, it } from 'vitest'
import { saveCommunitySurveySchema, submitCommunityResponseSchema, validateCommunityAnswers } from './community'

const questions = [
  { id: 'single', prompt: 'Choose one', type: 'single_choice' as const, required: true, options: ['Gold', 'Brown'] },
  { id: 'many', prompt: 'Choose several', type: 'multiple_choice' as const, required: false, options: ['Cards', 'History'] },
  { id: 'words', prompt: 'Tell us more', type: 'short_text' as const, required: false, options: [] },
]

describe('community survey validation', () => {
  it('accepts a bounded survey and rejects malformed choice questions', () => {
    expect(saveCommunitySurveySchema.safeParse({ title:'Collection themes',description:'Have your say.',status:'published',questions }).success).toBe(true)
    expect(saveCommunitySurveySchema.safeParse({ title:'Bad choices',description:'',status:'draft',questions:[{ ...questions[0], options:['Same','Same'] }] }).success).toBe(false)
    expect(saveCommunitySurveySchema.safeParse({ title:'No questions',description:'',status:'draft',questions:[] }).success).toBe(false)
  })

  it('accepts canonical answers and rejects invented choices', () => {
    expect(() => validateCommunityAnswers(questions, [
      { questionId:'single',value:'Gold' },
      { questionId:'many',value:['Cards','History'] },
      { questionId:'words',value:'A thoughtful answer.' },
    ])).not.toThrow()
    expect(() => validateCommunityAnswers(questions, [{ questionId:'single',value:'Invented' }])).toThrow(HttpsError)
  })

  it('rejects missing required, duplicate and unknown answers', () => {
    expect(() => validateCommunityAnswers(questions, [])).toThrow('Please answer every required question.')
    expect(() => validateCommunityAnswers(questions, [{ questionId:'single',value:'Gold' },{ questionId:'single',value:'Brown' }])).toThrow('unknown or repeated')
    expect(() => validateCommunityAnswers(questions, [{ questionId:'single',value:'Gold' },{ questionId:'unknown',value:'anything' }])).toThrow('unknown or repeated')
  })

  it('rejects polluted response payloads before database access', () => {
    expect(submitCommunityResponseSchema.safeParse({ surveyId:'survey_1',answers:[{ questionId:'single',value:'Gold' }],userId:'somebody-else' }).success).toBe(false)
  })
})
