import { test, expect } from "@playwright/test";

/** Shared initScript that replaces WebSocket with a self-opening mock.
 *  The mock:
 *  - auto-opens (readyState → 1) after 50 ms without a real backend
 *  - exposes itself as window.__ws
 *  - records every sent string in window.__sentMessages
 *  - routes dispatchEvent("message") through this.onmessage so
 *    synthetic WS messages work with agentSocket.ts's direct property handlers
 */
const mockWsScript = () => {
  (window as unknown as { __sentMessages: string[] }).__sentMessages = [];

  class MockWS extends EventTarget {
    readyState = 0;
    onopen: ((e: Event) => void) | null = null;
    onmessage: ((e: MessageEvent) => void) | null = null;
    onclose: ((e: CloseEvent) => void) | null = null;
    onerror: ((e: Event) => void) | null = null;

    constructor(_url: string) {
      super();
      (window as unknown as { __ws: MockWS }).__ws = this;
      setTimeout(() => {
        this.readyState = 1; // OPEN
        const e = new Event("open");
        if (this.onopen) this.onopen(e);
        super.dispatchEvent(e);
      }, 50);
    }

    send(data: string) {
      (window as unknown as { __sentMessages: string[] }).__sentMessages.push(data);
    }

    close() {
      this.readyState = 3;
    }

    dispatchEvent(event: Event): boolean {
      if (event.type === "message" && this.onmessage) {
        this.onmessage(event as MessageEvent);
      }
      return super.dispatchEvent(event);
    }
  }

  // Static constants required by agentSocket.ts's readyState guards
  (MockWS as unknown as Record<string, number>).CONNECTING = 0;
  (MockWS as unknown as Record<string, number>).OPEN = 1;
  (MockWS as unknown as Record<string, number>).CLOSING = 2;
  (MockWS as unknown as Record<string, number>).CLOSED = 3;

  window.WebSocket = MockWS as unknown as typeof WebSocket;
};

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
    await expect(page.locator("p").filter({ hasText: /^No agents running$/ })).toBeVisible();
  });

  test("live AGENT_POOL_UPDATE event populates an agent card", async ({ page }) => {
    await page.addInitScript(mockWsScript);

    await page.goto("/");
    await page.locator("nav").getByRole("button", { name: /Agents/i }).click();

    // Wait for the mock WebSocket to auto-open
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

test.describe("/dispatch command", () => {
  test("sends a dispatch message over WebSocket", async ({ page }) => {
    await page.addInitScript(mockWsScript);

    await page.goto("/");
    await page.waitForFunction(
      () => (window as unknown as { __ws: WebSocket }).__ws?.readyState === 1,
      { timeout: 10_000 }
    );

    const ta = page.locator("textarea");
    await ta.fill("/dispatch say hello in three words");
    await ta.press("Enter");

    // Give the send a moment to be processed
    await page.waitForTimeout(500);

    const dispatchSent = await page.evaluate(() => {
      const msgs = (window as unknown as { __sentMessages: string[] }).__sentMessages ?? [];
      return msgs.some((m) => {
        try { return (JSON.parse(m) as { type: string }).type === "dispatch"; }
        catch { return false; }
      });
    });
    expect(dispatchSent).toBe(true);
  });

  test("AGENT_POOL_UPDATE from dispatch makes slot appear in dashboard", async ({ page }) => {
    await page.addInitScript(mockWsScript);

    await page.goto("/");
    await page.waitForFunction(
      () => (window as unknown as { __ws: WebSocket }).__ws?.readyState === 1,
      { timeout: 10_000 }
    );

    // Simulate backend acquiring a slot (busy) then releasing (idle)
    await page.evaluate(() => {
      const ws = (window as unknown as { __ws: WebSocket }).__ws;
      ws.dispatchEvent(new MessageEvent("message", {
        data: JSON.stringify({
          type: "AGENT_POOL_UPDATE",
          slots: [{
            slot_id: "claude-1",
            status: "busy",
            current_task_id: null,
            current_task_title: "say hello in three words",
            uptime_seconds: 0,
            idle_since: null,
          }],
          idle_timeout_seconds: 300,
        }),
      }));
    });

    await page.locator("nav").getByRole("button", { name: /Agents/i }).click();
    const main = page.locator("main").last();
    await expect(main.getByText("claude-1")).toBeVisible({ timeout: 5_000 });
    await expect(main.getByText("busy")).toBeVisible();
    await expect(main.getByText("say hello in three words")).toBeVisible();

    // Simulate slot going idle after task completes
    await page.evaluate(() => {
      const ws = (window as unknown as { __ws: WebSocket }).__ws;
      ws.dispatchEvent(new MessageEvent("message", {
        data: JSON.stringify({
          type: "AGENT_POOL_UPDATE",
          slots: [{
            slot_id: "claude-1",
            status: "idle",
            current_task_id: null,
            current_task_title: null,
            uptime_seconds: 3,
            idle_since: new Date().toISOString(),
          }],
          idle_timeout_seconds: 300,
        }),
      }));
    });

    await expect(main.getByText("idle")).toBeVisible({ timeout: 3_000 });
  });

  test("dispatch_done finalizes the streaming message", async ({ page }) => {
    await page.addInitScript(mockWsScript);

    await page.goto("/");
    await page.waitForFunction(
      () => (window as unknown as { __ws: WebSocket }).__ws?.readyState === 1,
      { timeout: 10_000 }
    );

    const ta = page.locator("textarea");
    await ta.fill("/dispatch say hello");
    await ta.press("Enter");

    // Simulate a chunk and then dispatch_done arriving
    await page.evaluate(() => {
      const ws = (window as unknown as { __ws: WebSocket }).__ws;
      ws.dispatchEvent(new MessageEvent("message", {
        data: JSON.stringify({ type: "chunk", slot_id: "claude-1", task_title: "say hello", content: "Hello!" }),
      }));
      ws.dispatchEvent(new MessageEvent("message", {
        data: JSON.stringify({ type: "dispatch_done" }),
      }));
    });

    await expect(page.getByText("Hello!")).toBeVisible({ timeout: 5_000 });
    // After dispatch_done the input should be re-enabled (isStreaming = false)
    await expect(page.locator("textarea")).toBeEnabled({ timeout: 3_000 });
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
