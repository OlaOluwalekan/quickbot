import Home from "@/app/(marketing)/page";
import QueryProvider from "@/components/providers/query-provider";
import { render, screen } from "@testing-library/react";
import enMessages from "@/messages/en.json";

function getNestedValue(obj: any, path: string): any {
  if (!obj || !path) return undefined;
  return path.split(".").reduce((acc, part) => (acc ? acc[part] : undefined), obj);
}

jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: jest.fn(),
    refresh: jest.fn(),
  }),
  usePathname: () => "/",
}));

jest.mock("next-intl", () => ({
  useTranslations: (namespace?: string) => {
    return (key: string, values?: Record<string, any>) => {
      let resolved: any;
      if (namespace) {
        resolved = getNestedValue(enMessages, `${namespace}.${key}`);
      }
      if (resolved === undefined) {
        resolved = getNestedValue(enMessages, key);
      }
      if (resolved === undefined) {
        resolved = getNestedValue(enMessages, `Common.${key}`);
      }
      if (resolved === undefined) {
        resolved = key;
      }
      if (typeof resolved === "string" && values) {
        Object.entries(values).forEach(([k, v]) => {
          resolved = resolved.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
        });
      }
      return resolved;
    };
  },
  useLocale: () => "en",
}));

describe("Home Component", () => {
  it("renders the Klecx marketing landing page correctly", () => {
    render(
      <QueryProvider>
        <Home />
      </QueryProvider>
    );

    // Check that headline is rendered
    expect(
      screen.getByRole("heading", { level: 1, name: /think in workspaces, not threads/i })
    ).toBeInTheDocument();

    // Check that CTAs are present
    expect(screen.getAllByRole("link", { name: /start free/i }).length).toBeGreaterThan(0);
  });
});
