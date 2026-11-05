import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TreasuryPage } from '../src/pages/account/TreasuryPage'

const mocks = vi.hoisted(() => ({ get: vi.fn(), begin: vi.fn(), redeem: vi.fn(), transfer: vi.fn() }))

vi.mock('../src/components/account/AccountChrome', () => ({ AccountCentreShell: ({ children, title }: { children: React.ReactNode; title: string }) => <main><h1>{title}</h1>{children}</main> }))
vi.mock('../src/context/AuthContext', () => ({ friendlyAuthError: (error: unknown) => error instanceof Error ? error.message : 'Unable to redeem.' }))
vi.mock('../src/lib/treasury', () => ({
  getMyTreasury: mocks.get,
  beginTreasuryRedemption: mocks.begin,
  redeemPhysicalTreasuryCards: mocks.redeem,
  transferTreasuryCard: mocks.transfer,
}))

const before = {
  editions: [{ id:'edition-1',title:'First Edition',description:'Twelve collectible cards.',coverImageUrl:'',coverImageAlt:'',status:'published',sortOrder:1,codePrefix:'A' }],
  cards: [
    { id:'card-1',editionId:'edition-1',number:'01',title:'Saint Peter',teaser:'A story waiting to be revealed.',story:'',imageUrl:'',imageAlt:'',status:'published',sortOrder:1,collected:false,quantity:0,copies:[] },
    { id:'card-2',editionId:'edition-1',number:'02',title:'Saint Andrew',teaser:'A collected story.',story:'Full revealed story.',imageUrl:'/card.jpg',imageAlt:'Card artwork',status:'published',sortOrder:2,collected:true,quantity:2,firstCollectedAt:'2026-10-14T00:00:00.000Z',copies:[
      { id:'copy-1',cardId:'card-2',editionId:'edition-1',productionNumber:1,acquiredAt:'2026-10-14T00:00:00.000Z',source:'physical_code',transferable:true },
      { id:'copy-2',cardId:'card-2',editionId:'edition-1',productionNumber:2,acquiredAt:'2026-10-14T00:00:00.000Z',source:'physical_code',transferable:true },
    ] },
  ],
  uniqueCollected: 1, totalAvailable: 2, completionPercentage: 50, treasuryBanned: false,
}

const session = { orderId:'co_paid',eligibleCodeCount:2,redeemedCodeCount:0,remainingCodeCount:2,failedAttempts:0,attemptLimit:3,attemptsRemaining:3,locked:false }

describe('My Treasury page', () => {
  beforeEach(() => {
    mocks.get.mockReset().mockResolvedValue(before)
    mocks.begin.mockReset().mockResolvedValue(session)
    mocks.redeem.mockReset().mockResolvedValue({ ...session,redeemedCodeCount:2,remainingCodeCount:0,accepted:[{ index:0,cardId:'card-1',title:'Saint Peter',instanceId:'copy-new-1' },{ index:1,cardId:'card-2',title:'Saint Andrew',instanceId:'copy-new-2' }],rejected:[] })
    mocks.transfer.mockReset().mockResolvedValue({ transferred:true,recipientEmail:'collector@example.com' })
  })

  it('shows every published card, duplicates and unique completion without exposing a locked story', async () => {
    render(<TreasuryPage />)
    expect(await screen.findByRole('heading', { name: 'First Edition' })).toBeInTheDocument()
    expect(screen.getByText('50%')).toBeInTheDocument()
    expect(screen.getByText('1 of 2 unique Saints revealed')).toBeInTheDocument()
    expect(screen.getByText('Not yet collected')).toBeInTheDocument()
    expect(screen.getByText('2 copies')).toBeInTheDocument()
    expect(screen.getByText('Full revealed story.')).not.toBeVisible()
  })

  it('finds an order, confirms its physical codes and closes after a complete reveal', async () => {
    const user = userEvent.setup()
    render(<TreasuryPage />)
    await user.click(await screen.findByRole('button', { name: /Redeem Cards/i }))
    await user.type(screen.getByLabelText('Order number'), '#co_paid')
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await waitFor(() => expect(mocks.begin).toHaveBeenCalledWith('co_paid'))
    const fields = await screen.findAllByLabelText(/Card code/)
    await user.type(fields[0], 'a010001')
    await user.type(fields[1], 'a020001')
    await user.click(screen.getByRole('button', { name: 'Check my codes' }))
    const confirm = screen.getByRole('alertdialog', { name: 'Check your codes' })
    await user.click(within(confirm).getByRole('button', { name: 'Reveal my Saints' }))
    await waitFor(() => expect(mocks.redeem).toHaveBeenCalledWith('co_paid', ['A010001', 'A020001']))
    expect(await screen.findByText('2 Saints revealed and added to your Treasury.')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('keeps incorrect fields visible after accepting valid cards', async () => {
    const user = userEvent.setup()
    mocks.redeem.mockResolvedValueOnce({ ...session,redeemedCodeCount:1,remainingCodeCount:1,failedAttempts:1,attemptsRemaining:2,accepted:[{ index:0,cardId:'card-1',title:'Saint Peter',instanceId:'copy-new-1' }],rejected:[{ index:1,reason:'This code does not match the order.' }] })
    render(<TreasuryPage />)
    await user.click(await screen.findByRole('button', { name: /Redeem Cards/i }))
    await user.type(screen.getByLabelText('Order number'), 'co_paid')
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    const fields = await screen.findAllByLabelText(/Card code/)
    await user.type(fields[0], 'A010001'); await user.type(fields[1], 'A990001')
    await user.click(screen.getByRole('button', { name: 'Check my codes' }))
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Reveal my Saints' }))
    expect(await screen.findAllByText(/highlighted code and try again/i)).not.toHaveLength(0)
    expect(screen.getByLabelText('Card code 1')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('1 Saint revealed and added to your Treasury.')).toBeInTheDocument()
  })

  it('transfers one selected duplicate copy by registered email', async () => {
    const user = userEvent.setup()
    render(<TreasuryPage />)
    await user.click(await screen.findByRole('button', { name: /Copy 1.*Transfer/i }))
    await user.type(screen.getByLabelText('Recipient account email'), 'collector@example.com')
    await user.click(screen.getByRole('button', { name: 'Transfer this card' }))
    await waitFor(() => expect(mocks.transfer).toHaveBeenCalledWith('copy-1', 'collector@example.com'))
    expect(await screen.findByText('Saint Andrew was transferred to collector@example.com.')).toBeInTheDocument()
  })

  it('provides an honest empty state before a set is published', async () => {
    mocks.get.mockResolvedValueOnce({ editions: [], cards: [], uniqueCollected:0,totalAvailable:0,completionPercentage:0 })
    render(<TreasuryPage />)
    expect(await screen.findByRole('heading', { name: 'Your first collection is being prepared' })).toBeInTheDocument()
  })
})
