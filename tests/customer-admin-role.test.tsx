import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CustomerDetailPage } from '../src/pages/admin/CustomerDetailPage'

const mocks = vi.hoisted(() => ({
  manageAccount: vi.fn(),
  getTreasuryCustomerAdmin: vi.fn(),
  getTreasuryAdminState: vi.fn(),
  admin: {
    accounts: [] as Array<Record<string, unknown>>,
    orders: [],
    loading: false,
    errors: {} as Record<string, string>,
    busy: '',
    runAction: vi.fn(),
    refresh: vi.fn(),
  },
  auth: { user: { uid: 'admin-caller' } },
}))

vi.mock('../src/admin/AdminContext', () => ({ useAdminData: () => mocks.admin }))
vi.mock('../src/context/AuthContext', () => ({ useAuth: () => mocks.auth }))
vi.mock('../src/lib/accounts', () => ({ manageAccount: mocks.manageAccount }))
vi.mock('../src/lib/treasury', () => ({
  adminManageTreasury: vi.fn(),
  getTreasuryCustomerAdmin: mocks.getTreasuryCustomerAdmin,
  getTreasuryAdminState: mocks.getTreasuryAdminState,
}))
vi.mock('../src/config', async () => {
  const actual = await vi.importActual<typeof import('../src/config')>('../src/config')
  return { ...actual, adminFunctionsAvailable: true }
})

function account(overrides: Record<string, unknown> = {}) {
  return {
    uid: 'customer-1',
    email: 'customer@example.com',
    displayName: 'Customer One',
    disabled: false,
    emailVerified: true,
    providers: ['password'],
    createdAt: '2026-10-01T00:00:00.000Z',
    lastSignInAt: null,
    admin: false,
    owner: false,
    ...overrides,
  }
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/admin/customers/customer-1']}>
      <Routes><Route path="/admin/customers/:id" element={<CustomerDetailPage />} /></Routes>
    </MemoryRouter>,
  )
}

describe('customer administrator role controls', () => {
  beforeEach(() => {
    mocks.manageAccount.mockReset().mockResolvedValue(undefined)
    mocks.admin.refresh.mockReset().mockResolvedValue(undefined)
    mocks.admin.runAction.mockReset().mockImplementation(async (_key: string, action: () => Promise<void>) => {
      await action()
      return true
    })
    mocks.getTreasuryCustomerAdmin.mockReset().mockResolvedValue({
      banned: false,
      cards: [],
      completionPercentage: 0,
      uniqueCollected: 0,
      orders: [],
      transactions: [],
    })
    mocks.getTreasuryAdminState.mockReset().mockResolvedValue({ cards: [] })
  })

  it('lets an administrator promote an ordinary verified customer', async () => {
    mocks.admin.accounts = [account()]
    renderPage()

    await userEvent.click(await screen.findByRole('button', { name: 'Make administrator' }))
    const dialog = screen.getByRole('alertdialog')
    expect(within(dialog).getByText(/access to the administrator dashboard/i)).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Make administrator' }))

    expect(mocks.manageAccount).toHaveBeenCalledWith('customer-1', 'grantAdmin')
  })

  it('lets an administrator demote a non-owner admin but never exposes owner role controls', async () => {
    mocks.admin.accounts = [account({ admin: true })]
    const view = renderPage()
    expect(await screen.findByRole('button', { name: 'Remove administrator' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Make administrator' })).not.toBeInTheDocument()

    view.unmount()
    mocks.admin.accounts = [account({ admin: true, owner: true })]
    renderPage()
    expect(await screen.findByText('Owner')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Remove administrator' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Make administrator' })).not.toBeInTheDocument()
  })
})
