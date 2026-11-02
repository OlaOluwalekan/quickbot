import * as React from "react";
import { render, screen } from "@testing-library/react";
import Logo from "@/components/logo/Logo";

describe("Brand Logo Component", () => {
  it("renders full wordmark by default (Kl, styled 'e', cx)", () => {
    const { container } = render(<Logo />);

    const logo = screen.getByRole("img", { name: "Klecx Logo" });
    expect(logo).toBeInTheDocument();

    const prefix = container.querySelector("span:nth-child(1)");
    expect(prefix?.textContent).toBe("Kl");
    expect(prefix).toHaveClass("opacity-100");
    expect(prefix).not.toHaveClass("max-w-0");

    const mark = container.querySelector("svg");
    expect(mark).toBeInTheDocument();
    expect(mark).toHaveAttribute("viewBox", "0 0 100 100");

    const suffix = container.querySelector("span:nth-child(3)");
    expect(suffix?.textContent).toBe("cx");
    expect(suffix).toHaveClass("opacity-100");
    expect(suffix).not.toHaveClass("max-w-0");
  });

  it("collapses prefix and suffix when collapsed prop is true", () => {
    const { container } = render(<Logo collapsed={true} />);

    const prefix = container.querySelector("span:nth-child(1)");
    expect(prefix).toHaveClass("max-w-0");
    expect(prefix).toHaveClass("opacity-0");

    const suffix = container.querySelector("span:nth-child(3)");
    expect(suffix).toHaveClass("max-w-0");
    expect(suffix).toHaveClass("opacity-0");

    // The central styled "e" mark remains rendered
    const mark = container.querySelector("svg");
    expect(mark).toBeInTheDocument();
  });

  it("applies design system color tokens (text-fg for text, text-accent for mark)", () => {
    const { container } = render(<Logo />);

    const logoRoot = screen.getByRole("img", { name: "Klecx Logo" });
    expect(logoRoot).toHaveClass("text-fg");

    const markWrapper = container.querySelector("span:nth-child(2)");
    expect(markWrapper).toHaveClass("text-accent");
  });

  it("supports multiple size variants", () => {
    const { container, rerender } = render(<Logo size="small" />);
    expect(container.querySelector("svg")).toHaveClass("h-4.5");

    rerender(<Logo size="large" />);
    expect(container.querySelector("svg")).toHaveClass("h-14");
  });
});
