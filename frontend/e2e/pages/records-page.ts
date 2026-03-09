import { Page, Locator, expect } from "@playwright/test";

export class RecordsPage {
  readonly page: Page;
  readonly newRecordBtn: Locator;
  readonly table: Locator;

  constructor(page: Page) {
    this.page = page;
    this.newRecordBtn = page.getByRole("main").getByRole("button", { name: /new record/i });
    this.table = page.getByTestId("records-table");
  }

  async goto(connId: string, ns: string, set: string) {
    await this.page.goto(`/browser/${connId}/${ns}/${set}`);
    await this.page.waitForLoadState("domcontentloaded");
    await this.page.waitForTimeout(1_000);
  }

  async openCreatePage() {
    await this.newRecordBtn.click();
    await expect(this.page.getByRole("heading", { name: "New Record" })).toBeVisible({
      timeout: 5_000,
    });
  }

  async fillRecordForm(pk: string, bins: { name: string; type: string; value: string }[]) {
    // Fill PK
    await this.page.getByPlaceholder("Record key").fill(pk);

    // Remove default bin if present, then add bins
    for (let i = 0; i < bins.length; i++) {
      const bin = bins[i];

      // Get all bin name inputs
      const binNameInputs = this.page.getByPlaceholder("Bin name");
      const binCount = await binNameInputs.count();

      if (i >= binCount) {
        // Add new bin row
        await this.page.getByRole("button", { name: "Add" }).click();
      }

      await binNameInputs.nth(i).fill(bin.name);

      // Select type if not string (default)
      if (bin.type !== "string") {
        // Find the type selector for this bin row
        const binRow = binNameInputs.nth(i).locator("..").locator("..");
        const typeSelect = binRow.locator("select").first();
        if ((await typeSelect.count()) > 0) {
          await typeSelect.selectOption(bin.type);
        }
      }

      // Fill value
      const valueInputs = this.page.locator(
        'input[placeholder="value"], input[placeholder="Value"]',
      );
      if ((await valueInputs.nth(i).count()) > 0) {
        await valueInputs.nth(i).fill(bin.value);
      }
    }
  }

  async submitCreate() {
    await this.page.getByRole("button", { name: "Create" }).click();
  }

  async submitUpdate() {
    await this.page.getByRole("button", { name: "Save" }).click();
  }

  async clickViewRecord(rowIndex = 0) {
    const row = this.page.getByTestId(`records-table-row-${rowIndex}`);
    await row.hover();
    await row.getByRole("button", { name: /View/i }).first().click();
  }

  async clickEditRecord(rowIndex = 0) {
    const row = this.page.getByTestId(`records-table-row-${rowIndex}`);
    await row.hover();
    await row.getByRole("button", { name: /Edit/i }).first().click();
  }

  async clickDuplicateRecord(rowIndex = 0) {
    const row = this.page.getByTestId(`records-table-row-${rowIndex}`);
    await row.hover();
    await row
      .getByRole("button", { name: /Duplicate/i })
      .first()
      .click();
  }

  async clickDeleteRecord(rowIndex = 0) {
    const row = this.page.getByTestId(`records-table-row-${rowIndex}`);
    await row.hover();
    await row
      .getByRole("button", { name: /Delete/i })
      .first()
      .click();
  }

  getPageSizeSelect(): Locator {
    return this.page.getByRole("combobox");
  }

  getPaginationButtons(): Locator {
    return this.page.locator("button[aria-label]").filter({ hasText: "" });
  }
}
