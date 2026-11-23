import { describe, expect, it, vi } from "vitest";
import { D1MonitorRepository } from "../src/repository";

describe("Telegram-only D1 queue", () => {
  it("queues exactly one push delivery, including repeated event insertion", async () => {
    const statements: { sql: string; args: unknown[] }[] = [];
    const db = {
      prepare: (sql: string) => ({
        bind: (...args: unknown[]) => {
          const statement = { sql, args };
          statements.push(statement);
          return statement;
        },
      }),
      batch: vi.fn().mockResolvedValue([]),
    };
    const repo = new D1MonitorRepository(db as unknown as D1Database);
    const event = {
      eventId: "stock:1", eventType: "stock" as const, title: "Stock",
      body: "Available", url: null, createdAt: "2026-09-14T12:00:00.000Z",
    };
    await repo.enqueueEvent(event);
    expect(db.batch).toHaveBeenCalledTimes(1);
    expect(statements).toHaveLength(2);
    expect(statements[1]?.args[1]).toBe("push");
    expect(statements[1]?.sql).toContain("INSERT OR IGNORE");
    await repo.enqueueEvent(event);
    expect(statements[3]).toEqual(statements[1]);
  });

  it("filters legacy email rows before selecting due work", async () => {
    const prepare = vi.fn().mockReturnValue({
      bind: vi.fn().mockReturnValue({ all: vi.fn().mockResolvedValue({ results: [] }) }),
    });
    const repo = new D1MonitorRepository({ prepare } as unknown as D1Database);
    expect(await repo.listDueDeliveries("2026-09-14T12:00:00.000Z")).toEqual([]);
    expect(prepare.mock.calls[0]?.[0]).toContain("WHERE d.channel = 'push' AND (");
  });
});
