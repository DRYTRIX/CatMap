import { expect, test } from "@playwright/test";

test("opening the add-sighting wizard shows the photo requirements as pending", async ({ page }) => {
  await page.goto("/");

  const addButton = page.getByRole("button", { name: "Add cat" });
  await expect(addButton).toBeVisible();
  await addButton.click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading", { name: /add a cat sighting/i })).toBeVisible();

  // No photo selected yet: can't proceed, and every requirement is pending.
  await expect(dialog.getByRole("button", { name: "Next" })).toBeDisabled();
  await expect(dialog.getByLabel("Photo added: pending")).toBeVisible();
  await expect(dialog.getByLabel("Photos analyzed: pending")).toBeVisible();
  await expect(dialog.getByLabel("Cat detected: pending")).toBeVisible();

  // Escape closes the wizard.
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
});
