import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import Modal from "./Modal";

function renderModal(onClose = vi.fn()) {
  return render(
    <Modal onClose={onClose} labelledBy="modal-title">
      <h2 id="modal-title">Title</h2>
      <button>Inside</button>
    </Modal>
  );
}

describe("Modal", () => {
  it("renders children inside an accessible dialog", () => {
    renderModal();
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-labelledby", "modal-title");
    expect(screen.getByText("Inside")).toBeInTheDocument();
  });

  it("calls onClose on Escape", () => {
    const onClose = vi.fn();
    renderModal(onClose);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose when the backdrop is clicked, but not the panel", () => {
    const onClose = vi.fn();
    const { container } = renderModal(onClose);

    fireEvent.mouseDown(screen.getByRole("dialog"));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.mouseDown(container.querySelector(".overlay"));
    expect(onClose).toHaveBeenCalled();
  });
});
