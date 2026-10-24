import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import { CommunityPage } from '../src/pages/account/CommunityPage'
import * as communityApi from '../src/lib/community'

vi.mock('../src/context/AuthContext', () => ({
  friendlyAuthError: (error: unknown) => error instanceof Error ? error.message : 'Request failed.',
  useAuth: () => ({ user:{ uid:'customer-1',email:'customer@example.com',displayName:'Customer' },loading:false,isAdmin:false,logOut:vi.fn() }),
}))

vi.mock('../src/lib/community', () => ({
  listCommunitySurveys: vi.fn(),
  getMyCommunityResponse: vi.fn(),
  submitCommunityAnswers: vi.fn(),
  getCommunityAttentionCount: vi.fn().mockResolvedValue(0),
}))

describe('account community surveys', () => {
  it('lets a signed-in customer answer a published survey', async () => {
    vi.mocked(communityApi.listCommunitySurveys).mockResolvedValue([{ id:'survey-1',title:'Choose a collection',description:'Help choose what comes next.',status:'published',responseCount:0,questions:[{ id:'theme',prompt:'Which theme interests you?',type:'single_choice',required:true,options:['Church councils','Church fathers'] }] }])
    vi.mocked(communityApi.getMyCommunityResponse).mockResolvedValue(null)
    vi.mocked(communityApi.submitCommunityAnswers).mockResolvedValue(undefined)
    render(<MemoryRouter initialEntries={['/account/community']}><CommunityPage /></MemoryRouter>)
    expect(await screen.findByText('Choose a collection')).toBeInTheDocument()
    await userEvent.click(screen.getByLabelText('Church councils'))
    await userEvent.click(screen.getByRole('button', { name:'Submit response' }))
    await waitFor(() => expect(communityApi.submitCommunityAnswers).toHaveBeenCalledWith('survey-1', [{ questionId:'theme',value:'Church councils' }]))
    expect(await screen.findByText('Your response has been saved.')).toBeInTheDocument()
  })
})
