import { beforeEach, describe, expect, it, vi } from "vitest";

const { createSupabaseServerClient } = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient }));

import { getPanitiaImportPreview } from "./panitia-import-preview";

const BATCH_ID = "36c404b6-7500-4fdf-8b50-081335b82339";
const EVENT_ID = "11111111-1111-1111-1111-111111111111";
const CONFIRMATION_KEY = "de7c24c3-7cd5-4d7a-95b6-31563401ef87";

function queryResult(data: unknown) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    order: vi.fn(async () => ({ data, error: null })),
    maybeSingle: vi.fn(async () => ({ data, error: null })),
  };
  return query;
}

describe("getPanitiaImportPreview", () => {
  beforeEach(() => {
    createSupabaseServerClient.mockReset();
  });

  it("loads previews whose event uses a PostgreSQL UUID without RFC version bits", async () => {
    const batch = {
      id: BATCH_ID,
      event_id: EVENT_ID,
      confirmation_key: CONFIRMATION_KEY,
      status: "PREVIEW",
      csv_format: "LEGACY_21",
      row_count: 0,
      insert_count: 0,
      update_count: 0,
      unchanged_count: 0,
      blocked_count: 0,
      warning_count: 0,
      expires_at: "2099-01-02T00:00:00.000Z",
      applied_at: null,
      created_at: "2099-01-01T00:00:00.000Z",
    };
    const event = { id: EVENT_ID, code: "HBD2026", name: "Honda Bikers Day 2026" };
    const queries = {
      panitia_import_batches: queryResult(batch),
      events: queryResult(event),
      panitia_import_rows: queryResult([]),
    };
    createSupabaseServerClient.mockResolvedValue({
      from: vi.fn((table: keyof typeof queries) => queries[table]),
    });

    const preview = await getPanitiaImportPreview(BATCH_ID);

    expect(preview?.event.id).toBe(EVENT_ID);
    expect(preview?.batch.id).toBe(BATCH_ID);
  });
});
