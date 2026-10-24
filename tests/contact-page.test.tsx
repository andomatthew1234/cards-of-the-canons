import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { AuthProvider } from '../src/context/AuthContext'
import { Contact } from '../src/pages/Contact'

describe('contact page experience', () => {
  it('switches between enquiry and direct contact views without losing the form controls', async () => {
    render(<MemoryRouter><AuthProvider><Contact /></AuthProvider></MemoryRouter>)

    const enquiryTab = screen.getByRole('tab', { name: 'Enquiries and quote requests' })
    const directTab = screen.getByRole('tab', { name: 'Contact us directly' })
    expect(enquiryTab).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('Sign in for a faster enquiry')).toBeInTheDocument()

    const quote = screen.getByRole('radio', { name: /Quote request/i })
    await userEvent.click(quote)
    expect(quote).toBeChecked()
    expect(screen.getByRole('group', { name: 'What can we help with?' })).toHaveAttribute('data-kind', 'quote')

    await userEvent.click(directTab)
    expect(directTab).toHaveAttribute('aria-selected', 'true')
    expect(document.getElementById('contact-enquiry-panel')).toHaveAttribute('hidden')
    expect(document.getElementById('contact-direct-panel')).not.toHaveAttribute('hidden')
    expect(screen.getAllByRole('link', { name: /info@doxatreasury.com/i })[0]).toHaveAttribute('href', 'mailto:info@doxatreasury.com')

    await userEvent.click(enquiryTab)
    expect(document.getElementById('contact-direct-panel')).toHaveAttribute('hidden')
    expect(quote).toBeChecked()
  })
})
