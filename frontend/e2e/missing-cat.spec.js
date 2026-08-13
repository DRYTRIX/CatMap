import { expect, test } from "@playwright/test";
import {
  MISSING_ID,
  dismissOnboarding,
  mockSightingApi,
  sightingFixture,
} from "./helpers";

test("add wizard switches to missing-cat fields", async ({ page }) => {
  await page.goto("/");
  await dismissOnboarding(page);

  await page.getByRole("button", { name: "Add cat" }).click();
  const dialog = page.getByRole("dialog").filter({ hasText: /add a cat sighting|report a missing cat/i });
  await expect(dialog).toBeVisible();

  await dialog.getByRole("radio", { name: "My cat is missing" }).click();
  await expect(dialog.getByRole("heading", { name: /report a missing cat/i })).toBeVisible();
});

test("missing-cat share sheet shows the missing badge and contact", async ({ page }) => {
  const sighting = sightingFixture({
    id: MISSING_ID,
    kind: "missing",
    cat_name: "Luna",
    contact: "finder@example.com",
    contact_public: true,
    description: "Grey tabby, blue collar",
    confirmations_count: 0,
  });
  await mockSightingApi(page, sighting);

  await page.goto(`/?s=${MISSING_ID}`);
  await dismissOnboarding(page);

  const dialog = page.getByRole("dialog").filter({ hasText: "Missing cat" });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(".kind-badge--missing")).toHaveText("Missing");
  await expect(dialog.getByText("Luna")).toBeVisible();
  await expect(dialog.getByRole("button", { name: /i've seen this cat/i })).toBeVisible();
});
