import { expect, test } from "@playwright/test";
import {
  SIGHTING_ID,
  dismissOnboarding,
  mockSightingApi,
  sightingFixture,
} from "./helpers";

test("share URL /s/{id} opens the sighting sheet with confirm and report", async ({ page }) => {
  await mockSightingApi(page, sightingFixture());

  await page.goto(`/?s=${SIGHTING_ID}`);
  await dismissOnboarding(page);

  await expect(page).toHaveURL(new RegExp(`[?&]s=${SIGHTING_ID}`));

  const dialog = page.getByRole("dialog").filter({ hasText: "Cat sighting" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: /still here/i })).toBeVisible();
  await expect(dialog.getByRole("button", { name: /^report$/i })).toBeVisible();
  await expect(dialog.getByRole("button", { name: /share/i })).toBeVisible();
});
