import fs from "node:fs";
import path from "node:path";
import { isQueuedAsk } from "@/lib/annotations/anchor";
import { HIGHLIGHT_NAME_MAP } from "@/lib/annotations/highlight";
import { HIGHLIGHT_CSS } from "@/lib/annotations/highlight-styles";
import { createAnnotationSchema } from "@/lib/schemas/annotation";

const anchor = { exact: "some passage", prefix: "", suffix: "" };

describe("Step F2.1 — ASK kind (pure rules)", () => {
  it("isQueuedAsk: asked-now Asks (NONE) are not queued; any other state is", () => {
    expect(isQueuedAsk({ kind: "ASK", questionState: "NONE" })).toBe(false);
    expect(isQueuedAsk({ kind: "ASK" })).toBe(false);
    for (const s of ["QUEUED", "ANSWERING", "ANSWERED", "FAILED", "CANCELLED"]) {
      expect(isQueuedAsk({ kind: "ASK", questionState: s })).toBe(true);
    }
    expect(isQueuedAsk({ kind: "COMMENT", questionState: "QUEUED" })).toBe(false);
  });

  it("every highlight name has a ::highlight() rule, rendered by the root layout", () => {
    for (const name of [...Object.values(HIGHLIGHT_NAME_MAP), "annot-hover"]) {
      expect(HIGHLIGHT_CSS).toContain(`::highlight(${name})`);
    }
    const layout = fs.readFileSync(path.join(process.cwd(), "app/layout.tsx"), "utf8");
    expect(layout).toContain("HIGHLIGHT_CSS");
  });

  it("createAnnotationSchema: only COMMENT and ASK kinds are accepted", () => {
    expect(createAnnotationSchema.safeParse({ kind: "ASK", anchor, text: "why?" }).success).toBe(true);
    expect(createAnnotationSchema.safeParse({ kind: "COMMENT", anchor, text: "note" }).success).toBe(true);
    expect(createAnnotationSchema.safeParse({ kind: "QUESTION", anchor, text: "x" }).success).toBe(false);
    expect(createAnnotationSchema.safeParse({ kind: "REPLY", anchor, text: "x" }).success).toBe(false);
  });

  it("createAnnotationSchema: text limits are 500 for ASK and 2000 for COMMENT", () => {
    expect(createAnnotationSchema.safeParse({ kind: "ASK", anchor, text: "a".repeat(500) }).success).toBe(true);
    expect(createAnnotationSchema.safeParse({ kind: "ASK", anchor, text: "a".repeat(501) }).success).toBe(false);
    expect(createAnnotationSchema.safeParse({ kind: "COMMENT", anchor, text: "a".repeat(2000) }).success).toBe(true);
    expect(createAnnotationSchema.safeParse({ kind: "COMMENT", anchor, text: "a".repeat(2001) }).success).toBe(false);
  });

  it("createAnnotationSchema: mode is only allowed on ASK", () => {
    expect(createAnnotationSchema.safeParse({ kind: "ASK", mode: "queue", anchor, text: "q" }).success).toBe(true);
    expect(createAnnotationSchema.safeParse({ kind: "COMMENT", mode: "now", anchor, text: "c" }).success).toBe(false);
  });
});
