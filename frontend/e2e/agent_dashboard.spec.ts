import { test, expect } from "@playwright/test";

test.describe("Agent Dashboard", () => {
  test("navigating to Agents shows the dashboard heading", async ({ page }) => {
    await page.goto("/");
    await page.locator("nav").getByRole("button", { name: /Agents/i }).click();
    await expect(page.getByRole("heading", { name: "Agent Pool" })).toBeVisible();
  });

  test("shows empty state when pool has no slots", async ({ page }) => {
    await page.goto("/");
    await page.locator("nav").getByRole("button", { name: /Agents/i }).click();
    await expect(
      page.getByText("No agents running — dispatch a parallel task to spawn one.")
    ).toBeVisible();
  });

  test("header subtitle shows No agents running when pool is empty", async ({ page }) => {
    await page.goto("/");
    await page.locator("nav").getByRole("button", { name: /Agents/i }).click();
    // The subtitle paragraph (exact text, not the empty-state div)
    await expect(page.locator("p").filter({ hasText: /^No agents running$/ })).toBeVisible();
  });

  test("live AGENT_POOL_UPDATE event populates an agent card", async ({ page }) => {
    // Intercept WebSocket construction so we can inject a message later
    await page.addInitScript(() => {
      const OrigWS = window.WebSocket;
      class TrackableWS extends OrigWS {
        constructor(url: string | URL, protocols?: string | string[]) {
          super(url, protocols);
          (window as unknown as { __ws: TrackableWS }).__ws = this;
        }
      }
      window.WebSocket = TrackableWS as unknown as typeof WebSocket;
    });

    await page.goto("/");
    await page.locator("nav").getByRole("button", { name: /Agents/i }).click();

    // Wait for the WebSocket to open
    await page.waitForFunction(
      () => (window as unknown as { __ws: WebSocket }).__ws?.readyState === 1,
      { timeout: 10_000 }
    );

    // Inject a synthetic AGENT_POOL_UPDATE event
    await page.evaluate(() => {
      const ws = (window as unknown as { __ws: WebSocket }).__ws;
      ws.dispatchEvent(
        new MessageEvent("message", {
          data: JSON.stringify({
            type: "AGENT_POOL_UPDATE",
            slots: [
              {
                slot_id: "claude-0",
                status: "busy",
                current_task_id: "task-abc",
                current_task_title: "Test task title",
                uptime_seconds: 42,
                idle_since: null,
              },
            ],
            idle_timeout_seconds: 300,
          }),
        })
      );
    });

    // Agent card should appear in the main content area
    const main = page.locator("main, .flex-1").last();
    await expect(main.getByText("claude-0")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("Test task title")).toBeVisible();
    await expect(page.getByText("busy")).toBeVisible();
  });
});

test.describe("Chat panel", () => {
  test("renders chat input", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("textarea")).toBeVisible();
  });

  test("slash command menu opens on /", async ({ page }) => {
    await page.goto("/");
    const ta = page.locator("textarea");
    await ta.click();
    await ta.type("/");
    // The slash command menu button containing the /clear command
    await expect(
      page.getByRole("button", { name: /\/clear/ }).first()
    ).toBeVisible({ timeout: 3_000 });
  });

  test("/help command sends and receives done event", async ({ page }) => {
    await page.goto("/");
    await page.waitForTimeout(1500);

    const ta = page.locator("textarea");
    await ta.fill("/help");
    await ta.press("Enter");

    await expect(page.getByText(/Available commands/i)).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("Memory Browser", () => {
  test("navigating to Memory shows the browser heading", async ({ page }) => {
    await page.goto("/");
    await page.locator("nav").getByRole("button", { name: /Memory/i }).click();
    await expect(page.getByRole("heading", { name: "Memory Browser" })).toBeVisible();
  });

  test("filter buttons are rendered", async ({ page }) => {
    await page.goto("/");
    await page.locator("nav").getByRole("button", { name: /Memory/i }).click();
    await expect(page.getByRole("button", { name: "All memories" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Pinned only" })).toBeVisible();
    await expect(page.getByRole("button", { name: "This session" })).toBeVisible();
  });

  test("search input is present", async ({ page }) => {
    await page.goto("/");
    await page.locator("nav").getByRole("button", { name: /Memory/i }).click();
    await expect(page.getByPlaceholder("Search memories semantically...")).toBeVisible();
  });
});
