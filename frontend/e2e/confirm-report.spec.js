import { expect, test } from "@playwright/test";
import {
  SIGHTING_ID,
  dismissOnboarding,
  mockSightingApi,
  sightingFixture,
} from "./helpers";

test("confirm increments the count and report dialog is available", async ({ page }) => {
  const sighting = sightingFixture({ confirmations_count: 2 });
  await mockSightingApi(page, sighting);

  await page.goto(`/?s=${SIGHTING_ID}`);
  await dismissOnboarding(page);

  const dialog = page.getByRole("dialog").filter({ hasText: "Cat sighting" });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(".count")).toHaveText("2");

  await dialog.getByRole("button", { name: /still here/i }).click();
  await expect(dialog.locator(".count")).toHaveText("3");
  await expect(dialog.getByRole("button", { name: /confirmed/i })).toBeDisabled();

  await dialog.getByRole("button", { name: /^report$/i }).click();
  await expect(page.getByRole("heading", { name: /report this sighting/i })).toBeVisible();
});
