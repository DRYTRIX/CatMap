import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import SegmentedControl from "./SegmentedControl";

const OPTIONS = [
  { value: "", label: "Any" },
  { value: "true", label: "Yes" },
  { value: "false", label: "No" },
];

describe("SegmentedControl", () => {
  it("marks the active option as checked", () => {
    render(<SegmentedControl name="Ear tipped" value="true" options={OPTIONS} onChange={() => {}} />);

    expect(screen.getByRole("radio", { name: "Yes" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "Any" })).toHaveAttribute("aria-checked", "false");
  });

  it("calls onChange with the clicked option's value", () => {
    const onChange = vi.fn();
    render(<SegmentedControl name="Ear tipped" value="true" options={OPTIONS} onChange={onChange} />);

    fireEvent.click(screen.getByRole("radio", { name: "No" }));
    expect(onChange).toHaveBeenCalledWith("false");
  });

  it("exposes the group via an accessible name", () => {
    render(<SegmentedControl name="Ear tipped" value="" options={OPTIONS} onChange={() => {}} />);
    expect(screen.getByRole("radiogroup", { name: "Ear tipped" })).toBeInTheDocument();
  });
});
