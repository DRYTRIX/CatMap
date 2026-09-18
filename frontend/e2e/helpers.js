/** Shared mock sighting payloads and API stubs for Playwright. */

export const SIGHTING_ID = "11111111-1111-4111-8111-111111111111";
export const MISSING_ID = "22222222-2222-4222-8222-222222222222";
export const CAT_ID = "33333333-3333-4333-8333-333333333333";

export function sightingFixture(overrides = {}) {
  const id = overrides.id || SIGHTING_ID;
  return {
    id,
    lat: 40.4,
    lng: -3.7,
    description: "Orange tabby by the bakery",
    confirmations_count: 2,
    created_at: new Date().toISOString(),
    last_seen_at: new Date().toISOString(),
    stale: false,
    photo_url: `/api/sightings/${id}/photo`,
    thumbnail_url: `/api/sightings/${id}/thumbnail`,
    photos: [],
    color: "orange",
    is_ear_tipped: null,
    is_stray: null,
    cat_id: null,
    kind: "sighting",
    status: "active",
    cat_name: null,
    contact: null,
    contact_public: false,
    is_mine: false,
    watching: false,
    ...overrides,
  };
}

export async function mockSightingApi(page, sighting) {
  let current = { ...sighting };

  await page.route("**/api/sightings/*/confirm", async (route) => {
    current = {
      ...current,
      confirmations_count: current.confirmations_count + 1,
    };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        confirmations: current.confirmations_count,
        already_confirmed: false,
      }),
    });
  });

  await page.route("**/api/sightings/*/report", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ reported: true, hidden: false }),
    });
  });

  await page.route(`**/api/sightings/${current.id}/comments**`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: "[]",
    });
  });

  await page.route(`**/api/sightings/${current.id}`, async (route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(current),
    });
  });

  await page.route("**/api/stats", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ total_cats: 1 }),
    });
  });

  return {
    get current() {
      return current;
    },
  };
}

export function catProfileFixture(overrides = {}) {
  const id = overrides.id || CAT_ID;
  return {
    id,
    name: "Whiskers",
    sighting_count: 0,
    first_seen_at: new Date().toISOString(),
    last_seen_at: new Date().toISOString(),
    color: null,
    is_ear_tipped: null,
    is_stray: null,
    is_mine: false,
    watching: false,
    hearted: false,
    hearts_count: 0,
    sightings: [],
    ...overrides,
  };
}

export async function mockCatProfileApi(page, cat) {
  await page.route(`**/api/cats/${cat.id}`, async (route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(cat),
    });
  });
}

/** Stub the list endpoints behind the content-browsing screens with an empty result, so each renders its (already-tested) empty state instead of hanging on a real network call. */
export async function mockEmptyListApis(page) {
  const emptyArrayRoutes = [
    "**/api/sightings/recent**",
    "**/api/watches**",
    "**/api/sightings/mine**",
    "**/api/cats?**",
    "**/api/notifications",
  ];
  for (const pattern of emptyArrayRoutes) {
    await page.route(pattern, async (route) => {
      if (route.request().method() !== "GET") {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "[]",
      });
    });
  }
}

export async function dismissOnboarding(page) {
  const skip = page.getByRole("button", { name: "Skip" });
  await skip.click({ timeout: 3000 }).catch(() => {});
}
