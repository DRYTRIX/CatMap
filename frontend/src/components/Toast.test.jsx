import { describe, expect, it } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { ToastProvider, useToast } from "./Toast";

function Trigger() {
  const toast = useToast();
  return (
    <>
      <button onClick={() => toast.success("Saved!")}>success</button>
      <button onClick={() => toast.error("Something broke")}>error</button>
    </>
  );
}

describe("Toast", () => {
  it("renders a success toast when triggered", async () => {
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>
    );

    act(() => screen.getByText("success").click());

    const toast = await screen.findByText("Saved!");
    expect(toast.closest(".toast")).toHaveClass("toast-success");
  });

  it("renders an error toast when triggered", async () => {
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>
    );

    act(() => screen.getByText("error").click());

    const toast = await screen.findByText("Something broke");
    expect(toast.closest(".toast")).toHaveClass("toast-error");
  });

  it("useToast throws outside of a ToastProvider", () => {
    function Bare() {
      useToast();
      return null;
    }
    // React logs the thrown error to console.error as well; silence that
    // expected noise for this test.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Bare />)).toThrow("useToast must be used within a ToastProvider");
    spy.mockRestore();
  });
});
