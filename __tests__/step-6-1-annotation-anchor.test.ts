/**
 * @jest-environment jsdom
 */

import nodeCrypto from "node:crypto";
import {
  selectionToAnchor,
  anchorToRange,
  textNodes,
  offsetOf,
  rangeFromOffsets,
  sim,
  allIndexesOf,
  applyCustomHighlights,
  clearCustomHighlights,
  isCustomHighlightSupported,
  getFallbackHighlightRects,
  type Anchor,
} from "@/lib/annotations";
import { db } from "@/server/db/client";

// Polyfill crypto.randomUUID for jsdom if needed by Prisma
if (typeof globalThis.crypto === "undefined") {
  Object.defineProperty(globalThis, "crypto", {
    value: nodeCrypto,
    writable: true,
    configurable: true,
  });
} else if (!globalThis.crypto.randomUUID) {
  try {
    Object.defineProperty(globalThis.crypto, "randomUUID", {
      value: () => nodeCrypto.randomUUID(),
      writable: true,
      configurable: true,
    });
  } catch {
    Object.defineProperty(globalThis, "crypto", {
      value: nodeCrypto,
      writable: true,
      configurable: true,
    });
  }
}

describe("Step 6.1 — Annotation schema and text anchoring", () => {
  let root: HTMLDivElement;

  afterAll(async () => {
    await db.$disconnect();
  });

  beforeEach(() => {
    root = document.createElement("div");
    root.setAttribute("data-annot-root", "true");
    document.body.appendChild(root);
  });

  afterEach(() => {
    document.body.removeChild(root);
  });

  describe("1. Text extraction & data-annot-ignore filtering", () => {
    it("collects text nodes while strictly skipping [data-annot-ignore] subtrees", () => {
      root.innerHTML = "<p>Before ignored content.</p><div data-annot-ignore=\"true\"><button>Copy code</button><span>Ignored metadata</span></div><p>After ignored content.</p>";

      const nodes = textNodes(root);
      const combinedText = nodes.map((n) => n.data).join("");

      expect(combinedText).toContain("Before ignored content.");
      expect(combinedText).toContain("After ignored content.");
      expect(combinedText).not.toContain("Copy code");
      expect(combinedText).not.toContain("Ignored metadata");
    });
  });

  describe("2. Selection to Anchor (W3C TextQuoteSelector)", () => {
    it("converts a DOM range into an Anchor with exact text, prefix, suffix, and offsets", () => {
      root.innerHTML = "<p>The quick brown fox jumps over the lazy dog near the riverbank.</p>";

      const p = root.querySelector("p")!;
      const textNode = p.firstChild as Text;

      const range = document.createRange();
      range.setStart(textNode, 16); // "fox jumps over"
      range.setEnd(textNode, 30);

      const anchor = selectionToAnchor(root, range);

      expect(anchor.exact).toBe("fox jumps over");
      expect(anchor.prefix).toBe("The quick brown ");
      expect(anchor.suffix).toBe(" the lazy dog near the riverbank");
      expect(anchor.start).toBe(16);
      expect(anchor.end).toBe(30);
    });

    it("handles selections spanning multiple nodes (bold, code, links)", () => {
      root.innerHTML = "<p>Start of paragraph <strong>bold term</strong> and <code>inlineFunc()</code> with a <a href=\"https://example.com\">doc link</a> end of paragraph.</p>";

      const strong = root.querySelector("strong")!.firstChild as Text;
      const a = root.querySelector("a")!.firstChild as Text;

      const range = document.createRange();
      range.setStart(strong, 5); // "term"
      range.setEnd(a, 3); // "doc"

      const anchor = selectionToAnchor(root, range);

      expect(anchor.exact).toBe("term and inlineFunc() with a doc");
      expect(anchor.prefix).toBe("Start of paragraph bold ");
      expect(anchor.suffix).toBe(" link end of paragraph.");
    });
  });

  describe("3. Anchor to DOM Range restoration", () => {
    it("fast path: restores range accurately when text is unchanged", () => {
      root.innerHTML = "<p>Distributed systems require reliable consensus algorithms like Raft.</p>";

      const p = root.querySelector("p")!;
      const textNode = p.firstChild as Text;

      const start = "Distributed systems require reliable ".length;
      const end = start + "consensus algorithms".length;

      const originalRange = document.createRange();
      originalRange.setStart(textNode, start);
      originalRange.setEnd(textNode, end);

      const anchor = selectionToAnchor(root, originalRange);
      const restoredRange = anchorToRange(root, anchor);

      expect(restoredRange).not.toBeNull();
      expect(restoredRange!.toString()).toBe("consensus algorithms");
      expect(restoredRange!.startOffset).toBe(start);
      expect(restoredRange!.endOffset).toBe(end);
    });

    it("shifts path: locates exact text when new paragraphs are inserted before it", () => {
      // Step A: Original text
      root.innerHTML = "<p>Target paragraph with unique mission statement.</p>";
      const p1 = root.querySelector("p")!;
      const originalRange = document.createRange();
      originalRange.setStart(p1.firstChild as Text, 22);
      originalRange.setEnd(p1.firstChild as Text, 47); // "unique mission statement."
      const anchor = selectionToAnchor(root, originalRange);

      // Step B: Text shifted down by prepending 3 new paragraphs
      root.innerHTML = "<h2>Introduction</h2><p>This is newly inserted background context paragraph 1.</p><p>This is newly inserted background context paragraph 2.</p><p>Target paragraph with unique mission statement.</p>";

      const restoredRange = anchorToRange(root, anchor);

      expect(restoredRange).not.toBeNull();
      expect(restoredRange!.toString()).toBe("unique mission statement.");
    });

    it("disambiguation: selects the correct instance of repeated phrases using prefix/suffix context", () => {
      root.innerHTML = "<p>In Phase 1, deploy the worker service to staging.</p><p>In Phase 2, deploy the worker service to production.</p>";

      const ps = root.querySelectorAll("p");
      const pSecond = ps[1]!;

      // Anchor second instance ("deploy the worker service")
      const rangeSecond = document.createRange();
      rangeSecond.setStart(pSecond.firstChild as Text, 12);
      rangeSecond.setEnd(pSecond.firstChild as Text, 37);

      const anchorSecond = selectionToAnchor(root, rangeSecond);
      expect(anchorSecond.exact).toBe("deploy the worker service");
      expect(anchorSecond.prefix).toContain("In Phase 2, ");
      expect(anchorSecond.suffix).toContain(" to production.");

      const restored = anchorToRange(root, anchorSecond);

      expect(restored).not.toBeNull();
      expect(restored!.toString()).toBe("deploy the worker service");
      const parentP = restored!.startContainer.parentElement;
      expect(parentP?.textContent).toContain("production");
      expect(parentP?.textContent).not.toContain("staging");
    });

    it("detached anchors: returns null when the exact text was deleted or replaced", () => {
      const anchor: Anchor = {
        exact: "The obsolete architecture diagram",
        prefix: "Please review ",
        suffix: " before the meeting.",
        start: 14,
        end: 47,
      };

      root.innerHTML = "<p>Please review the modern microservices blueprint before the meeting.</p>";

      const restored = anchorToRange(root, anchor);
      expect(restored).toBeNull(); // cleanly marked detached, never attached to unrelated text
    });

    it("restores ranges across complex Markdown structures (lists and table cells)", () => {
      root.innerHTML = "<table><thead><tr><th>Feature</th><th>Status</th></tr></thead><tbody><tr><td>Text Anchoring</td><td>In Progress</td></tr><tr><td>Document Export</td><td>Complete</td></tr></tbody></table><ul><li>First bullet with <code>code snippet</code></li><li>Second bullet with <em>italicized notes</em></li></ul>";

      const td = root.querySelectorAll("td")[2]!; // "Document Export"
      const tdRange = document.createRange();
      tdRange.selectNodeContents(td);
      const tdAnchor = selectionToAnchor(root, tdRange);

      const restoredTd = anchorToRange(root, tdAnchor);
      expect(restoredTd).not.toBeNull();
      expect(restoredTd!.toString()).toBe("Document Export");

      const liEm = root.querySelector("li em")!.firstChild as Text;
      const emRange = document.createRange();
      emRange.selectNodeContents(liEm);
      const emAnchor = selectionToAnchor(root, emRange);

      const restoredEm = anchorToRange(root, emAnchor);
      expect(restoredEm).not.toBeNull();
      expect(restoredEm!.toString()).toBe("italicized notes");
    });
  });

  describe("4. Custom Highlight API and overlay fallback", () => {
    it("reports false when CSS Custom Highlight API is unsupported in test runner", () => {
      expect(isCustomHighlightSupported()).toBe(false);
      const res = applyCustomHighlights([]);
      expect(res).toBe(false);
    });

    it("registers named highlights when CSS.highlights is polyfilled/supported", () => {
      class MockHighlight {
        public ranges: Range[];
        constructor(...ranges: Range[]) {
          this.ranges = ranges;
        }
      }

      const highlightsMap = new Map<string, unknown>();
      const mockCSS = {
        highlights: {
          set: (name: string, hl: unknown) => highlightsMap.set(name, hl),
          delete: (name: string) => highlightsMap.delete(name),
          get: (name: string) => highlightsMap.get(name),
        },
      };

      (globalThis as unknown as { CSS: typeof mockCSS }).CSS = mockCSS;
      (globalThis as unknown as { Highlight: typeof MockHighlight }).Highlight =
        MockHighlight;

      try {
        expect(isCustomHighlightSupported()).toBe(true);

        root.innerHTML = "<p>Annotated passage for testing highlight groups.</p>";
        const range1 = document.createRange();
        range1.selectNodeContents(root.querySelector("p")!);

        const success = applyCustomHighlights([
          { kind: "COMMENT", ranges: [range1] },
        ]);
        expect(success).toBe(true);
        expect(highlightsMap.has("annot-comment")).toBe(true);

        clearCustomHighlights();
        expect(highlightsMap.has("annot-comment")).toBe(false);
      } finally {
        delete (globalThis as unknown as { CSS?: unknown }).CSS;
        delete (globalThis as unknown as { Highlight?: unknown }).Highlight;
      }
    });

    it("computes fallback overlay coordinates from range.getClientRects()", () => {
      root.innerHTML = "<p>Passage with bounding boxes.</p>";
      const p = root.querySelector("p")!;
      const range = document.createRange();
      range.selectNodeContents(p);

      // Mock getBoundingClientRect on root in jsdom
      root.getBoundingClientRect = () =>
        ({
          top: 100,
          left: 50,
          bottom: 150,
          right: 250,
          width: 200,
          height: 50,
          x: 50,
          y: 100,
          toJSON: () => ({}),
        } as DOMRect);

      // Define getClientRects on range in jsdom
      range.getClientRects = () =>
        [
          {
            top: 110,
            left: 60,
            bottom: 130,
            right: 180,
            width: 120,
            height: 20,
            x: 60,
            y: 110,
            toJSON: () => ({}),
          },
        ] as unknown as DOMRectList;

      const rects = getFallbackHighlightRects(range, root);

      expect(rects.length).toBe(1);
      expect(rects[0]!.top).toBe(10); // 110 - 100
      expect(rects[0]!.left).toBe(10); // 60 - 50
      expect(rects[0]!.width).toBe(120);
      expect(rects[0]!.height).toBe(20);
    });
  });

  describe("5. Prisma Database Schema & Relations for Annotations", () => {
    it("creates and retrieves Annotation and AnnotationMessage rows", async () => {
      const suffix = Date.now();
      const user = await db.user.create({
        data: {
          id: `user_annot_${suffix}`,
          email: `annot_${suffix}@example.com`,
          name: "Annotation Tester",
        },
      });

      const ws = await db.workspace.create({
        data: {
          ownerId: user.id,
          title: "Annotation Test Workspace",
        },
      });

      const response = await db.response.create({
        data: {
          workspaceId: ws.id,
          createdById: user.id,
          prompt: "Tell me about distributed transactions",
          kind: "TEXT",
          origin: "DIRECT",
        },
      });

      const version = await db.responseVersion.create({
        data: {
          responseId: response.id,
          number: 1,
          status: "COMPLETE",
          content: "Two-phase commit ensures atomicity across distributed systems.",
          modelKey: "text-standard",
          providerModelId: "gemini-2.5-flash",
          promptVersion: "v1",
          createdById: user.id,
        },
      });

      // Create Annotation
      const annotation = await db.annotation.create({
        data: {
          workspaceId: ws.id,
          responseId: response.id,
          versionId: version.id,
          contentSource: "ORIGINAL",
          createdById: user.id,
          kind: "COMMENT",
          questionState: "NONE",
          visibility: "PRIVATE",
          anchorExact: "Two-phase commit ensures atomicity",
          anchorPrefix: "",
          anchorSuffix: " across distributed systems.",
          anchorStart: 0,
          anchorEnd: 33,
          messages: {
            create: [
              {
                role: "USER",
                content: "Is this also known as 2PC?",
                authorId: user.id,
              },
            ],
          },
        },
        include: {
          messages: true,
          createdBy: true,
          version: true,
        },
      });

      expect(annotation.id).toBeDefined();
      expect(annotation.kind).toBe("COMMENT");
      expect(annotation.visibility).toBe("PRIVATE");
      expect(annotation.anchorExact).toBe("Two-phase commit ensures atomicity");
      expect(annotation.messages.length).toBe(1);
      expect(annotation.messages[0]!.content).toBe("Is this also known as 2PC?");
      expect(annotation.messages[0]!.role).toBe("USER");

      // Verify cascade delete: deleting workspace deletes annotation & messages
      await db.workspace.delete({ where: { id: ws.id } });
      const deletedAnnot = await db.annotation.findUnique({
        where: { id: annotation.id },
      });
      expect(deletedAnnot).toBeNull();

      await db.user.delete({ where: { id: user.id } });
    });
  });
});

