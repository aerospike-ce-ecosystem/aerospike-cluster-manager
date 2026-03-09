import { test, expect, Page } from "@playwright/test";
import { RecordsPage } from "../pages/records-page";
import { expectToast, screenshot, confirmDialog } from "../fixtures/base-page";
import {
  getTestConnectionId,
  TEST_NAMESPACE,
  TEST_SET,
  createTestRecord,
  cleanupTestRecords,
} from "../fixtures/test-data";

async function lookupRecordByPK(page: Page, pk: string) {
  await page.getByRole("button", { name: /Primary Key Lookup|PK/i }).click();
  const pkInput = page.getByPlaceholder("Primary key...");
  await pkInput.fill(pk);
  await pkInput.press("Enter");
}

test.describe("04 - Records CRUD", () => {
  let connId: string;
  let recordsPage: RecordsPage;

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    connId = await getTestConnectionId(page);
    await page.close();
  });

  test.beforeEach(async ({ page }) => {
    recordsPage = new RecordsPage(page);
  });

  test("1. Create a record with string + integer bins", async ({ page }) => {
    await recordsPage.goto(connId, TEST_NAMESPACE, TEST_SET);
    await recordsPage.openCreatePage();

    // Fill PK
    await page.getByPlaceholder("Record key").fill("e2e-record-1");

    // First bin (already present) — fill bin name and value
    const binNames = page.getByPlaceholder("Bin name");
    await binNames.first().fill("name");

    // Fill the value input (placeholder "Value" for string type)
    const valueInput = page.locator('input[placeholder="Value"]').first();
    await valueInput.fill("Alice");

    await recordsPage.submitCreate();
    await expectToast(page, /Record created/i);
    await screenshot(page, "04-01-record-created");
  });

  test("2. Record appears in table", async ({ page }) => {
    // Seed a record via API first
    await createTestRecord(page, connId, "e2e-table-check", {
      name: "TableCheck",
      age: 30,
    });

    await recordsPage.goto(connId, TEST_NAMESPACE, TEST_SET);
    await lookupRecordByPK(page, "e2e-table-check");

    // Should see the record PK in the table
    await expect(page.getByText("e2e-table-check").first()).toBeVisible({
      timeout: 10_000,
    });
    await screenshot(page, "04-02-record-in-table");
  });

  test("3. View record detail", async ({ page }) => {
    await createTestRecord(page, connId, "e2e-view-record", {
      name: "ViewMe",
      score: 99,
    });

    await recordsPage.goto(connId, TEST_NAMESPACE, TEST_SET);
    await lookupRecordByPK(page, "e2e-view-record");

    // Find the record row and click the View button (Eye icon)
    const row = page
      .locator("[data-testid^='records-table-row-']", { hasText: "e2e-view-record" })
      .first();
    await expect(row).toBeVisible({ timeout: 10_000 });
    await row.hover();
    // Action buttons: View(Eye), Edit(Pencil), Duplicate(Copy), Delete(Trash)
    // Use tooltip text to find the right button
    await row
      .locator("button")
      .filter({ has: page.locator("svg") })
      .first()
      .click();

    await expect(page).toHaveURL(/\/record\?pk=e2e-view-record/);
    await expect(page.getByRole("heading", { name: "Record Detail" })).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.getByText("e2e-view-record").first()).toBeVisible();
    await screenshot(page, "04-03-record-detail");
  });

  test("4. Edit a record", async ({ page }) => {
    await createTestRecord(page, connId, "e2e-edit-record", {
      name: "BeforeEdit",
      age: 20,
    });

    await recordsPage.goto(connId, TEST_NAMESPACE, TEST_SET);
    await lookupRecordByPK(page, "e2e-edit-record");

    const row = page
      .locator("[data-testid^='records-table-row-']", { hasText: "e2e-edit-record" })
      .first();
    await expect(row).toBeVisible({ timeout: 10_000 });
    await row.hover();
    // Click edit button (second action button with svg)
    const actionButtons = row.locator("button").filter({ has: page.locator("svg") });
    await actionButtons.nth(1).click();

    await expect(page).toHaveURL(/\/record\?pk=e2e-edit-record&intent=edit/);
    await expect(page.getByRole("heading", { name: "Edit Record" })).toBeVisible({
      timeout: 5_000,
    });

    // PK field should be disabled
    const pkInput = page.getByPlaceholder("Record key");
    await expect(pkInput).toBeDisabled();

    await screenshot(page, "04-04-edit-record");

    // Submit update
    await page.getByRole("button", { name: "Save" }).click();
    await expectToast(page, /Record updated/i);
  });

  test("5. Duplicate a record", async ({ page }) => {
    await createTestRecord(page, connId, "e2e-dup-source", {
      name: "DupSource",
      age: 40,
    });

    await recordsPage.goto(connId, TEST_NAMESPACE, TEST_SET);
    await lookupRecordByPK(page, "e2e-dup-source");

    const row = page
      .locator("[data-testid^='records-table-row-']", { hasText: "e2e-dup-source" })
      .first();
    await expect(row).toBeVisible({ timeout: 10_000 });
    await row.hover();
    // Click duplicate button (third action button with svg)
    const actionButtons = row.locator("button").filter({ has: page.locator("svg") });
    await actionButtons.nth(2).click();

    // Duplicate dialog — PK should be empty
    await expect(
      page
        .getByRole("dialog")
        .getByText(/Duplicate Record/i)
        .first(),
    ).toBeVisible({
      timeout: 5_000,
    });

    const pkInput = page.getByPlaceholder("Record key");
    await expect(pkInput).toBeEnabled();

    // Fill new PK
    await pkInput.fill("e2e-dup-copy");
    await page.getByRole("dialog").getByRole("button", { name: "Create" }).click();
    await expectToast(page, /Record (created|duplicated)/i);
    await screenshot(page, "04-05-duplicate-record");
  });

  test("6. Record with diverse data types", async ({ page }) => {
    await createTestRecord(page, connId, "e2e-types", {
      str_val: "hello",
      int_val: 42,
      float_val: 3.14,
      bool_val: true,
    });

    await recordsPage.goto(connId, TEST_NAMESPACE, TEST_SET);
    await lookupRecordByPK(page, "e2e-types");

    await expect(page.getByText("e2e-types").first()).toBeVisible({
      timeout: 10_000,
    });
    await screenshot(page, "04-06-diverse-types");
  });

  test("7. Delete record with confirmation", async ({ page }) => {
    await createTestRecord(page, connId, "e2e-delete-me", {
      name: "DeleteMe",
    });

    await recordsPage.goto(connId, TEST_NAMESPACE, TEST_SET);
    await lookupRecordByPK(page, "e2e-delete-me");

    const row = page
      .locator("[data-testid^='records-table-row-']", { hasText: "e2e-delete-me" })
      .first();
    await expect(row).toBeVisible({ timeout: 10_000 });
    await row.hover();
    // Click delete button (last action button)
    const actionButtons = row.locator("button").filter({ has: page.locator("svg") });
    await actionButtons.last().click();

    // Confirm dialog
    await confirmDialog(page, "Delete");
    await expectToast(page, /Record deleted/i);
    await screenshot(page, "04-07-record-deleted");
  });

  test("8. Pagination with 30+ records", async ({ page }) => {
    // Create 30 records sequentially (concurrent requests can overwhelm the backend)
    for (let i = 0; i < 30; i++) {
      await createTestRecord(page, connId, `e2e-page-${i.toString().padStart(2, "0")}`, {
        idx: i,
      });
    }

    await recordsPage.goto(connId, TEST_NAMESPACE, TEST_SET);
    await page.waitForTimeout(3_000);

    // Table should show records
    await expect(page.getByTestId("records-table")).toBeVisible({ timeout: 10_000 });

    await expect(recordsPage.getPageSizeSelect().first()).toBeVisible({ timeout: 10_000 });
    await screenshot(page, "04-08-pagination");
  });

  test("9. Page size change", async ({ page }) => {
    await recordsPage.goto(connId, TEST_NAMESPACE, TEST_SET);

    // Wait for pagination to be visible (requires enough records from test 8)
    const pageSizeTrigger = recordsPage.getPageSizeSelect().first();
    await expect(pageSizeTrigger).toBeVisible({ timeout: 15_000 });

    // Click the page size selector and choose 50
    await pageSizeTrigger.click();
    await page.getByRole("option", { name: "50", exact: true }).click();
    await page.waitForTimeout(2_000);
    await screenshot(page, "04-09-page-size");
  });

  test("10. Empty set shows EmptyState", async ({ page }) => {
    // Navigate to a set that doesn't exist
    await recordsPage.goto(connId, TEST_NAMESPACE, "empty_set_e2e");
    await page.waitForTimeout(3_000);

    await expect(page.getByText(/No Records/i).first()).toBeVisible({
      timeout: 10_000,
    });
    await screenshot(page, "04-10-empty-state");
  });

  test("11. Mobile cards open detail page and keep actions", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await createTestRecord(page, connId, "e2e-mobile-card", {
      name: "MobileCard",
      age: 31,
      city: "Seoul",
      tags: ["responsive", "mobile"],
    });

    await recordsPage.goto(connId, TEST_NAMESPACE, TEST_SET);
    await lookupRecordByPK(page, "e2e-mobile-card");

    const card = page
      .locator("[data-testid^='records-table-row-']", { hasText: "e2e-mobile-card" })
      .first();
    await expect(card).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("table")).toHaveCount(0);

    await card.click();
    await expect(page).toHaveURL(/\/record\?pk=e2e-mobile-card/);
    await expect(page.getByRole("heading", { name: "Record Detail" })).toBeVisible({
      timeout: 5_000,
    });
    await page.getByRole("button", { name: "Back" }).click();
    await expect(page).toHaveURL(new RegExp(`/browser/${connId}/${TEST_NAMESPACE}/${TEST_SET}`));

    await card.getByRole("button", { name: /Edit e2e-mobile-card/i }).click();
    await expect(page).toHaveURL(/\/record\?pk=e2e-mobile-card&intent=edit/);
    await expect(page.getByRole("heading", { name: "Edit Record" })).toBeVisible({
      timeout: 5_000,
    });
    await screenshot(page, "04-11-mobile-record-cards");
  });

  test("12. Tablet view keeps condensed table", async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 1200 });
    await createTestRecord(page, connId, "e2e-tablet-table", {
      name: "TabletTable",
      age: 45,
      city: "Busan",
    });

    await recordsPage.goto(connId, TEST_NAMESPACE, TEST_SET);
    await lookupRecordByPK(page, "e2e-tablet-table");

    await expect(page.getByTestId("records-table")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("table")).toBeVisible();
    await expect(page.getByTestId("records-table-head").getByText("PK")).toBeVisible();
    await expect(page.getByTestId("records-table-head").getByText("Gen")).toHaveCount(0);
    await expect(page.getByTestId("records-table-head").getByText("Expiry")).toHaveCount(0);

    const row = page
      .locator("[data-testid^='records-table-row-']", { hasText: "e2e-tablet-table" })
      .first();
    await expect(row).toBeVisible({ timeout: 10_000 });
    await row.hover();
    await expect(row.getByRole("button", { name: /View e2e-tablet-table/i })).toBeVisible();
    await screenshot(page, "04-12-tablet-record-table");
  });

  test.afterAll(async ({ browser }) => {
    const page = await browser.newPage();
    try {
      await cleanupTestRecords(page, connId, "e2e-");
    } finally {
      await page.close();
    }
  });
});
