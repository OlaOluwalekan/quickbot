/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import {
  getApiErrorMessage,
  LocalizedError,
  readApiError,
} from "@/lib/api/error-message";
import { GLOBAL_ERROR_COPY, resolveGlobalErrorLocale } from "@/lib/i18n/global-error";
import GlobalError from "@/app/global-error";
import { PLANS, PLAN_LOG_NAMES } from "@/server/billing/plans";
import enMessages from "@/messages/en.json";
import { createTranslator } from "../test-utils/next-intl";

describe("F5.1 — getApiErrorMessage", () => {
  const t = createTranslator();

  it("translates a known error code", () => {
    expect(getApiErrorMessage({ code: "rate_limited", message: "English dev text" }, t)).toBe(
      enMessages.Errors.api.rate_limited
    );
  });

  it("reads the code from a nested { error } body", () => {
    expect(getApiErrorMessage({ error: { code: "forbidden" } }, t)).toBe(
      enMessages.Errors.api.forbidden
    );
  });

  it("uses the action's fallback for unknown codes, never the server's English message", () => {
    const msg = getApiErrorMessage(
      { code: "some_unknown_code", message: "Internal English detail" },
      t,
      "Couldn't do the thing"
    );
    expect(msg).toBe("Couldn't do the thing");
  });

  it("falls back to the generic message without a fallback", () => {
    expect(getApiErrorMessage(new Error("boom"), t)).toBe(enMessages.Errors.api.generic);
  });

  it("passes through an already-translated LocalizedError", () => {
    expect(getApiErrorMessage(new LocalizedError("Déjà traduit"), t, "x")).toBe("Déjà traduit");
  });

  it("readApiError returns the body's error, or the status for non-JSON bodies", async () => {
    const json = new Response(JSON.stringify({ error: { code: "conflict", message: "x" } }), {
      status: 409,
    });
    await expect(readApiError(json)).resolves.toMatchObject({ code: "conflict" });
    const text = new Response("oops", { status: 500 });
    await expect(readApiError(text)).resolves.toEqual({ status: 500 });
  });
});

describe("F5.1 — plan names are message keys", () => {
  it("every plan's name, tagline and features resolve in en.json", () => {
    const lookup = (path: string) =>
      path.split(".").reduce<unknown>(
        (o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined),
        enMessages
      );
    for (const plan of Object.values(PLANS)) {
      for (const key of [plan.name, plan.tagline, ...plan.features]) {
        expect(typeof lookup(key)).toBe("string");
      }
    }
  });

  it("server-side messages use English plan names, not message keys", () => {
    for (const name of Object.values(PLAN_LOG_NAMES)) {
      expect(name).not.toMatch(/^Plans\./);
    }
  });
});

describe("F5.1 — global error page follows the chosen locale", () => {
  afterEach(() => {
    document.cookie = "NEXT_LOCALE=; expires=Thu, 01 Jan 1970 00:00:00 GMT";
  });

  it("has the same keys in every locale", () => {
    const keys = Object.keys(GLOBAL_ERROR_COPY.en).sort();
    expect(Object.keys(GLOBAL_ERROR_COPY.es).sort()).toEqual(keys);
    expect(Object.keys(GLOBAL_ERROR_COPY.fr).sort()).toEqual(keys);
  });

  it("reads the NEXT_LOCALE cookie", () => {
    document.cookie = "NEXT_LOCALE=fr";
    expect(resolveGlobalErrorLocale()).toBe("fr");
  });

  it("renders French copy when the locale cookie is fr", () => {
    document.cookie = "NEXT_LOCALE=fr";
    // global-error renders its own <html>; silence the nesting warning.
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    render(<GlobalError error={new Error("x")} reset={() => {}} />);
    expect(screen.getByText(GLOBAL_ERROR_COPY.fr.title)).toBeInTheDocument();
    spy.mockRestore();
  });
});
