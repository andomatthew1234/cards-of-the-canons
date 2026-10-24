import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'

const mocks = vi.hoisted(() => ({ listPublishedProducts: vi.fn() }))

vi.mock('../src/config', async (importOriginal) => ({
  ...await importOriginal<typeof import('../src/config')>(),
  isFirebaseMode: true,
}))
vi.mock('../src/lib/data', () => ({ listPublishedProducts: mocks.listPublishedProducts }))

import { CatalogProvider, useCatalogState } from '../src/context/CatalogContext'

function CatalogueProbe() {
  const { products, status, error, reload } = useCatalogState()
  return <div><output aria-label="Status">{status}</output><output aria-label="Count">{products.length}</output>{error && <p role="alert">{error}</p>}<button onClick={reload}>Reload</button></div>
}

describe('production catalogue state', () => {
  beforeEach(() => mocks.listPublishedProducts.mockReset())

  it('treats an empty published catalogue as empty instead of using demo products', async () => {
    mocks.listPublishedProducts.mockResolvedValue([])
    render(<CatalogProvider><CatalogueProbe /></CatalogProvider>)
    await waitFor(() => expect(screen.getByLabelText('Status')).toHaveTextContent('ready'))
    expect(screen.getByLabelText('Count')).toHaveTextContent('0')
  })

  it('exposes an honest error and can retry without falling back to demo products', async () => {
    mocks.listPublishedProducts.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([])
    render(<CatalogProvider><CatalogueProbe /></CatalogProvider>)
    expect(await screen.findByRole('alert')).toHaveTextContent('could not be loaded')
    expect(screen.getByLabelText('Count')).toHaveTextContent('0')
    await userEvent.click(screen.getByRole('button', { name: 'Reload' }))
    await waitFor(() => expect(screen.getByLabelText('Status')).toHaveTextContent('ready'))
    expect(mocks.listPublishedProducts).toHaveBeenCalledTimes(2)
  })
})
