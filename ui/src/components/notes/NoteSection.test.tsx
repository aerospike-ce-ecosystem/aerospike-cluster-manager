import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { NoteSection } from "./NoteSection"

describe("NoteSection delete confirmation", () => {
  it("opens a ConfirmDialog instead of window.confirm and deletes on confirm", async () => {
    const user = userEvent.setup()
    const onDelete = vi.fn().mockResolvedValue(undefined)

    render(
      <NoteSection
        title="Operator note"
        note="existing note"
        onSave={vi.fn()}
        onDelete={onDelete}
      />,
    )

    await user.click(screen.getByRole("button", { name: "Delete" }))

    // The in-app dialog renders; nothing has been deleted yet.
    const dialog = await screen.findByRole("dialog")
    expect(dialog).toHaveTextContent("Delete note")
    expect(onDelete).not.toHaveBeenCalled()

    // Confirming runs the delete.
    await user.click(
      screen.getByRole("button", { name: "Delete", hidden: false }),
    )
    expect(onDelete).toHaveBeenCalledTimes(1)
  })

  it("does not delete when the confirmation is cancelled", async () => {
    const user = userEvent.setup()
    const onDelete = vi.fn().mockResolvedValue(undefined)

    render(
      <NoteSection
        title="Operator note"
        note="existing note"
        onSave={vi.fn()}
        onDelete={onDelete}
      />,
    )

    await user.click(screen.getByRole("button", { name: "Delete" }))
    await screen.findByRole("dialog")
    await user.click(screen.getByRole("button", { name: "Cancel" }))

    expect(onDelete).not.toHaveBeenCalled()
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })
})
