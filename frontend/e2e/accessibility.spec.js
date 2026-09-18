import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import {
  catProfileFixture,
  dismissOnboarding,
  mockCatProfileApi,
  mockEmptyListApis,
  mockSightingApi,
  sightingFixture,
} from "./helpers";

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

test("the bottom nav opens My Cats with no detectable accessibility violations", async ({ page }) => {
  await mockEmptyListApis(page);
  await page.goto("/");
  await dismissOnboarding(page);
  await page.getByRole("button", { name: "My cats" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();

  const results = await new AxeBuilder({ page }).include('[role="dialog"]').analyze();
  expect(results.violations).toEqual([]);
});

test("the sighting detail sheet has no detectable accessibility violations", async ({ page }) => {
  const sighting = sightingFixture();
  await mockSightingApi(page, sighting);
  await page.goto(`/?s=${sighting.id}`);
  await dismissOnboarding(page);
  await expect(page.getByRole("dialog")).toBeVisible();

  const results = await new AxeBuilder({ page }).include('[role="dialog"]').analyze();
  expect(results.violations).toEqual([]);
});

test("the cat profile sheet has no detectable accessibility violations", async ({ page }) => {
  const cat = catProfileFixture();
  await mockCatProfileApi(page, cat);
  await page.goto(`/?c=${cat.id}`);
  await dismissOnboarding(page);
  await expect(page.getByRole("dialog")).toBeVisible();

  const results = await new AxeBuilder({ page }).include('[role="dialog"]').analyze();
  expect(results.violations).toEqual([]);
});

// Every screen reachable via the `?screen=` deep link (see App.jsx's
// SCREEN_NAMES) gets the same axe check, reached directly by URL rather than
// by clicking through the UI for each one.
const SCREENS = [
  ["recent", "Recent feed"],
  ["favorites", "Favorites"],
  ["watches", "Watches"],
  ["mySightings", "My Sightings"],
  ["catDirectory", "Cat Directory"],
  ["settings", "Settings"],
  ["account", "Account"],
  ["notifications", "Notifications"],
  ["offlineQueue", "Offline Queue"],
];

for (const [screen, label] of SCREENS) {
  test(`the ${label} screen has no detectable accessibility violations`, async ({ page }) => {
    await mockEmptyListApis(page);
    await page.goto(`/?screen=${screen}`);
    await dismissOnboarding(page);
    await expect(page.getByRole("dialog")).toBeVisible();

    const results = await new AxeBuilder({ page }).include('[role="dialog"]').analyze();
    expect(results.violations).toEqual([]);
  });
}
