import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, Link, RouterProvider, useLocation, useNavigate } from 'react-router-dom'
import { afterEach, vi } from 'vitest'
import { UnsavedChangesProvider } from '../src/admin/UnsavedChanges'
import { useUnsavedChanges } from '../src/admin/utils'

function DirtyEditor() {
  useUnsavedChanges(true, 'Discard the unsaved draft?')
  return <><h1>Editor</h1><Link to="/destination">Destination</Link></>
}

function DirtyEditorWithControlledExit({ confirmFirst = false }: { confirmFirst?: boolean }) {
  const navigate = useNavigate()
  const allowNextNavigation = useUnsavedChanges(true, 'Router should not ask again')
  const leave = () => {
    if (confirmFirst && !window.confirm('Discard these changes?')) return
    allowNextNavigation()
    navigate('/destination')
  }
  return <><h1>Controlled editor</h1><button onClick={leave}>{confirmFirst ? 'Cancel editing' : 'Finish saving'}</button></>
}

function DirtyEditorWithSameLocationSave() {
  const navigate = useNavigate()
  const allowNextNavigation = useUnsavedChanges(true, 'Discard the still-unsaved edit?')
  return <><h1>Same location editor</h1><button onClick={() => { allowNextNavigation(); navigate('/editor') }}>Save here</button><Link to="/destination">Leave later</Link></>
}

function Destination() {
  return <h1>Destination</h1>
}

function LocationProbe() {
  return <output data-testid="location">{useLocation().pathname}</output>
}

function makeRouter() {
  return createMemoryRouter([
    { path: '/before', element: <><h1>Before</h1><LocationProbe /></> },
    { path: '/editor', element: <UnsavedChangesProvider><DirtyEditor /><LocationProbe /></UnsavedChangesProvider> },
    { path: '/destination', element: <><Destination /><LocationProbe /></> },
  ], { initialEntries: ['/before', '/editor'], initialIndex: 1 })
}

afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('unsaved administrator navigation protection', () => {
  it('is registered by every administrator editor that owns mutable draft state', () => {
    const editors = [
      'src/pages/admin/CommunityEditorPage.tsx',
      'src/pages/admin/ContentEditorPage.tsx',
      'src/pages/admin/email-campaigns/CampaignStudio.tsx',
      'src/pages/admin/JournalEditorPage.tsx',
      'src/pages/admin/ProductEditorPage.tsx',
      'src/pages/admin/TreasuryPage.tsx',
      'src/pages/admin/WebsiteEditorPage.tsx',
    ]
    for (const editor of editors) {
      expect(readFileSync(resolve(process.cwd(), editor), 'utf8'), editor).toContain('useUnsavedChanges(')
    }
  })

  it('keeps a dirty editor mounted when browser Back is cancelled', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const router = makeRouter()
    render(<RouterProvider router={router} />)

    await act(async () => { await router.navigate(-1) })

    expect(confirm).toHaveBeenCalledWith('Discard the unsaved draft?')
    expect(screen.getByRole('heading', { name: 'Editor' })).toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent('/editor')
  })

  it('continues the exact blocked navigation after confirmation', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const router = makeRouter()
    render(<RouterProvider router={router} />)

    await act(async () => { await router.navigate(-1) })

    expect(confirm).toHaveBeenCalledWith('Discard the unsaved draft?')
    expect(screen.getByRole('heading', { name: 'Before' })).toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent('/before')
  })

  it('allows a post-save redirect without prompting for changes that were just saved', async () => {
    const confirm = vi.spyOn(window, 'confirm')
    const router = createMemoryRouter([
      { path: '/editor', element: <UnsavedChangesProvider><DirtyEditorWithControlledExit /></UnsavedChangesProvider> },
      { path: '/destination', element: <Destination /> },
    ], { initialEntries: ['/editor'] })
    render(<RouterProvider router={router} />)

    await userEvent.click(screen.getByRole('button', { name: 'Finish saving' }))

    expect(await screen.findByRole('heading', { name: 'Destination' })).toBeInTheDocument()
    expect(confirm).not.toHaveBeenCalled()
  })

  it('does not show a second router prompt after an editor cancel is confirmed', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const router = createMemoryRouter([
      { path: '/editor', element: <UnsavedChangesProvider><DirtyEditorWithControlledExit confirmFirst /></UnsavedChangesProvider> },
      { path: '/destination', element: <Destination /> },
    ], { initialEntries: ['/editor'] })
    render(<RouterProvider router={router} />)

    await userEvent.click(screen.getByRole('button', { name: 'Cancel editing' }))

    expect(await screen.findByRole('heading', { name: 'Destination' })).toBeInTheDocument()
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(confirm).toHaveBeenCalledWith('Discard these changes?')
  })

  it('consumes a bypass even when the save keeps the editor on the same URL', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const router = createMemoryRouter([
      { path: '/editor', element: <UnsavedChangesProvider><DirtyEditorWithSameLocationSave /></UnsavedChangesProvider> },
      { path: '/destination', element: <Destination /> },
    ], { initialEntries: ['/editor'] })
    render(<RouterProvider router={router} />)

    await userEvent.click(screen.getByRole('button', { name: 'Save here' }))
    await userEvent.click(screen.getByRole('link', { name: 'Leave later' }))

    expect(confirm).toHaveBeenCalledWith('Discard the still-unsaved edit?')
    expect(await screen.findByRole('heading', { name: 'Same location editor' })).toBeInTheDocument()
  })
})
