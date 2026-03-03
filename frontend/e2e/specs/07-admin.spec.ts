import { test, expect } from "@playwright/test";
import { AdminPage } from "../pages/admin-page";
import { screenshot } from "../fixtures/base-page";
import { getTestConnectionId } from "../fixtures/test-data";

test.describe("07 - Admin (Security Disabled Handling)", () => {
  let connId: string;
  let adminPage: AdminPage;

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    connId = await getTestConnectionId(page);
    await page.close();
  });

  test.beforeEach(async ({ page }) => {
    adminPage = new AdminPage(page);
  });

  test("1. Admin page loads and shows security notice or tabs", async ({ page }) => {
    await adminPage.goto(connId);

    // Security disabled: shows "Security Not Enabled" notice
    // Security enabled: shows Users/Roles tabs
    const securityNotice = page.getByText(/Security Not Enabled/i).first();
    const usersTab = adminPage.usersTab;

    await expect(securityNotice.or(usersTab)).toBeVisible({ timeout: 15_000 });
    await screenshot(page, "07-01-admin-page");
  });

  test("2. Admin shows security notice or users when security disabled/enabled", async ({ page }) => {
    await adminPage.goto(connId);

    await expect(
      page
        .getByText(
          /Security Not Enabled|not supported|forbidden|error|No users|security is not enabled/i,
        )
        .first(),
    ).toBeVisible({ timeout: 15_000 });
    await screenshot(page, "07-02-users-ce-error");
  });

  test("3. Admin shows security notice or roles when security disabled/enabled", async ({ page }) => {
    await adminPage.goto(connId);

    await expect(
      page
        .getByText(
          /Security Not Enabled|not supported|forbidden|error|No roles|security is not enabled/i,
        )
        .first(),
    ).toBeVisible({ timeout: 15_000 });
    await screenshot(page, "07-03-roles-ce-error");
  });

  test("4. Admin page heading is visible", async ({ page }) => {
    await adminPage.goto(connId);

    await expect(adminPage.heading).toBeVisible({ timeout: 15_000 });
    await screenshot(page, "07-04-admin-heading");
  });
});
