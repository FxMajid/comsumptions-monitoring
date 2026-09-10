import { getAdminProfile } from "@/lib/actions/guard";
import { requireActiveEventId } from "@/lib/domain/event";
import { PANITIA_CANONICAL_HEADERS } from "@/lib/import/panitia-csv";
import { serializeCsv } from "@/lib/import/csv";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const SLOT_KEYS = [
  "h2_siang", "h1_siang", "h1_malam", "h_pagi", "h_siang", "h_malam", "hplus1",
] as const;

function jsonRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value : value === null || value === undefined ? "" : String(value);
}

function attendance(value: unknown): string {
  if (value === "PRESENT") return "Hadir";
  if (value === "ABSENT") return "Tidak Hadir";
  return "";
}

export async function GET() {
  if (!(await getAdminProfile())) return new Response("Tidak diizinkan.", { status: 403 });
  const eventId = await requireActiveEventId();
  if (!eventId) return new Response("Belum ada event.", { status: 404 });

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("panitia_roster_overview")
    .select("beneficiary_id, beneficiary_code, name, pic_hbd, employee_group, pickup_pic_name, pickup_whatsapp, quantity, origin, meal_eligible, area_code, area_name, source_row_number, slots")
    .eq("event_id", eventId)
    .eq("is_active", true)
    .order("source_row_number", { ascending: true });
  if (error) return new Response("Template gagal dibuat.", { status: 500 });

  const rows = (data ?? []).map((entry, index) => {
    const record = jsonRecord(entry);
    const slots = jsonRecord(record.slots);
    const slotCells = SLOT_KEYS.flatMap((slotKey) => {
      const slot = jsonRecord(slots[slotKey]);
      const cells = [attendance(slot.attendance)];
      if (["h2_siang", "h1_siang", "h1_malam", "hplus1"].includes(slotKey)) cells.push(text(slot.activity));
      return cells;
    });
    return [
      text(record.beneficiary_id),
      text(record.source_row_number || index + 1),
      text(record.name),
      text(record.pic_hbd),
      text(record.employee_group),
      text(record.pickup_pic_name),
      text(record.pickup_whatsapp),
      text(record.quantity),
      record.origin === "EXTERNAL" ? "Eksternal" : "Internal",
      record.meal_eligible === false ? "NO" : "YES",
      text(record.area_code || record.area_name),
      ...slotCells,
    ];
  });

  const csv = `﻿${serializeCsv([PANITIA_CANONICAL_HEADERS, ...rows])}\r\n`;
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="template-roster-panitia.csv"',
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
