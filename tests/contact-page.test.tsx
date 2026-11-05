import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AuthProvider } from '../src/context/AuthContext'
import { Contact } from '../src/pages/Contact'

describe('contact page experience', () => {
  it('presents one clear enquiry form without competing contact tabs', () => {
    render(<MemoryRouter><AuthProvider><Contact /></AuthProvider></MemoryRouter>)

    expect(screen.queryByRole('tab')).not.toBeInTheDocument()
    expect(screen.getByText('Sign in for a faster enquiry')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Full name' })).toBeRequired()
    expect(screen.getByRole('textbox', { name: 'Email address' })).toBeRequired()
    expect(screen.getByRole('textbox', { name: /How can we help/i })).toBeRequired()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Send enquiry/i })).toBeEnabled()
  })
})
