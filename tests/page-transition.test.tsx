import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useEffect, useState } from 'react'
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom'
import { PageTransition } from '../src/components/PageTransition'

function TransitionHarness() {
  return <PageTransition>
    <Link to="/second">Next page</Link>
    <Routes>
      <Route path="/first" element={<h1>First page</h1>} />
      <Route path="/second" element={<h1>Second page</h1>} />
    </Routes>
  </PageTransition>
}

function AccountTransitionHarness() {
  return <PageTransition><Link to="/account/security">Security</Link><Routes><Route path="/account" element={<div className="account-centre-main">Overview</div>} /><Route path="/account/security" element={<div className="account-centre-main">Security page</div>} /></Routes></PageTransition>
}

function DelayedHeading() {
  const [ready, setReady] = useState(false)
  useEffect(() => setReady(true), [])
  return ready ? <h1>Lazy page</h1> : <p>Loading page</p>
}

function LazyTransitionHarness() {
  return <PageTransition>
    <Link to="/lazy">Open lazy page</Link>
    <Routes>
      <Route path="/first" element={<h1>First page</h1>} />
      <Route path="/lazy" element={<DelayedHeading />} />
    </Routes>
  </PageTransition>
}

describe('page transitions', () => {
  it('keys the transition surface to the active pathname', async () => {
    const { container } = render(<MemoryRouter initialEntries={['/first']}><TransitionHarness /></MemoryRouter>)
    const initialPage = container.querySelector('.page-transition')
    expect(initialPage).toHaveAttribute('data-route', '/first')
    expect(initialPage).not.toHaveClass('page-transition-slide-forward')
    expect(initialPage).not.toHaveClass('page-transition-slide-back')

    await userEvent.click(screen.getByRole('link', { name: 'Next page' }))

    expect(screen.getByRole('heading', { name: 'Second page' })).toHaveFocus()
    expect(screen.getByRole('status')).toHaveTextContent('Second page opened')
    expect(container.querySelector('.page-transition')).toHaveAttribute('data-route', '/second')
    expect(container.querySelector('.page-transition')).toHaveClass('page-transition-slide-forward')
  })

  it('keeps account navigation stationary while sliding only the destination content', async () => {
    const { container } = render(<MemoryRouter initialEntries={['/account']}><AccountTransitionHarness /></MemoryRouter>)
    await userEvent.click(screen.getByRole('link', { name: 'Security' }))
    expect(screen.getByText('Security page')).toBeInTheDocument()
    expect(container.querySelector('.page-transition')).not.toHaveClass('page-transition-slide-forward')
    expect(container.querySelector('.page-transition-frame')).toHaveClass('account-destination-transition-forward')
  })

  it('moves focus to a heading that appears after the route commits', async () => {
    render(<MemoryRouter initialEntries={['/first']}><LazyTransitionHarness /></MemoryRouter>)
    await userEvent.click(screen.getByRole('link', { name: 'Open lazy page' }))
    expect(await screen.findByRole('heading', { name: 'Lazy page' })).toHaveFocus()
    expect(screen.getByRole('status')).toHaveTextContent('Lazy page opened')
  })
})
