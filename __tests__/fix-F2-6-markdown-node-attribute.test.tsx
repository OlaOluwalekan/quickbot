/**
 * Fix F2.6 (review) — the Markdown renderer must not leak react-markdown's
 * internal `node` prop onto HTML elements (`node="[object Object]"`).
 */

import React from "react";
import { render } from "@testing-library/react";
import { Markdown } from "@/components/markdown";

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

jest.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: "light" }),
}));

const CONTENT = [
  "# Title",
  "## Section",
  "A paragraph with `inline code`, a [link](https://example.com) and **bold** text.",
  "- first item\n- second item",
  "1. one\n2. two",
  "> a quote",
  "```ts\nconst a = 1;\n```",
  "| A | B |\n|---|---|\n| 1 | 2 |",
  "---",
].join("\n\n");

describe("Fix F2.6 — Markdown elements carry no `node` attribute", () => {
  it("renders every element type without a `node` attribute", () => {
    const { container } = render(<Markdown content={CONTENT} citations={[]} />);

    for (const tag of ["h1", "h2", "p", "ul", "ol", "li", "blockquote", "pre", "code", "table", "th", "td", "a", "hr"]) {
      expect(container.querySelector(tag)).not.toBeNull();
    }
    expect(container.querySelectorAll("[node]")).toHaveLength(0);
  });

  it("keeps heading ids and anchors", () => {
    const { container } = render(<Markdown content={CONTENT} citations={[]} />);
    const h1 = container.querySelector("h1")!;
    expect(h1.id).toBe("title");
    expect(h1.querySelector("a")).toHaveAttribute("href", "#title");
  });
});
