/**
 * Every error code the server can send has a translation in
 * `Errors.api.<code>` (en, es, fr), so the UI never has to show the server's
 * English message. The scan finds codes in `new ApiError(status, "code", …)`,
 * `Errors.x(…, "code")`, `DocumentExtractionError` and the AI error categories.
 * If this fails after you add a code, add `Errors.api.<code>` to messages/*.json.
 */
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import en from "@/messages/en.json";
import es from "@/messages/es.json";
import fr from "@/messages/fr.json";

const ROOT = path.resolve(__dirname, "..");

/** Default codes of the `Errors.*` helpers (server/http/errors.ts). */
const HELPER_DEFAULT: Record<string, string> = {
  badRequest: "bad_request",
  unauthorized: "unauthorized",
  paymentRequired: "insufficient_credits",
  forbidden: "forbidden",
  notFound: "not_found",
  conflict: "conflict",
  validation: "validation_error",
  unprocessable: "unprocessable_entity",
  contentBlocked: "content_blocked",
  rateLimited: "rate_limited",
};
/** Position of the optional `code` argument of an `Errors.*` helper. */
const HELPER_CODE_ARG: Record<string, number> = {
  badRequest: 1,
  forbidden: 1,
  conflict: 1,
  unprocessable: 1,
};

/** Codes sent by streams or created on the client (not found by the scan). */
const STREAM_AND_CLIENT_CODES = [
  "generation_error",
  "timeout_orphaned",
  "reply_error",
  "review_failed",
  "internal",
  "unknown",
  "network_error",
  "network",
  "connection",
];

function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "generated" || entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(full));
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

function collectCodes(): Map<string, string> {
  const codes = new Map<string, string>();
  const add = (code: string, file: string) => {
    if (!codes.has(code)) codes.set(code, path.relative(ROOT, file));
  };

  for (const file of [...listFiles(path.join(ROOT, "server")), ...listFiles(path.join(ROOT, "app/api"))]) {
    const sf = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
        const callee = node.expression.getText(sf);
        const args = node.arguments ?? ts.factory.createNodeArray();
        if (callee === "ApiError" || callee === "DocumentExtractionError") {
          const arg = args[callee === "ApiError" ? 1 : 0];
          if (arg && ts.isStringLiteral(arg)) add(arg.text, file);
        }
        const helper = callee.match(/^Errors\.(\w+)$/)?.[1];
        if (helper && helper in HELPER_DEFAULT) {
          const idx = HELPER_CODE_ARG[helper];
          const arg = idx !== undefined ? args[idx] : undefined;
          if (arg && ts.isStringLiteral(arg)) add(arg.text, file);
          else if (!arg) add(HELPER_DEFAULT[helper]!, file);
        }
      }
      // `type AiErrorCategory = "a" | "b"` and `DocumentExtractionErrorCode`
      if (
        ts.isTypeAliasDeclaration(node) &&
        ["AiErrorCategory", "DocumentExtractionErrorCode"].includes(node.name.text) &&
        ts.isUnionTypeNode(node.type)
      ) {
        for (const t of node.type.types) {
          if (ts.isLiteralTypeNode(t) && ts.isStringLiteral(t.literal)) add(t.literal.text, file);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  for (const code of STREAM_AND_CLIENT_CODES) add(code, "(stream/client)");
  return codes;
}

describe("F5.1 — every API error code is translated", () => {
  const codes = collectCodes();

  it("finds the codes (sanity check of the scan)", () => {
    expect(codes.size).toBeGreaterThan(40);
    expect(codes.has("username_taken")).toBe(true);
    expect(codes.has("rate_limit")).toBe(true); // AiErrorCategory
  });

  it.each([
    ["en", en],
    ["es", es],
    ["fr", fr],
  ])("%s has Errors.api.<code> for every code", (_locale, messages) => {
    const api = (messages as { Errors: { api: Record<string, string> } }).Errors.api;
    const missing = [...codes].filter(([code]) => typeof api[code] !== "string");
    expect(missing.map(([code, file]) => `${code} (${file})`)).toEqual([]);
  });
});
