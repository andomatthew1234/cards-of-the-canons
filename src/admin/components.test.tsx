import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ConfirmDialog } from './components'

describe('ConfirmDialog', () => {
  it('keeps keyboard focus inside the modal and restores it when closed', async () => {
    const user = userEvent.setup()
    const cancel = vi.fn()
    const confirm = vi.fn()
    const { rerender } = render(<><button>Before</button><ConfirmDialog open={false} title="Delete item?" description="This cannot be undone." onCancel={cancel} onConfirm={confirm} /></>)
    const beforeButton = screen.getByRole('button', { name: 'Before' })
    beforeButton.focus()
    rerender(<><button>Before</button><ConfirmDialog open title="Delete item?" description="This cannot be undone." onCancel={cancel} onConfirm={confirm} /></>)

    const cancelButton = screen.getByRole('button', { name: 'Cancel' })
    const confirmButton = screen.getByRole('button', { name: 'Confirm' })
    expect(cancelButton).toHaveFocus()

    await user.tab()
    expect(confirmButton).toHaveFocus()
    await user.tab()
    expect(cancelButton).toHaveFocus()
    await user.tab({ shift: true })
    expect(confirmButton).toHaveFocus()

    rerender(<><button>Before</button><ConfirmDialog open={false} title="Delete item?" description="This cannot be undone." onCancel={cancel} onConfirm={confirm} /></>)
    expect(beforeButton).toHaveFocus()
  })
})
