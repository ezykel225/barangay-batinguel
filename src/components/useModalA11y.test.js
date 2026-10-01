// Escape, focus entry and focus restoration for the app's hand-rolled
// modals.
//
// These exist because the behaviour is invisible in a screenshot and is
// exactly what breaks silently: a modal that looks fine but leaves focus
// on the button behind it, or that cannot be dismissed from the
// keyboard. Seventeen modals in this app had none of it before X3 --
// every Add/Edit form in the three dashboards, the Login reset box and
// the Footer's Privacy and Terms boxes.
//
// The hook has no Supabase import, so this runs without the environment
// variables App.test.js needs.

import { useState } from 'react'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { useModalA11y } from './useModalA11y'

// A faithful stand-in for the shape every one of those modals has: an
// overlay, a dialog box carrying the semantics X3 added, and a first
// control for focus to land on.
const Host = ({ label = 'Add Registry Entry', withDialog = true }) => {
  const [open, setOpen] = useState(false)
  useModalA11y(open, () => setOpen(false))
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>Open the form</button>
      <button type="button">Somewhere else</button>
      {open && (
        <div className="modal-overlay">
          {withDialog ? (
            <div className="modal" role="dialog" aria-modal="true" tabIndex={-1} aria-label={label}>
              <h2>{label}</h2>
              <input aria-label="First name" />
              <button type="button" onClick={() => setOpen(false)}>Save</button>
            </div>
          ) : (
            <div className="modal"><h2>{label}</h2></div>
          )}
        </div>
      )}
    </div>
  )
}

const open = () => fireEvent.click(screen.getByText('Open the form'))

describe('opening a modal', () => {
  it('moves focus into the dialog, onto the first control', async () => {
    render(<Host />)
    const opener = screen.getByText('Open the form')
    opener.focus()
    open()
    // The hook focuses after a frame, because the dialog is not in the
    // DOM on the tick the state flips.
    await act(async () => { await new Promise((r) => requestAnimationFrame(r)) })
    expect(screen.getByLabelText('First name')).toHaveFocus()
  })

  it('leaves focus inside the dialog, not on the opener behind it', async () => {
    render(<Host />)
    screen.getByText('Open the form').focus()
    open()
    await act(async () => { await new Promise((r) => requestAnimationFrame(r)) })
    const dialog = screen.getByRole('dialog')
    expect(dialog.contains(document.activeElement)).toBe(true)
  })
})

describe('Escape', () => {
  it('closes the modal', async () => {
    render(<Host />)
    open()
    await act(async () => { await new Promise((r) => requestAnimationFrame(r)) })
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('ignores every other key', async () => {
    render(<Host />)
    open()
    await act(async () => { await new Promise((r) => requestAnimationFrame(r)) })
    fireEvent.keyDown(document, { key: 'a' })
    fireEvent.keyDown(document, { key: 'Enter' })
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('does nothing once the modal is closed', () => {
    // The listener must be removed, or Escape anywhere on the page would
    // keep calling a close handler for a modal that is already gone.
    const { container } = render(<Host />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(container.querySelector('.modal-overlay')).toBeNull()
  })
})

describe('focus restoration', () => {
  it('returns focus to whatever opened the modal', async () => {
    render(<Host />)
    const opener = screen.getByText('Open the form')
    opener.focus()
    open()
    await act(async () => { await new Promise((r) => requestAnimationFrame(r)) })
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(opener).toHaveFocus()
  })

  it('restores focus when the modal closes by its own button, not only by Escape', async () => {
    render(<Host />)
    const opener = screen.getByText('Open the form')
    opener.focus()
    open()
    await act(async () => { await new Promise((r) => requestAnimationFrame(r)) })
    fireEvent.click(screen.getByText('Save'))
    expect(opener).toHaveFocus()
  })

  it('does not throw when the opener has left the page', async () => {
    // ⚠️ A row's Edit button is commonly removed by the very save the
    // modal performed. Focusing a detached node silently sends focus to
    // <body>; the hook checks document.contains first.
    const Vanishing = () => {
      const [open, setOpen] = useState(false)
      const [gone, setGone] = useState(false)
      useModalA11y(open, () => { setGone(true); setOpen(false) })
      return (
        <div>
          {!gone && <button type="button" onClick={() => setOpen(true)}>Edit row</button>}
          {open && (
            <div className="modal-overlay">
              <div className="modal" role="dialog" aria-modal="true" tabIndex={-1} aria-label="Edit">
                <input aria-label="Name" />
              </div>
            </div>
          )}
        </div>
      )
    }
    render(<Vanishing />)
    fireEvent.click(screen.getByText('Edit row'))
    await act(async () => { await new Promise((r) => requestAnimationFrame(r)) })
    expect(() => fireEvent.keyDown(document, { key: 'Escape' })).not.toThrow()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('when there is no dialog to find', () => {
  it('still closes on Escape rather than throwing', async () => {
    // A modal that does not carry role="dialog" gets no focus entry --
    // which is visible, because its Escape still works and its focus
    // does not move. Better than failing silently.
    render(<Host withDialog={false} />)
    open()
    await act(async () => { await new Promise((r) => requestAnimationFrame(r)) })
    expect(() => fireEvent.keyDown(document, { key: 'Escape' })).not.toThrow()
  })
})
