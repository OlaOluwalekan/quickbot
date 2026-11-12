import * as React from "react";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { Markdown } from "@/components/markdown";
import en from "@/messages/en.json";

function renderMarkdown(content: string, variant?: "answer" | "document") {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <Markdown content={content} variant={variant} />
    </NextIntlClientProvider>
  );
}

describe("Step F3.1 — rendering an uploaded document", () => {
  it("renders the HTML written inside a Markdown document", () => {
    const { container } = renderMarkdown(
      [
        '<h2 align="center">Release notes</h2>',
        "",
        "First line<br>second line with <kbd>Ctrl</kbd>",
        "",
        "<details><summary>More</summary>Hidden part</details>",
        "",
        "<table><tr><th>Name</th></tr><tr><td>Ada</td></tr></table>",
      ].join("\n"),
      "document"
    );

    expect(container.querySelector("h2")?.textContent).toBe("Release notes");
    expect(container.querySelector("br")).not.toBeNull();
    expect(container.querySelector("kbd")?.textContent).toBe("Ctrl");
    expect(container.querySelector("summary")?.textContent).toBe("More");
    expect(container.querySelector("td")?.textContent).toBe("Ada");
    expect(container.textContent).not.toContain("<h2");
  });

  it("removes scripts, styles, frames and event handlers from that HTML", () => {
    const { container } = renderMarkdown(
      [
        "<script>window.hacked = true</script>",
        '<p onclick="steal()" style="position:fixed">Safe text</p>',
        '<iframe src="https://example.com"></iframe>',
        '<a href="javascript:steal()">link</a>',
      ].join("\n\n"),
      "document"
    );

    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("iframe")).toBeNull();
    expect(container.querySelector("[onclick]")).toBeNull();
    expect(container.querySelector("[style]")).toBeNull();
    expect(container.innerHTML).not.toContain("javascript:");
    expect(container.textContent).toContain("Safe text");
    expect(container.textContent).not.toContain("hacked");
  });

  it("shows a placeholder box with the description for images it can't show", () => {
    const { container } = renderMarkdown(
      [
        "![Revenue chart]()",
        "",
        "![Team photo](./images/team.png)",
        "",
        '<img src="https://tracker.example.com/p.gif" alt="Remote picture">',
        "",
        "![]()",
      ].join("\n"),
      "document"
    );

    const boxes = screen.getAllByTestId("document-image-placeholder");
    expect(boxes).toHaveLength(4);
    expect(boxes[0]).toHaveTextContent("Revenue chart");
    expect(boxes[1]).toHaveTextContent("Team photo");
    expect(boxes[2]).toHaveTextContent("Remote picture");
    expect(boxes[3]).toHaveTextContent("Image");
    // Nothing is requested from another site.
    expect(container.querySelector("img")).toBeNull();
  });

  it("still renders formulas and tables in a document", () => {
    const { container } = renderMarkdown(
      "Energy: $E = mc^2$\n\n$$\n\\frac{a}{b}\n$$\n\n| A | B |\n| --- | --- |\n| 1<br>2 | 3 |",
      "document"
    );

    expect(container.querySelectorAll(".katex").length).toBe(2);
    expect(container.querySelector(".katex-display")).not.toBeNull();
    expect(container.querySelector("td br")).not.toBeNull();
  });

  it("keeps HTML as text in AI answers", () => {
    const { container } = renderMarkdown("<kbd>Ctrl</kbd> and <br> stay text");
    expect(container.querySelector("kbd")).toBeNull();
  });
});
