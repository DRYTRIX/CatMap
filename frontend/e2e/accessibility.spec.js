import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { dismissOnboarding } from "./helpers";

test("home page has no detectable accessibility violations", async ({ page }) => {
  await page.goto("/");
  await dismissOnboarding(page);
  await expect(page.getByRole("button", { name: "Add cat" })).toBeVisible();

  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test("the add-sighting modal has no detectable accessibility violations", async ({ page }) => {
  await page.goto("/");
  await dismissOnboarding(page);
  await page.getByRole("button", { name: "Add cat" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();

  const results = await new AxeBuilder({ page }).include('[role="dialog"]').analyze();
  expect(results.violations).toEqual([]);
});

test("the filter panel has no detectable accessibility violations", async ({ page }) => {
  await page.goto("/");
  await dismissOnboarding(page);
  await page.getByRole("button", { name: "Map menu" }).click();
  await page.getByRole("menuitem", { name: "Filter cats" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();

  const results = await new AxeBuilder({ page }).include('[role="dialog"]').analyze();
  expect(results.violations).toEqual([]);
});
