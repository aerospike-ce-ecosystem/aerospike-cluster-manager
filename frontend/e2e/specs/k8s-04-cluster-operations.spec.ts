import { test, expect } from "@playwright/test";
import {
  waitForK8sApi,
  createK8sClusterViaApi,
  waitForClusterPhase,
  cleanupK8sClusters,
  K8S_NAMESPACE,
} from "../fixtures/k8s-test-data";
import { expectToast, confirmDialog } from "../fixtures/base-page";

test.describe("K8s Cluster Operations", () => {
  const CLUSTER_NAME = "e2e-ops";

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(240_000);
    const page = await browser.newPage();
    const available = await waitForK8sApi(page);
    if (!available) {
      test.skip(true, "K8s API not available");
    }
    // Create a cluster via API for operations testing
    await cleanupK8sClusters(page);
    await createK8sClusterViaApi(page, CLUSTER_NAME);
    // Wait for it to be Completed (operator's stable phase)
    await waitForClusterPhase(page, K8S_NAMESPACE, CLUSTER_NAME, "Completed", 180_000);
    await page.close();
  });

  test.afterAll(async ({ browser }) => {
    const page = await browser.newPage();
    await cleanupK8sClusters(page);
    await page.close();
  });

  test("should show cluster detail page with tabs", async ({ page }) => {
    await page.goto(`/k8s/clusters/${K8S_NAMESPACE}/${CLUSTER_NAME}`);
    await page.waitForLoadState("domcontentloaded");

    // Overview tab should be visible
    await expect(page.getByText(CLUSTER_NAME).first()).toBeVisible({ timeout: 15_000 });

    // Check for tab navigation
    const podsTab = page.getByRole("tab", { name: /Pods/i }).or(page.getByText("Pods"));
    const eventsTab = page.getByRole("tab", { name: /Events/i }).or(page.getByText("Events"));

    await expect(podsTab.first()).toBeVisible();
    await expect(eventsTab.first()).toBeVisible();
  });

  test("should show pods in Pods tab", async ({ page }) => {
    await page.goto(`/k8s/clusters/${K8S_NAMESPACE}/${CLUSTER_NAME}`);
    await page.waitForLoadState("domcontentloaded");

    // Click Pods tab
    const podsTab = page.getByRole("tab", { name: /Pods/i }).or(page.getByText("Pods"));
    await podsTab.first().click();

    // Should show at least one pod
    await expect(page.getByText(`${CLUSTER_NAME}-`).first()).toBeVisible({ timeout: 15_000 });
  });

  test("should show events in Events tab", async ({ page }) => {
    await page.goto(`/k8s/clusters/${K8S_NAMESPACE}/${CLUSTER_NAME}`);
    await page.waitForLoadState("domcontentloaded");

    const eventsTab = page.getByRole("tab", { name: /Events/i }).or(page.getByText("Events"));
    await eventsTab.first().click();

    // Verify events section rendered — cluster creation always produces events
    await expect(
      page.getByText(/ServiceCreated|ConfigMapCreated|StatefulSetCreated|PDBCreated/).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  // Scale → Delete must run in order
  test.describe.serial("scale and delete", () => {
    test("should scale cluster", async ({ page }) => {
      test.setTimeout(180_000);

      await page.goto(`/k8s/clusters/${K8S_NAMESPACE}/${CLUSTER_NAME}`);
      await page.waitForLoadState("domcontentloaded");
      await expect(page.getByText(CLUSTER_NAME).first()).toBeVisible({ timeout: 15_000 });

      // Click Scale button
      const scaleBtn = page.getByRole("button", { name: /Scale/i });
      await expect(scaleBtn).toBeVisible();
      await scaleBtn.click();

      // Fill new size
      const sizeInput = page.locator("input[type=number]").last();
      await sizeInput.fill("2");

      // Confirm scale
      await page
        .getByRole("button", { name: /Scale|Confirm|Apply/i })
        .last()
        .click();
      await expectToast(page, /scale|success|initiated/i);

      // Wait for scale completion
      await waitForClusterPhase(page, K8S_NAMESPACE, CLUSTER_NAME, "Completed", 120_000);
    });

    test("should delete cluster", async ({ page }) => {
      await page.goto(`/k8s/clusters/${K8S_NAMESPACE}/${CLUSTER_NAME}`);
      await page.waitForLoadState("domcontentloaded");
      await expect(page.getByText(CLUSTER_NAME).first()).toBeVisible({ timeout: 15_000 });

      // Click Delete button
      const deleteBtn = page.getByRole("button", { name: /Delete/i });
      await expect(deleteBtn).toBeVisible();
      await deleteBtn.click();
      await confirmDialog(page, "Delete");
      await expectToast(page, /deleted|success/i);
    });
  });
});
