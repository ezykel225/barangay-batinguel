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

// ── Portal mode (post-X3) ─────────────────────────────────────────────
//
// The five Official Portal management tables moved their Edit/Delete
// button pairs into this menu. They could not use it before: a
// `.table-wrapper` has `overflow-x: auto` and `overflow-y: auto`, and an
// overflow container CLIPS absolutely-positioned descendants. Measured
// before the portal: the menu ended 69px past the wrapper's bottom edge
// and `elementFromPoint` at its centre returned `.dashboard-main` -- the
// menu was not painted at all.
describe('portal mode', () => {
  const Table = ({ items }) => (
    <div className="table-wrapper">
      <table className="dashboard-table">
        <tbody>
          <tr>
            <td data-label="Name">Juan Dela Cruz</td>
            <td data-label="Action">
              <ActionMenu portal label="More actions for Juan Dela Cruz" items={items} />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
  const EDIT_DELETE = [
    { key: 'edit', label: 'Edit entry', onSelect: () => {} },
    { key: 'delete', label: 'Delete entry', danger: true, onSelect: () => {} },
  ]

  it('renders the popup outside the clipping wrapper', () => {
    const { container } = render(<Table items={EDIT_DELETE} />)
    fireEvent.click(screen.getByRole('button', { name: 'More actions for Juan Dela Cruz' }))
    const menu = screen.getByRole('menu')
    // In the document, but NOT inside the table wrapper that would clip
    // it. That is the whole point of the portal.
    expect(menu).toBeInTheDocument()
    expect(container.querySelector('.table-wrapper').contains(menu)).toBe(false)
  })

  it('marks the portalled popup so it can be positioned as fixed', () => {
    render(<Table items={EDIT_DELETE} />)
    fireEvent.click(screen.getByRole('button', { name: /More actions/ }))
    expect(screen.getByRole('menu').className).toMatch(/is-portal/)
  })

  it('keeps the whole keyboard contract through the portal', () => {
    render(<Table items={EDIT_DELETE} />)
    const trigger = screen.getByRole('button', { name: /More actions/ })
    fireEvent.click(trigger)
    // Focus enters the menu...
    expect(screen.getByRole('menuitem', { name: 'Edit entry' })).toHaveFocus()
    // ...arrows move within it...
    fireEvent.keyDown(screen.getByRole('menuitem', { name: 'Edit entry' }), { key: 'ArrowDown' })
    expect(screen.getByRole('menuitem', { name: 'Delete entry' })).toHaveFocus()
    // ...and Escape closes it and hands focus back to the trigger.
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('still reports its state on the trigger, which stays in the row', () => {
    const { container } = render(<Table items={EDIT_DELETE} />)
    const trigger = screen.getByRole('button', { name: /More actions/ })
    expect(container.querySelector('td[data-label="Action"]').contains(trigger)).toBe(true)
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(trigger).toHaveAttribute('aria-controls', screen.getByRole('menu').id)
  })

  it('names the row it belongs to, so two menus are told apart', () => {
    render(<Table items={EDIT_DELETE} />)
    expect(screen.getByRole('button', { name: 'More actions for Juan Dela Cruz' })).toBeInTheDocument()
  })
})

// ── Authorization ─────────────────────────────────────────────────────
//
// ⚠️ Moving an action into a menu must never make a restricted action
// reachable by someone who could not see the button. The dashboards
// build `items` with the same conditionals the buttons had, so an action
// a role may not perform is simply not in the array.
describe('what the menu may contain', () => {
  it('omits an action the caller is not allowed, rather than disabling it', () => {
    // The Officials Directory case: an official may not archive their
    // OWN record, so that item is absent from their own row's menu.
    const ownRow = [{ key: 'edit', label: 'Edit official', onSelect: () => {} }]
    render(<ActionMenu portal label="More actions for ZZ Official" items={ownRow} />)
    fireEvent.click(screen.getByRole('button', { name: /More actions/ }))
    expect(screen.getByRole('menuitem', { name: 'Edit official' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: /Archive/ })).not.toBeInTheDocument()
  })

  it('includes it for somebody else’s row', () => {
    const otherRow = [
      { key: 'edit', label: 'Edit official', onSelect: () => {} },
      { key: 'archive', label: 'Archive official', danger: true, onSelect: () => {} },
    ]
    render(<ActionMenu portal label="More actions for Somebody Else" items={otherRow} />)
    fireEvent.click(screen.getByRole('button', { name: /More actions/ }))
    expect(screen.getByRole('menuitem', { name: 'Archive official' })).toBeInTheDocument()
  })

  it('renders no trigger at all when the caller may do nothing', () => {
    // Not an empty menu a keyboard user can open and find nothing in.
    const { container } = render(<ActionMenu portal label="More actions" items={[]} />)
    expect(container.querySelector('.action-menu')).toBeNull()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('marks a destructive item by class, not by colour alone', () => {
    const items = [
      { key: 'edit', label: 'Edit entry', onSelect: () => {} },
      { key: 'delete', label: 'Delete entry', danger: true, onSelect: () => {} },
    ]
    render(<ActionMenu portal label="More actions" items={items} />)
    fireEvent.click(screen.getByRole('button', { name: /More actions/ }))
    expect(screen.getByRole('menuitem', { name: 'Delete entry' }).className).toMatch(/is-danger/)
    expect(screen.getByRole('menuitem', { name: 'Edit entry' }).className).not.toMatch(/is-danger/)
  })

  it('restores focus to the trigger BEFORE running the handler', () => {
    // ⚠️ This is about focus, not about the DOM. `close()` calls
    // `setOpen(false)` -- a batched React update, so the menu is still
    // in the document on this tick -- but it focuses the trigger
    // synchronously, and that is the part that matters: ConfirmDialog
    // remembers whatever is focused when it opens and returns focus
    // there when it closes. If that were still a menu item, focus would
    // be handed back to an element about to be unmounted.
    let focusedWhenHandlerRan = null
    const items = [{
      key: 'delete',
      label: 'Delete entry',
      danger: true,
      onSelect: () => { focusedWhenHandlerRan = document.activeElement },
    }]
    render(<ActionMenu portal label="More actions" items={items} />)
    const trigger = screen.getByRole('button', { name: /More actions/ })
    fireEvent.click(trigger)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete entry' }))
    expect(focusedWhenHandlerRan).toBe(trigger)
    // And the menu is gone once React has committed.
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})

// ── Short labels, full accessible names ───────────────────────────────
//
// ⚠️ The management tables' items read "Edit" and "Delete". That is only
// safe because `subject` puts the row back into every accessible name --
// a screen-reader user has no row to read. These tests are the reason
// shortening the visible text is not a regression, so they must fail if
// `subject` ever stops composing the name.
describe('subject-derived accessible names', () => {
  const EDIT_DELETE = [
    { key: 'edit', label: 'Edit', onSelect: () => {} },
    { key: 'delete', label: 'Delete', danger: true, onSelect: () => {} },
  ]
  const open = (props) => {
    render(<ActionMenu portal items={EDIT_DELETE} {...props} />)
    fireEvent.click(screen.getByRole('button', { name: /More actions/ }))
  }

  it('names the trigger from the subject, so no caller repeats the template', () => {
    render(<ActionMenu portal subject="Anti-Dengue Cleanup Drive" items={EDIT_DELETE} />)
    expect(
      screen.getByRole('button', { name: 'More actions for Anti-Dengue Cleanup Drive' })
    ).toBeInTheDocument()
  })

  it('puts the subject into each item, so "Edit" is never announced bare', () => {
    open({ subject: 'Anti-Dengue Cleanup Drive' })
    expect(screen.getByRole('menuitem', { name: 'Edit Anti-Dengue Cleanup Drive' }))
      .toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Delete Anti-Dengue Cleanup Drive' }))
      .toBeInTheDocument()
  })

  it('still shows only the short word on screen', () => {
    open({ subject: 'Anti-Dengue Cleanup Drive' })
    // The visible text, as distinct from the accessible name above.
    expect(screen.getByRole('menuitem', { name: /^Edit / })).toHaveTextContent(/^Edit$/)
    expect(screen.getByRole('menuitem', { name: /^Delete / })).toHaveTextContent(/^Delete$/)
  })

  // WCAG 2.5.3 Label in Name: the accessible name must CONTAIN the
  // visible label, so "click Edit" still works by voice. An aria-label
  // that replaced the word rather than extending it would break that.
  it('keeps the visible word at the start of the accessible name', () => {
    open({ subject: 'Juan Dela Cruz' })
    screen.getAllByRole('menuitem').forEach((item) => {
      const visible = item.textContent.trim()
      expect(item.getAttribute('aria-label')).toMatch(new RegExp(`^${visible}\\b`))
    })
  })

  it('labels the menu itself from the trigger, naming the row on entry', () => {
    open({ subject: 'Juan Dela Cruz' })
    const menu = screen.getByRole('menu')
    const trigger = screen.getByRole('button', { name: /More actions/ })
    expect(menu).toHaveAttribute('aria-labelledby', trigger.id)
    expect(trigger.id).not.toBe('')
  })

  it('adds no aria-label when there is no subject, leaving the text to speak', () => {
    // The nurse's medicine list passes `label` and no subject; its items
    // already name themselves ("Edit details", "Remove").
    open({ label: 'More actions for Paracetamol' })
    screen.getAllByRole('menuitem').forEach((item) => {
      expect(item).not.toHaveAttribute('aria-label')
    })
  })

  it('lets an explicit label win over the derived one', () => {
    render(
      <ActionMenu portal label="More actions for Paracetamol" subject="Ignored" items={EDIT_DELETE} />
    )
    expect(screen.getByRole('button', { name: 'More actions for Paracetamol' })).toBeInTheDocument()
  })
})

// ─── One item may carry its own subject (PR #24) ──────────────────────
//
// The Document Requests menu passes "document request from <name>",
// which reads correctly after Approve, Decline, Mark Ready and Mark
// Claimed -- and as "Generate Document document request from <name>"
// after the fifth. So that one item passes its own subject.
//
// ⚠️ These tests pin the LIMIT as much as the feature: an item may
// change what follows the label, never the label itself, so WCAG 2.5.3
// Label in Name still holds for every item in the menu.
describe('a per-item subject', () => {
  const QUEUE_ITEMS = [
    { key: 'approve', label: 'Approve', onSelect: () => {} },
    { key: 'ready', label: 'Mark Ready', onSelect: () => {} },
    { key: 'generate', label: 'Generate Document', subject: 'for Ezequel Bautista', onSelect: () => {} },
  ]

  const openQueue = () => {
    render(
      <ActionMenu
        portal
        subject="document request from Ezequel Bautista"
        items={QUEUE_ITEMS}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /More actions/ }))
  }

  it('uses the item subject for that item', () => {
    openQueue()
    expect(screen.getByRole('menuitem', { name: 'Generate Document for Ezequel Bautista' }))
      .toBeInTheDocument()
  })

  it('leaves every other item on the menu-level subject', () => {
    openQueue()
    expect(screen.getByRole('menuitem', { name: 'Approve document request from Ezequel Bautista' }))
      .toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Mark Ready document request from Ezequel Bautista' }))
      .toBeInTheDocument()
  })

  it('does not change the trigger, which keeps the menu-level subject', () => {
    openQueue()
    expect(
      screen.getByRole('button', { name: 'More actions for document request from Ezequel Bautista' })
    ).toBeInTheDocument()
  })

  it('still shows only the short words on screen', () => {
    openQueue()
    expect(screen.getByRole('menuitem', { name: /^Generate Document for/ }))
      .toHaveTextContent(/^Generate Document$/)
    expect(screen.getByRole('menuitem', { name: /^Approve document/ }))
      .toHaveTextContent(/^Approve$/)
  })

  // ⚠️ The override cannot escape the prefix rule, because the
  // component composes the name rather than taking it whole.
  it('keeps the visible label at the start of EVERY accessible name', () => {
    openQueue()
    screen.getAllByRole('menuitem').forEach((item) => {
      const visible = item.textContent.trim()
      expect(item.getAttribute('aria-label')).toMatch(new RegExp(`^${visible}\\b`))
    })
  })

  // An item subject with no menu-level subject is still honoured, so a
  // caller is not forced to supply one it has no use for.
  it('works with no menu-level subject, and names only that item', () => {
    render(
      <ActionMenu
        items={[
          { key: 'a', label: 'Approve', onSelect: () => {} },
          { key: 'g', label: 'Generate Document', subject: 'for Maria Cruz', onSelect: () => {} },
        ]}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /More actions/ }))
    expect(screen.getByRole('menuitem', { name: 'Generate Document for Maria Cruz' }))
      .toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Approve' })).not.toHaveAttribute('aria-label')
  })
})
