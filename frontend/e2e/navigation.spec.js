import { expect, test } from "@playwright/test";
import {
  dismissOnboarding,
  mockEmptyListApis,
  mockSightingApi,
  sightingFixture,
} from "./helpers";

/** Covers the `?screen=`/`?s=`/`?c=` URL-sync navigation layer in App.jsx:
 * screens are deep-linkable, survive a refresh, and respond to browser
 * back/forward instead of only the Capacitor hardware back button. */

test("opening a screen pushes a URL and browser back closes it", async ({ page }) => {
  await mockEmptyListApis(page);
  await page.goto("/");
  await dismissOnboarding(page);

  await page.getByRole("button", { name: "Watching" }).click();
  await expect(page).toHaveURL(/screen=watches/);
  await expect(page.getByRole("dialog")).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/^http:\/\/localhost:\d+\/$/);
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.goForward();
  await expect(page).toHaveURL(/screen=watches/);
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("selecting a sighting from within a screen stacks, and back returns to the screen", async ({ page }) => {
  const sighting = sightingFixture();
  await mockSightingApi(page, sighting);
  await page.route("**/api/watches**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        { id: "w1", target_type: "sighting", target_id: sighting.id },
      ]),
    });
  });

  await page.goto("/");
  await dismissOnboarding(page);
  await page.getByRole("button", { name: "Watching" }).click();
  await expect(page).toHaveURL(/screen=watches/);

  await page.getByRole("dialog").getByRole("listitem").first().click();
  await expect(page).toHaveURL(new RegExp(`s=${sighting.id}`));
  await expect(page.getByRole("dialog")).toBeVisible();

  // Back undoes just the sighting layer, returning to Watches.
  await page.goBack();
  await expect(page).toHaveURL(/screen=watches/);
  await expect(page).not.toHaveURL(/s=/);

  // Back again leaves the app entirely back at home.
  await page.goBack();
  await expect(page).toHaveURL(/^http:\/\/localhost:\d+\/$/);
});

test("a hard refresh on ?screen=recent restores the screen", async ({ page }) => {
  await mockEmptyListApis(page);
  await page.goto("/?screen=recent");
  await dismissOnboarding(page);
  await expect(page.getByRole("dialog")).toBeVisible();

  await page.reload();
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("closing via the X button navigates back to home", async ({ page }) => {
  await mockEmptyListApis(page);
  await page.goto("/");
  await dismissOnboarding(page);

  await page.getByRole("button", { name: "Watching" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();

  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page).toHaveURL(/^http:\/\/localhost:\d+\/$/);
});

test("Settings -> Report an issue switches screens without growing the back stack", async ({ page }) => {
  await page.goto("/");
  await dismissOnboarding(page);
  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page).toHaveURL(/screen=settings/);

  await page.getByRole("button", { name: "Report an issue" }).click();
  await expect(page).toHaveURL(/screen=reportIssue/);

  // One back should leave Settings/ReportIssue entirely (replaceState, not push).
  await page.goBack();
  await expect(page).toHaveURL(/^http:\/\/localhost:\d+\/$/);
});
