/**
 * F5.6 — cookie notice: shown on first visit, Accept (or ×) hides it across
 * reloads, "Cookie settings" reopens it, nothing rendered on the server.
 */
import React from "react";
import fs from "node:fs";
import path from "node:path";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { CookieNotice } from "@/components/legal/cookie-notice";
import { MarketingFooter } from "@/components/marketing/footer";
import {
  COOKIE_NOTICE_COOKIE,
  cookieNoticeCookie,
  hasAcknowledgedCookieNotice,
  openCookieNotice,
} from "@/lib/cookie-notice";
import { STORAGE_ITEMS } from "@/lib/legal/cookies";
import en from "@/messages/en.json";
import es from "@/messages/es.json";
import fr from "@/messages/fr.json";

jest.mock("next-intl", () => jest.requireActual("../test-utils/next-intl").nextIntlMock);
jest.mock("@/components/providers/site-config-provider", () => ({
  useSiteConfig: () => ({
    appName: "Klecx",
    emails: { support: "support@example.com" },
    company: { legalName: "Vyraxity", address: "Lagos" },
  }),
}));

function clearCookies() {
  for (const c of document.cookie.split(";")) {
    const name = c.split("=")[0]?.trim();
    if (name) document.cookie = `${name}=; Max-Age=0; Path=/`;
  }
}

beforeEach(clearCookies);

describe("F5.6 — cookie notice", () => {
  it("shows on first visit as a labelled region with Accept and a policy link", () => {
    render(<CookieNotice />);
    const region = screen.getByRole("region", { name: en.CookieNotice.label });
    expect(region).toHaveTextContent(en.CookieNotice.text.replace("{appName}", "Klecx"));
    expect(screen.getByRole("link", { name: en.CookieNotice.policy })).toHaveAttribute("href", "/cookies");
    expect(screen.getByRole("button", { name: en.CookieNotice.accept })).toBeInTheDocument();
  });

  it("Accept sets the cookie for 12 months and hides it, also after a reload", () => {
    const { unmount } = render(<CookieNotice />);
    fireEvent.click(screen.getByRole("button", { name: en.CookieNotice.accept }));
    expect(screen.queryByRole("region")).toBeNull();
    expect(hasAcknowledgedCookieNotice(document.cookie)).toBe(true);
    unmount();
    render(<CookieNotice />); // reload
    expect(screen.queryByRole("region")).toBeNull();
  });

  it("the close button behaves like Accept", () => {
    render(<CookieNotice />);
    fireEvent.click(screen.getByRole("button", { name: en.CookieNotice.close }));
    expect(screen.queryByRole("region")).toBeNull();
    expect(hasAcknowledgedCookieNotice(document.cookie)).toBe(true);
  });

  it('"Cookie settings" in the footer reopens it after it was accepted', () => {
    document.cookie = `${COOKIE_NOTICE_COOKIE}=1; Path=/`;
    render(
      <>
        <CookieNotice />
        <MarketingFooter />
      </>
    );
    expect(screen.queryByRole("region")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: en.Marketing.footer.cookieSettings }));
    expect(screen.getByRole("region", { name: en.CookieNotice.label })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: en.CookieNotice.accept }));
    expect(screen.queryByRole("region")).toBeNull();
    act(() => openCookieNotice());
    expect(screen.getByRole("region")).toBeInTheDocument();
  });

  it("renders nothing on the server (no hydration mismatch, no layout shift)", () => {
    // The server snapshot says "acknowledged", so the server HTML is empty.
    const { renderToString } = jest.requireActual("react-dom/server.node");
    expect(renderToString(<CookieNotice />)).toBe("");
  });

  it("writes the cookie the guide specifies", () => {
    expect(cookieNoticeCookie(true)).toBe("klecx_cookie_notice=1; Max-Age=31536000; Path=/; SameSite=Lax; Secure");
    expect(cookieNoticeCookie(false)).not.toContain("Secure");
    expect(hasAcknowledgedCookieNotice("a=1; klecx_cookie_notice=1")).toBe(true);
    expect(hasAcknowledgedCookieNotice("xklecx_cookie_notice=1")).toBe(false);
  });

  it("is listed in the Cookie Policy as essential, 12 months, translated", () => {
    const item = STORAGE_ITEMS.find((i) => i.names.includes(COOKIE_NOTICE_COOKIE));
    expect(item).toMatchObject({ kind: "cookie", category: "essential", duration: "oneYear" });
    for (const m of [en, es, fr]) {
      expect(typeof (m.Legal.cookies.purposes as Record<string, string>)[item!.purpose]).toBe("string");
      expect(m.CookieNotice.text).toContain("{appName}");
    }
  });

  it("is mounted for every page and keeps the consent-banner warning in the code", () => {
    expect(fs.readFileSync(path.join(process.cwd(), "app/layout.tsx"), "utf8")).toContain("<CookieNotice />");
    const src = fs.readFileSync(path.join(process.cwd(), "components/legal/cookie-notice.tsx"), "utf8");
    expect(src).toMatch(/consent banner/);
    expect(fs.existsSync(path.join(process.cwd(), "docs/compliance/cookies.md"))).toBe(true);
  });
});
