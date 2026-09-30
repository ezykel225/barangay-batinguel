// Keyboard and focus behaviour of the ⋮ overflow menu.
//
// Tested here rather than by hand because the parts that are easy to get
// wrong are the parts nobody checks by clicking: where focus goes when the
// menu closes, whether Escape works, and whether the arrow keys move
// between items at all. A menu that opens on click and does nothing on a
// keyboard still looks fine in a screenshot.
//
// The component imports only React and one icon, so this runs without the
// Supabase environment variables.

import { render, screen, fireEvent } from '@testing-library/react'
import ActionMenu from './ActionMenu'

const setup = (overrides = {}) => {
  const onEdit = jest.fn()
  const onRemove = jest.fn()
  const items = [
    { key: 'edit', label: 'Edit details', onSelect: onEdit },
    { key: 'remove', label: 'Remove', danger: true, onSelect: onRemove },
  ]
  render(<ActionMenu items={items} label="More actions for Paracetamol" {...overrides} />)
  return { onEdit, onRemove }
}

const trigger = () => screen.getByRole('button', { name: 'More actions for Paracetamol' })

describe('ActionMenu', () => {
  it('starts closed, and says so', () => {
    setup()
    expect(trigger()).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('has an accessible name and announces that it opens a menu', () => {
    setup()
    // The trigger's only visible content is an icon, so the name has to
    // come from aria-label.
    expect(trigger()).toHaveAttribute('aria-haspopup', 'menu')
  })

  it('opens on click and focuses the first item', () => {
    setup()
    fireEvent.click(trigger())
    expect(trigger()).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('menu')).toBeInTheDocument()
    // Without this, opening with the keyboard leaves focus on the trigger
    // and the arrow keys have nothing to move.
    expect(screen.getByRole('menuitem', { name: 'Edit details' })).toHaveFocus()
  })

  it('opens with ArrowDown from the trigger', () => {
    setup()
    fireEvent.keyDown(trigger(), { key: 'ArrowDown' })
    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Edit details' })).toHaveFocus()
  })

  it('moves between items with the arrow keys, wrapping at both ends', () => {
    setup()
    fireEvent.click(trigger())
    const edit = screen.getByRole('menuitem', { name: 'Edit details' })
    const remove = screen.getByRole('menuitem', { name: 'Remove' })

    fireEvent.keyDown(edit, { key: 'ArrowDown' })
    expect(remove).toHaveFocus()
    fireEvent.keyDown(remove, { key: 'ArrowDown' })
    expect(edit).toHaveFocus()
    fireEvent.keyDown(edit, { key: 'ArrowUp' })
    expect(remove).toHaveFocus()
  })

  it('supports Home and End', () => {
    setup()
    fireEvent.click(trigger())
    const edit = screen.getByRole('menuitem', { name: 'Edit details' })
    const remove = screen.getByRole('menuitem', { name: 'Remove' })

    fireEvent.keyDown(edit, { key: 'End' })
    expect(remove).toHaveFocus()
    fireEvent.keyDown(remove, { key: 'Home' })
    expect(edit).toHaveFocus()
  })

  it('closes on Escape and puts focus back on the trigger', () => {
    setup()
    fireEvent.click(trigger())
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    // Focus must not be left on a removed element.
    expect(trigger()).toHaveFocus()
    expect(trigger()).toHaveAttribute('aria-expanded', 'false')
  })

  it('runs the chosen action, closes, and restores focus', () => {
    const { onEdit, onRemove } = setup()
    fireEvent.click(trigger())
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit details' }))

    expect(onEdit).toHaveBeenCalledTimes(1)
    expect(onRemove).not.toHaveBeenCalled()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    // Focus is back before the handler's own dialog opens, so that
    // dialog's focus return has somewhere real to go.
    expect(trigger()).toHaveFocus()
  })

  it('closes on an outside click without stealing focus back', () => {
    setup()
    fireEvent.click(trigger())
    fireEvent.mouseDown(document.body)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    // The person clicked elsewhere on purpose; yanking focus back would
    // fight them.
    expect(trigger()).not.toHaveFocus()
  })

  it('closes when the page scrolls, so it cannot drift from its row', () => {
    setup()
    fireEvent.click(trigger())
    fireEvent.scroll(window)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('toggles shut on a second click of the trigger', () => {
    setup()
    fireEvent.click(trigger())
    fireEvent.click(trigger())
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('marks a destructive item so it does not rely on list position', () => {
    setup()
    fireEvent.click(trigger())
    expect(screen.getByRole('menuitem', { name: 'Remove' })).toHaveClass('is-danger')
    expect(screen.getByRole('menuitem', { name: 'Edit details' })).not.toHaveClass('is-danger')
  })

  it('renders nothing at all when there are no items', () => {
    render(<ActionMenu items={[]} />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
