/**
 * @jest-environment node
 */

import {
  computeColumnLayout,
  parseThreadParam,
  serializeThreadParam,
  DEFAULT_LAYOUT_PREFS,
  type StackEntry,
} from "@/lib/annotations/thread-stack";

describe("Step F2.4 — Thread Stack Layout & Serialization Logic", () => {
  describe("1. URL thread parameter serialization & parsing", () => {
    it("handles null, empty, and invalid inputs", () => {
      expect(parseThreadParam(null)).toEqual([]);
      expect(parseThreadParam("")).toEqual([]);
      expect(parseThreadParam("invalid")).toEqual([]);
      expect(serializeThreadParam([])).toBe("");
    });

    it("parses single and multiple annotation/document tokens", () => {
      const param = "a:annot-1.a:annot-2.d:doc-3";
      const parsed = parseThreadParam(param);
      expect(parsed).toEqual([
        { kind: "annotation", id: "annot-1" },
        { kind: "annotation", id: "annot-2" },
        { kind: "document", id: "doc-3" },
      ]);

      const serialized = serializeThreadParam(parsed);
      expect(serialized).toBe(param);
    });

    it("ignores malformed segments gracefully", () => {
      const param = "a:123..d:456.something.a:";
      const parsed = parseThreadParam(param);
      expect(parsed).toEqual([
        { kind: "annotation", id: "123" },
        { kind: "document", id: "456" },
      ]);
    });
  });

  describe("2. computeColumnLayout() rules across widths & stack depths", () => {
    const widths = [1024, 1280, 1440, 1920] as const;
    const depths = [0, 1, 2, 3, 8, 25, 100] as const;

    it("levels = 0 always gives the main column full width for any screen width", () => {
      for (const w of widths) {
        const layout = computeColumnLayout(w, 0);
        expect(layout).toHaveLength(1);
        expect(layout[0]).toEqual({
          index: 0,
          mode: "full",
          width: w,
        });
      }
    });

    it("open L1 -> L2 -> L3 at 1280 px: main and L1 become spines, L2 and L3 are full", () => {
      // 3 levels open = main (0), L1 (1), L2 (2), L3 (3)
      const layout = computeColumnLayout(1280, 3);
      // Main (index 0) and L1 (index 1) are spines
      const spines = layout.filter((c) => c.mode === "spine");
      const full = layout.filter((c) => c.mode === "full");

      expect(spines).toHaveLength(2);
      expect(spines.map((s) => s.index)).toEqual([0, 1]);
      spines.forEach((s) => expect(s.width).toBe(44));

      expect(full).toHaveLength(2);
      expect(full.map((f) => f.index)).toEqual([2, 3]);
      // Each full column is >= colMin (420)
      full.forEach((f) => expect(f.width).toBeGreaterThanOrEqual(420));

      // Sum of widths equals available (1280)
      const totalWidth = layout.reduce((acc, c) => acc + c.width, 0);
      expect(totalWidth).toBe(1280);
    });

    it("desktop >= 1280 px with 1 level open (L1): both main and L1 are full", () => {
      const layout = computeColumnLayout(1280, 1);
      const full = layout.filter((c) => c.mode === "full");
      expect(full).toHaveLength(2);
      expect(layout.find((c) => c.index === 0)?.width).toBeGreaterThanOrEqual(480);
      expect(layout.find((c) => c.index === 1)?.width).toBeGreaterThanOrEqual(420);
    });

    it("never shows more than 3 full columns even at 1920 px", () => {
      for (const d of [3, 8, 25, 100]) {
        const layout = computeColumnLayout(1920, d);
        const full = layout.filter((c) => c.mode === "full");
        expect(full.length).toBeLessThanOrEqual(3);
      }
    });

    it("deep stacks (8, 25, 100 levels) group oldest spines into a single +N spine when spines > 6", () => {
      for (const w of widths) {
        for (const levels of [8, 25, 100]) {
          const layout = computeColumnLayout(w, levels);

          const spines = layout.filter((c) => c.mode === "spine");
          const full = layout.filter((c) => c.mode === "full");

          // At most 6 spines are rendered on screen (1 grouped + 5 individual)
          expect(spines.length).toBeLessThanOrEqual(6);

          // Deepest columns are full and readable
          expect(full.length).toBeGreaterThanOrEqual(1);
          full.forEach((c) => {
            expect(c.width).toBeGreaterThanOrEqual(420);
          });

          // The grouped spine is present when total spines would exceed 6
          const totalSpines = 1 + levels - full.length;
          if (totalSpines > 6) {
            const grouped = spines.find((s) => s.isGrouped);
            expect(grouped).toBeDefined();
            expect(grouped?.groupedCount).toBe(totalSpines - 5);
            expect(grouped?.width).toBe(44);
          }

          // Total spine strip width never exceeds 300 px
          const spineStripWidth = spines.reduce((sum, s) => sum + s.width, 0);
          expect(spineStripWidth).toBeLessThanOrEqual(300);

          // Total layout width matches available
          const totalWidth = layout.reduce((sum, c) => sum + c.width, 0);
          expect(totalWidth).toBe(w);
        }
      }
    });

    it("verifies all width and depth combinations adhere to min width contracts", () => {
      for (const w of widths) {
        for (const d of depths) {
          const layout = computeColumnLayout(w, d);
          const fullCols = layout.filter((c) => c.mode === "full");

          // Always at least 1 full column
          expect(fullCols.length).toBeGreaterThanOrEqual(1);
          expect(fullCols.length).toBeLessThanOrEqual(3);

          fullCols.forEach((col) => {
            const minExpected = col.index === 0 && d === 0 ? 0 : 420;
            if (minExpected > 0) {
              expect(col.width).toBeGreaterThanOrEqual(minExpected);
            }
          });

          const totalWidth = layout.reduce((sum, c) => sum + c.width, 0);
          expect(totalWidth).toBe(w);
        }
      }
    });
  });
});
