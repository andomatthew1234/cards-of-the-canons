import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { Contact } from '../src/pages/Contact'

const { authState, getUserProfile, saveEnquiry, trackEvent } = vi.hoisted(() => ({
  authState: {
    user: null as null | {
      uid: string
      displayName: string | null
      email: string | null
      emailVerified: boolean
      providerData: Array<{ providerId: string }>
    },
  },
  getUserProfile: vi.fn(),
  saveEnquiry: vi.fn(),
  trackEvent: vi.fn(),
}))

vi.mock('../src/context/AuthContext', () => ({ useAuth: () => authState }))
vi.mock('../src/lib/accounts', () => ({ getUserProfile }))
vi.mock('../src/lib/data', () => ({ saveEnquiry }))
vi.mock('../src/lib/analytics', () => ({ trackEvent }))

function renderContact() {
  return render(<MemoryRouter><Contact /></MemoryRouter>)
}

describe('contact enquiry form', () => {
  beforeEach(() => {
    authState.user = null
    getUserProfile.mockReset()
    getUserProfile.mockResolvedValue({ preferences: { checkoutAndEnquiryAutofill: true } })
    saveEnquiry.mockReset()
    trackEvent.mockReset()
  })

  it('uses complete signed-in account details without displaying identity fields', async () => {
    authState.user = {
      uid: 'account-user',
      displayName: 'Ada Account',
      email: 'ADA@EXAMPLE.COM',
      emailVerified: true,
      providerData: [{ providerId: 'password' }],
    }
    saveEnquiry.mockResolvedValue({ demo: false })
    const user = userEvent.setup()
    renderContact()

    expect(await screen.findByText('Your account details will be included automatically when you submit this form.')).toBeInTheDocument()
    expect(screen.queryByLabelText('Full name')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Email address')).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Organisation/)).not.toBeInTheDocument()

    await user.type(screen.getByLabelText(/How can we help/i), 'Please tell me when the first collection is available.')
    await user.click(screen.getByLabelText(/I agree to my details/))
    await user.click(screen.getByRole('button', { name: 'Send enquiry' }))

    await waitFor(() => expect(saveEnquiry).toHaveBeenCalledWith({
      kind: 'general',
      name: 'Ada Account',
      email: 'ada@example.com',
      message: 'Please tell me when the first collection is available.',
      consent: true,
    }))
  })

  it('lets a signed-in customer replace their account details', async () => {
    authState.user = {
      uid: 'account-user',
      displayName: 'Ada Account',
      email: 'ada@example.com',
      emailVerified: true,
      providerData: [{ providerId: 'password' }],
    }
    const user = userEvent.setup()
    renderContact()

    await user.click(await screen.findByRole('button', { name: 'Enter different details' }))

    expect(screen.getByLabelText('Full name')).toHaveValue('Ada Account')
    expect(screen.getByLabelText('Email address')).toHaveValue('ada@example.com')
    expect(screen.getByLabelText(/Organisation/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Use my account details instead' })).toBeInTheDocument()
  })

  it('records a consented general enquiry and confirms storage without claiming an email was sent', async () => {
    saveEnquiry.mockResolvedValue({ demo: false })
    const user = userEvent.setup()
    renderContact()

    await user.type(screen.getByLabelText('Full name'), 'Ada Example')
    await user.type(screen.getByLabelText('Email address'), 'ADA@EXAMPLE.COM')
    await user.type(screen.getByLabelText(/How can we help/i), 'Please tell me when the first collection is available.')
    await user.click(screen.getByLabelText(/I agree to my details/))
    await user.click(screen.getByRole('button', { name: 'Send enquiry' }))

    await waitFor(() => expect(saveEnquiry).toHaveBeenCalledWith({
      kind: 'general',
      name: 'Ada Example',
      email: 'ada@example.com',
      message: 'Please tell me when the first collection is available.',
      consent: true,
    }))
    expect(trackEvent).toHaveBeenCalledWith('generate_lead')
    expect(screen.getByRole('status')).toHaveTextContent('has been recorded')
    expect(screen.getByRole('status')).not.toHaveTextContent(/email was sent/i)
  })

  it('shows a useful error when the submission cannot be stored', async () => {
    saveEnquiry.mockRejectedValue({ code: 'functions/resource-exhausted' })
    const user = userEvent.setup()
    renderContact()

    await user.type(screen.getByLabelText('Full name'), 'Ada Example')
    await user.type(screen.getByLabelText('Email address'), 'ada@example.com')
    await user.type(screen.getByLabelText(/How can we help/i), 'This message is long enough to submit.')
    await user.click(screen.getByLabelText(/I agree to my details/))
    await user.click(screen.getByRole('button', { name: 'Send enquiry' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Too many enquiries')
  })

  it('does not claim an enquiry was recorded in disconnected demo mode', async () => {
    saveEnquiry.mockResolvedValue({ demo: true })
    const user = userEvent.setup()
    renderContact()

    await user.type(screen.getByLabelText('Full name'), 'Ada Example')
    await user.type(screen.getByLabelText('Email address'), 'ada@example.com')
    await user.type(screen.getByLabelText(/How can we help/i), 'This message is long enough to submit.')
    await user.click(screen.getByLabelText(/I agree to my details/))
    await user.click(screen.getByRole('button', { name: 'Send enquiry' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('not available in this local environment')
    expect(trackEvent).not.toHaveBeenCalled()
  })
})
