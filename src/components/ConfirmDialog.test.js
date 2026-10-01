// The shared confirmation dialog, and the one thing about the hook that
// is easy to get wrong.
//
// Written during the X1 pass, when the resident portal's two
// `window.confirm` calls were converted to this hook. `window.confirm`
// blocks the page, so a second question could never be asked while the
// first was open. `useConfirm` does not block, which made a latent bug
// in the hook reachable: a second `confirm()` overwrote the resolver, so
// the first promise never settled and its handler hung for the rest of
// the session -- no write, no error, nothing on screen.
//
// It was already latent for the Official and Nurse portals, whose action
// buttons disable per row rather than across rows, so two dialogs could
// be opened from two different rows.
//
// The component imports only React and one icon, so this runs without
// the Supabase environment variables.

import { render, screen, fireEvent, act } from '@testing-library/react'
import { useConfirm } from './ConfirmDialog'

// A host for the hook. Two buttons, each asking its own question, and a
// log of how each promise settled.
const Host = ({ answers }) => {
  const [confirm, dialog] = useConfirm()
  return (
    <>
      <button
        type="button"
        onClick={async () => {
          answers.push(['first', await confirm({ title: 'First question?' })])
        }}
      >
        ask first
      </button>
      <button
        type="button"
        onClick={async () => {
          answers.push(['second', await confirm({ title: 'Second question?' })])
        }}
      >
        ask second
      </button>
      {dialog}
    </>
  )
}

const flush = () => act(async () => { await Promise.resolve() })

describe('useConfirm', () => {
  it('resolves true when confirmed and false when cancelled', async () => {
    const answers = []
    render(<Host answers={answers} />)

    fireEvent.click(screen.getByText('ask first'))
    await flush()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    await flush()
    expect(answers).toEqual([['first', true]])

    fireEvent.click(screen.getByText('ask first'))
    await flush()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await flush()
    expect(answers).toEqual([['first', true], ['first', false]])
  })

  it('settles an abandoned question as false rather than leaving it pending', async () => {
    // ⚠️ The regression this file exists for. Before the fix the first
    // promise never settled at all, so `answers` only ever held the
    // second entry and the first handler stayed stuck.
    const answers = []
    render(<Host answers={answers} />)

    fireEvent.click(screen.getByText('ask first'))
    await flush()
    expect(screen.getByText('First question?')).toBeInTheDocument()

    // The second question arrives while the first is still open.
    fireEvent.click(screen.getByText('ask second'))
    await flush()

    // The first one is answered "no" -- a question nobody saw must never
    // come back true, because that is the answer that causes a write.
    expect(answers).toEqual([['first', false]])
    expect(screen.getByText('Second question?')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    await flush()
    expect(answers).toEqual([['first', false], ['second', true]])
  })

  it('closes on Escape and answers false', async () => {
    const answers = []
    render(<Host answers={answers} />)

    fireEvent.click(screen.getByText('ask first'))
    await flush()
    fireEvent.keyDown(document, { key: 'Escape' })
    await flush()

    expect(answers).toEqual([['first', false]])
    expect(screen.queryByText('First question?')).not.toBeInTheDocument()
  })

  it('uses the labels it is given, including a custom cancel', async () => {
    // The resident portal's cancel-a-booking dialog needs this: the
    // default pair reads "Cancel" beside "Cancel booking", which is
    // unreadable when the action itself is called cancelling.
    const Labelled = () => {
      const [confirm, dialog] = useConfirm()
      return (
        <>
          <button
            type="button"
            onClick={() => confirm({
              title: 'Cancel this booking?',
              confirmLabel: 'Cancel booking',
              cancelLabel: 'Keep booking',
            })}
          >
            open
          </button>
          {dialog}
        </>
      )
    }
    render(<Labelled />)

    fireEvent.click(screen.getByText('open'))
    await flush()

    expect(screen.getByRole('button', { name: 'Cancel booking' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Keep booking' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument()
  })
})
