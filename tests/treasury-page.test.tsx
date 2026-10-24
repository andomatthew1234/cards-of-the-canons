import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { TreasuryPage } from '../src/pages/account/TreasuryPage'

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  redeem: vi.fn(),
}))

vi.mock('../src/components/account/AccountChrome', () => ({ AccountCentreShell: ({ children, title }: { children: React.ReactNode; title: string }) => <main><h1>{title}</h1>{children}</main> }))
vi.mock('../src/context/AuthContext', () => ({ friendlyAuthError: (error: unknown) => error instanceof Error ? error.message : 'Unable to redeem.' }))
vi.mock('../src/lib/treasury', () => ({ getMyTreasury: mocks.get, redeemTreasuryCode: mocks.redeem }))

const before = {
  editions: [{ id:'edition-1',title:'First Edition',description:'Twelve collectible cards.',coverImageUrl:'',coverImageAlt:'',status:'published',sortOrder:1 }],
  cards: [
    { id:'card-1',editionId:'edition-1',number:'01',title:'Card 01',teaser:'A story waiting to be revealed.',story:'',imageUrl:'',imageAlt:'',status:'published',sortOrder:1,collected:false,quantity:0 },
    { id:'card-2',editionId:'edition-1',number:'02',title:'Card 02',teaser:'A collected story.',story:'Full revealed story.',imageUrl:'/card.jpg',imageAlt:'Card artwork',status:'published',sortOrder:2,collected:true,quantity:2,firstCollectedAt:'2026-10-14T00:00:00.000Z' },
  ],
}

describe('My Treasury page', () => {
  beforeEach(() => {
    mocks.get.mockReset().mockResolvedValue(before)
    mocks.redeem.mockReset().mockResolvedValue({ card:{ ...before.cards[0],collected:true,quantity:1 },edition:before.editions[0],newCard:true,retried:false })
  })

  it('shows every published card while withholding locked reveal content', async () => {
    render(<TreasuryPage />)
    expect(await screen.findByRole('heading', { name: 'First Edition' })).toBeInTheDocument()
    expect(screen.getByText('1 of 2')).toBeInTheDocument()
    expect(screen.getByText('Not yet collected')).toBeInTheDocument()
    expect(screen.getByText('2 copies')).toBeInTheDocument()
    expect(screen.getByText('Full revealed story.')).not.toBeVisible()
  })

  it('redeems a physical code and announces the collected card', async () => {
    render(<TreasuryPage />)
    const input = await screen.findByLabelText('Card code')
    await userEvent.type(input, 'dxa-abcde-fghjk-mnpqr-stuvw-xyz23')
    await userEvent.click(screen.getByRole('button', { name: 'Add to my Treasury' }))
    await waitFor(() => expect(mocks.redeem).toHaveBeenCalledWith('DXA-ABCDE-FGHJK-MNPQR-STUVW-XYZ23'))
    expect(await screen.findByText('Card 01 has been added to your Treasury.')).toBeInTheDocument()
  })

  it('provides an honest empty state before a set is published', async () => {
    mocks.get.mockResolvedValueOnce({ editions: [], cards: [] })
    render(<TreasuryPage />)
    expect(await screen.findByRole('heading', { name: 'Your first collection is being prepared' })).toBeInTheDocument()
  })
})
