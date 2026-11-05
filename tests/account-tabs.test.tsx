import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, vi } from 'vitest'
import { AuthProvider } from '../src/context/AuthContext'
import { Account } from '../src/pages/Account'

describe('account mode tabs', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('moves one shared indicator between sign in and registration', async () => {
    render(<MemoryRouter><AuthProvider><Account /></AuthProvider></MemoryRouter>)
    const signIn = screen.getByRole('tab', { name: 'Sign in' })
    const register = screen.getByRole('tab', { name: 'Register' })
    expect(signIn.parentElement).toHaveClass('signin-selected')
    await userEvent.click(register)
    expect(register.parentElement).toHaveClass('register-selected')
    expect(register).toHaveAttribute('aria-selected', 'true')
    const terms = screen.getByRole('checkbox', { name: /I accept the Terms and Conditions/i })
    const news = screen.getByRole('checkbox', { name: /Receive news and updates/i })
    expect(terms).not.toBeChecked()
    expect(news).toBeChecked()
    expect(screen.getByRole('button', { name: 'Create account' })).toBeDisabled()
    expect(screen.getByRole('link', { name: 'Terms and Conditions' })).toHaveAttribute('href', '/policies/terms')
    await userEvent.click(signIn)
    expect(signIn.parentElement).toHaveClass('signin-selected')
  })

  it('opens registration directly from the homepage account action', () => {
    render(<MemoryRouter initialEntries={['/account?mode=register']}><AuthProvider><Account /></AuthProvider></MemoryRouter>)

    expect(screen.getByRole('tab', { name: 'Register' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('heading', { name: 'Create your account' })).toBeInTheDocument()
  })

  it('keeps the branded setup screen visible for five seconds, then opens onboarding', async () => {
    vi.useFakeTimers()
    const timeout = vi.spyOn(window, 'setTimeout')
    render(<MemoryRouter initialEntries={['/account']}><AuthProvider><Routes><Route path="/account" element={<Account />} /><Route path="/account/onboarding" element={<p>Onboarding route</p>} /></Routes></AuthProvider></MemoryRouter>)
    fireEvent.click(screen.getByRole('tab', { name: 'Register' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Full name' }), { target: { value: 'Matthew Anderson' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Email address' }), { target: { value: 'matthew@example.com' } })
    fireEvent.change(document.querySelector<HTMLInputElement>('input[name="password"]')!, { target: { value: 'secure-password' } })
    fireEvent.click(screen.getByRole('checkbox', { name: /I accept the Terms and Conditions/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }))

    expect(screen.getByRole('heading', { name: /Setting up your account with us/i })).toBeInTheDocument()
    expect(timeout).toHaveBeenCalledWith(expect.any(Function), 5000)
    expect(screen.queryByText('Onboarding route')).not.toBeInTheDocument()

    await act(() => vi.advanceTimersByTimeAsync(4999))
    expect(screen.getByRole('heading', { name: /Setting up your account with us/i })).toBeInTheDocument()
    expect(screen.queryByText('Onboarding route')).not.toBeInTheDocument()

    await act(() => vi.advanceTimersByTimeAsync(1))
    expect(screen.getByText('Onboarding route')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /Setting up your account with us/i })).not.toBeInTheDocument()
  })
})
