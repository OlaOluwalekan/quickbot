import fs from "fs";
import path from "path";

describe("Security: No public server actions", () => {
  function scanFiles(dir: string): string[] {
    const results: string[] = [];
    if (!fs.existsSync(dir)) return results;

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (
        entry.name === "node_modules" ||
        entry.name === ".next" ||
        entry.name === ".git"
      ) {
        continue;
      }
      if (entry.isDirectory()) {
        results.push(...scanFiles(fullPath));
      } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
        results.push(fullPath);
      }
    }
    return results;
  }

  test("no file in utils, server, app, or components should contain 'use server'", () => {
    const dirsToCheck = ["utils", "server", "app", "components"];
    const violations: string[] = [];

    for (const dir of dirsToCheck) {
      const fullDir = path.resolve(process.cwd(), dir);
      const files = scanFiles(fullDir);

      for (const file of files) {
        const content = fs.readFileSync(file, "utf8");
        if (content.includes('"use server"') || content.includes("'use server'")) {
          violations.push(path.relative(process.cwd(), file));
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
