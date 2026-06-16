import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import Lightbox from "./Lightbox";

describe("Lightbox", () => {
  it("shows the full image for a single-photo gallery (no nav arrows)", () => {
    // Regression: a 1-element `images` array must still render the image.
    render(
      <Lightbox
        images={[{ src: "/full.jpg", alt: "Cat" }]}
        index={0}
        onClose={vi.fn()}
        onNavigate={vi.fn()}
      />
    );
    const img = screen.getByRole("img");
    expect(img).toHaveAttribute("src", "/full.jpg");
    expect(screen.queryByLabelText("Next photo")).not.toBeInTheDocument();
  });

  it("shows the selected image and nav for a multi-photo gallery", () => {
    render(
      <Lightbox
        images={[
          { src: "/a.jpg", alt: "A" },
          { src: "/b.jpg", alt: "B" },
        ]}
        index={1}
        onClose={vi.fn()}
        onNavigate={vi.fn()}
      />
    );
    expect(screen.getByRole("img")).toHaveAttribute("src", "/b.jpg");
    expect(screen.getByLabelText("Next photo")).toBeInTheDocument();
  });

  it("falls back to the legacy single `src` prop", () => {
    render(<Lightbox src="/legacy.jpg" alt="Legacy" onClose={vi.fn()} />);
    expect(screen.getByRole("img")).toHaveAttribute("src", "/legacy.jpg");
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    render(<Lightbox images={[{ src: "/x.jpg" }]} onClose={onClose} onNavigate={vi.fn()} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});
