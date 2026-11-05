import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  saveNewsletter: vi.fn(),
  confirmNewsletterSubscription: vi.fn(),
  unsubscribeNewsletter: vi.fn(),
}))

vi.mock('../src/lib/data', () => mocks)

import { Newsletter } from '../src/components/Newsletter'
import { NewsletterConfirmPage, NewsletterUnsubscribePage } from '../src/pages/NewsletterConsent'

const VALID_TOKEN = 'A'.repeat(43)

function renderAt(path: string, element: ReactElement) {
  return render(<MemoryRouter initialEntries={[path]}>{element}</MemoryRouter>)
}

/** Fills the signup form the way a visitor would, including the consent tick. */
async function submitSignup(user: ReturnType<typeof userEvent.setup>, email: string) {
  await user.type(screen.getByLabelText(/email address/i), email)
  await user.click(screen.getByLabelText(/i agree to receive/i))
  await user.click(screen.getByRole('button', { name: /join the mailing list/i }))
}

beforeEach(() => {
  mocks.saveNewsletter.mockReset()
  mocks.confirmNewsletterSubscription.mockReset()
  mocks.unsubscribeNewsletter.mockReset()
})

describe('newsletter signup reporting', () => {
  it('uses the same privacy-preserving response for a new signup', async () => {
    const user = userEvent.setup()
    mocks.saveNewsletter.mockResolvedValue({ demo: false, status: 'pending', confirmationEmailSent: false, deliveryReason: 'no-transport-configured' })
    render(<Newsletter />)

    await submitSignup(user, 'jane@example.com')

    await waitFor(() => expect(mocks.saveNewsletter).toHaveBeenCalledWith('jane@example.com', 'home'))
    expect(await screen.findByText(/no further action is required/i)).toBeTruthy()
    expect(screen.queryByText(/confirmation link/i)).toBeNull()
  })

  it('does not reveal an existing confirmed subscription', async () => {
    const user = userEvent.setup()
    mocks.saveNewsletter.mockResolvedValue({ demo: false, status: 'subscribed' })
    render(<Newsletter />)

    await submitSignup(user, 'jane@example.com')

    expect(await screen.findByText(/no further action is required/i)).toBeTruthy()
    expect(screen.queryByText(/on the list/i)).toBeNull()
  })

  it('does not reveal that an address is suppressed', async () => {
    const user = userEvent.setup()
    mocks.saveNewsletter.mockResolvedValue({ demo: false, status: 'unsubscribed' })
    render(<Newsletter />)

    await submitSignup(user, 'jane@example.com')

    expect(await screen.findByText(/no further action is required/i)).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('newsletter consent pages', () => {
  it('redeems a confirmation token once and never renders the token', async () => {
    mocks.confirmNewsletterSubscription.mockResolvedValue({ confirmed: true, status: 'subscribed', unsubscribeUrl: `https://example.test/newsletter/unsubscribe?token=${'B'.repeat(43)}` })
    renderAt(`/newsletter/confirm?token=${VALID_TOKEN}`, <NewsletterConfirmPage />)

    expect(await screen.findByText('You’re on the list.')).toBeTruthy()
    await waitFor(() => expect(mocks.confirmNewsletterSubscription).toHaveBeenCalledTimes(1))
    expect(mocks.confirmNewsletterSubscription).toHaveBeenCalledWith(VALID_TOKEN)
    expect(screen.queryByText(new RegExp(VALID_TOKEN))).toBeNull()
    expect(document.body.textContent).not.toContain(VALID_TOKEN)
  })

  it('fails closed without a well-formed token and never calls the server', async () => {
    renderAt('/newsletter/confirm', <NewsletterConfirmPage />)

    expect(await screen.findByText('This link is no longer valid.')).toBeTruthy()
    expect(mocks.confirmNewsletterSubscription).not.toHaveBeenCalled()
  })

  it('rejects a malformed token client-side before any network call', async () => {
    renderAt('/newsletter/confirm?token=short!token', <NewsletterConfirmPage />)

    expect(await screen.findByText('This link is no longer valid.')).toBeTruthy()
    expect(mocks.confirmNewsletterSubscription).not.toHaveBeenCalled()
  })

  it('shows an invalid state when the server refuses the token, without echoing it', async () => {
    mocks.confirmNewsletterSubscription.mockRejectedValue(new Error('invalid-argument'))
    renderAt(`/newsletter/confirm?token=${VALID_TOKEN}`, <NewsletterConfirmPage />)

    expect(await screen.findByText('This link is no longer valid.')).toBeTruthy()
    expect(document.body.textContent).not.toContain(VALID_TOKEN)
  })

  it('shows the suppression state when the address is already unsubscribed', async () => {
    mocks.confirmNewsletterSubscription.mockResolvedValue({ confirmed: false, status: 'unsubscribed' })
    renderAt(`/newsletter/confirm?token=${VALID_TOKEN}`, <NewsletterConfirmPage />)

    expect(await screen.findByText('This address is unsubscribed.')).toBeTruthy()
  })

  it('unsubscribes through the server and confirms it', async () => {
    mocks.unsubscribeNewsletter.mockResolvedValue({ unsubscribed: true, status: 'unsubscribed' })
    renderAt(`/newsletter/unsubscribe?token=${VALID_TOKEN}`, <NewsletterUnsubscribePage />)

    expect(await screen.findByText('You’ve been unsubscribed.')).toBeTruthy()
    await waitFor(() => expect(mocks.unsubscribeNewsletter).toHaveBeenCalledTimes(1))
    expect(mocks.unsubscribeNewsletter).toHaveBeenCalledWith(VALID_TOKEN)
    expect(document.body.textContent).not.toContain(VALID_TOKEN)
  })

  it('refuses an unsubscribe link that the server does not recognise', async () => {
    mocks.unsubscribeNewsletter.mockRejectedValue(new Error('invalid-argument'))
    renderAt(`/newsletter/unsubscribe?token=${VALID_TOKEN}`, <NewsletterUnsubscribePage />)

    expect(await screen.findByText('This link is no longer valid.')).toBeTruthy()
    expect(document.body.textContent).not.toContain(VALID_TOKEN)
  })
})
