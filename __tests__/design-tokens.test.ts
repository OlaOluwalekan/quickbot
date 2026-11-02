import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { formatNumber } from "@/utils/format";

const ROOT = process.cwd();

describe("Step 3.1 — Design tokens and dependency cleanup", () => {
  it("passes scripts/check-tokens.mjs with zero violations", () => {
    const output = execFileSync(
      process.execPath,
      [path.join(ROOT, "scripts/check-tokens.mjs")],
      { encoding: "utf8" }
    );
    expect(output).toContain("Design token check passed");
  });

  it("defines light, dark, and @theme inline semantic tokens in app/globals.css", () => {
    const css = fs.readFileSync(path.join(ROOT, "app/globals.css"), "utf8");
    const requiredTokens = [
      "--bg:",
      "--surface:",
      "--surface-2:",
      "--surface-3:",
      "--border:",
      "--border-strong:",
      "--fg:",
      "--fg-muted:",
      "--fg-subtle:",
      "--accent:",
      "--accent-hover:",
      "--accent-fg:",
      "--accent-soft:",
      "--success:",
      "--warning:",
      "--danger:",
      "--info:",
      "--ring:",
      "--overlay:",
      "--mark-comment:",
      "--mark-question:",
      "--mark-reply:",
      "--radius-sm:",
      "--radius:",
      "--radius-lg:",
      "--radius-xl:",
      "--shadow-sm:",
      "--shadow-md:",
      "--shadow-lg:",
      "--dur-fast:",
      "--dur:",
      "--dur-slow:",
      "--sidebar-w:",
      "--sidebar-w-collapsed:",
      "--panel-w:",
      "--content-w:",
    ];

    for (const token of requiredTokens) {
      expect(css).toContain(token);
    }

    expect(css).toContain('[data-theme="dark"]');
    expect(css).toContain("@theme inline");
    expect(css).toContain("prefers-reduced-motion: reduce");
  });

  it("has removed legacy packages and installed new UI packages in package.json", () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(ROOT, "package.json"), "utf8")
    );
    const allDeps = {
      ...(pkg.dependencies || {}),
      ...(pkg.devDependencies || {}),
    };

    const removedPackages = [
      "axios",
      "crypto-js",
      "numeral",
      "uuid",
      "react-spinners",
      "react-icons",
      "react-hot-toast",
      "tailwind-scrollbar",
      "postcss-import",
      "marked",
      "remark",
      "remark-html",
      "redux-mock-store",
      "@types/crypto-js",
      "@types/numeral",
      "@types/uuid",
    ];

    for (const removed of removedPackages) {
      expect(allDeps).not.toHaveProperty(removed);
    }

    const addedPackages = [
      "next-themes",
      "lucide-react",
      "clsx",
      "tailwind-merge",
      "class-variance-authority",
      "sonner",
    ];

    for (const added of addedPackages) {
      expect(pkg.dependencies).toHaveProperty(added);
    }
  });

  it("has deleted legacy theme files and created docs/design.md", () => {
    expect(
      fs.existsSync(path.join(ROOT, "providers/ThemeProvider.tsx"))
    ).toBe(false);
    expect(fs.existsSync(path.join(ROOT, "components/theme/Theme.tsx"))).toBe(
      false
    );
    expect(fs.existsSync(path.join(ROOT, "data/theme.ts"))).toBe(false);
    expect(fs.existsSync(path.join(ROOT, "docs/design.md"))).toBe(true);
  });

  it("formats numbers with Intl.NumberFormat instead of numeral", () => {
    expect(formatNumber(0)).toBe("0");
    expect(formatNumber(1234567)).toBe("1,234,567");
    expect(formatNumber(1234.5, "0,0.00")).toBe("1,234.50");
  });
});
