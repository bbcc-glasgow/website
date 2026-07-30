import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { globSync } from "node:fs";

// Every built page must have zero axe violations (WCAG 2.1 AA) and
// no uncaught JavaScript errors or console.error calls during load.
// Routes are derived from dist/ so new pages are covered automatically.
const routes = globSync("dist/**/index.html").map(
  (p) => "/" + p.replace(/^dist\//, "").replace(/index\.html$/, ""),
);

test.describe("accessibility", () => {
  test("dist contains at least one page", () => {
    expect(routes.length).toBeGreaterThan(0);
  });

  for (const route of routes) {
    test(`axe scan: ${route}`, async ({ page }) => {
      // Collect uncaught JS errors and console.errors during page load.
      const jsErrors: string[] = [];
      page.on("pageerror", (err) => jsErrors.push(err.message));
      page.on("console", (msg) => {
        if (msg.type() === "error") jsErrors.push(msg.text());
      });

      await page.goto(route);

      // Assert no JS errors before running axe -- the page must load
      // without fatal runtime errors.
      expect(jsErrors).toEqual([]);

      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      expect(results.violations).toEqual([]);
    });
  }
});
