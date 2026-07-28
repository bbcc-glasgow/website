import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { globSync } from "node:fs";

// Every built page must have zero axe violations (WCAG 2.1 AA).
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
      await page.goto(route);
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      expect(results.violations).toEqual([]);
    });
  }
});
