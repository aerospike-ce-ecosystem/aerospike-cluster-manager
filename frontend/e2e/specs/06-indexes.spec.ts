import { test, expect } from "@playwright/test";
import { IndexesPage } from "../pages/indexes-page";
import { expectToast, screenshot, confirmDialog } from "../fixtures/base-page";
import {
  getTestConnectionId,
  TEST_NAMESPACE,
  TEST_SET,
  TEST_INDEX_NAME,
} from "../fixtures/test-data";

test.describe("06 - Secondary Indexes", () => {
  let connId: string;
  let indexesPage: IndexesPage;

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    connId = await getTestConnectionId(page);
    await page.close();
  });

  test.beforeEach(async ({ page }) => {
    indexesPage = new IndexesPage(page);
  });

  test("1. Indexes page loads", async ({ page }) => {
    await indexesPage.goto(connId);
    await expect(indexesPage.heading).toBeVisible();
    await screenshot(page, "06-01-indexes-page");
  });

  test("2. Create a numeric index", async ({ page }) => {
    await indexesPage.goto(connId);
    await indexesPage.openCreateDialog();

    await indexesPage.fillIndexForm({
      namespace: TEST_NAMESPACE,
      set: TEST_SET,
      bin: "age",
      name: TEST_INDEX_NAME,
      type: "numeric",
    });

    await indexesPage.submitCreate();
    await expectToast(page, /Index created/i);
    await screenshot(page, "06-02-index-created");
  });

  test("3. Index table shows metadata", async ({ page }) => {
    await indexesPage.goto(connId);

    // Wait for index to appear
    await page.waitForTimeout(2_000);

    const table = indexesPage.getTable();
    if ((await table.count()) > 0) {
      // Should show namespace, bin, type
      await expect(page.getByText(TEST_NAMESPACE).first()).toBeVisible({
        timeout: 10_000,
      });
      await expect(page.getByText("age").first()).toBeVisible();
      await expect(page.getByText(/numeric/i).first()).toBeVisible();
    }
    await screenshot(page, "06-03-index-metadata");
  });

  test("4. Validation — required fields", async ({ page }) => {
    await indexesPage.goto(connId);
    await indexesPage.openCreateDialog();

    // Create button should be disabled when required fields are empty
    const createBtn = page.getByRole("dialog").getByRole("button", { name: "Create" });
    await expect(createBtn).toBeDisabled();

    // Dialog should remain open
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await screenshot(page, "06-04-validation");

    // Close
    await page.getByRole("button", { name: "Cancel" }).click();
  });

  test("5. Mobile index cards show actions", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await indexesPage.goto(connId);
    await page.waitForTimeout(2_000);

    const card = page
      .locator("[data-testid^='indexes-table-row-']", { hasText: TEST_INDEX_NAME })
      .first();
    if ((await card.count()) > 0) {
      await expect(card).toBeVisible({ timeout: 10_000 });
      await expect(page.locator("table")).toHaveCount(0);
      await expect(card.getByRole("button", { name: /Delete index/i })).toBeVisible();
    }
    await screenshot(page, "06-05-index-mobile-cards");
  });

  test("6. Delete an index", async ({ page }) => {
    await indexesPage.goto(connId);
    await page.waitForTimeout(2_000);

    // Try to delete the index we created
    const row = page.locator("tr", { hasText: TEST_INDEX_NAME });
    if ((await row.count()) > 0) {
      await indexesPage.deleteIndex(TEST_INDEX_NAME);
      await confirmDialog(page, "Delete");
      await expectToast(page, /Index deleted/i);
    }
    await screenshot(page, "06-06-index-deleted");
  });
});
