import { describe, expect, it } from 'vitest'
import { requiresRecentAuthentication } from './recentAuthentication'

describe('recent authentication error detection', () => {
  it('recognises the structured callable reason used by protected admin email actions', () => {
    expect(requiresRecentAuthentication({
      code: 'functions/failed-precondition',
      message: 'Recent sign-in is required.',
      details: { reason: 'recent-auth-required' },
    })).toBe(true)
  })

  it('does not turn unrelated backend failures into credential prompts', () => {
    expect(requiresRecentAuthentication({ code: 'functions/unavailable', message: 'Email provider unavailable.' })).toBe(false)
    expect(requiresRecentAuthentication({ code: 'functions/failed-precondition', message: 'Choose a recipient.' })).toBe(false)
  })
})
