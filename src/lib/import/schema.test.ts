import { describe, expect, it } from "vitest";
import { PanitiaImportRecordSchema } from "./schema";

describe("PanitiaImportRecordSchema", () => {
  it("accepts phone text with an international prefix and separators", () => {
    const schema = PanitiaImportRecordSchema.shape.pickupPicPhone;
    expect(schema.safeParse("+62 812-3456-789")).toEqual(expect.objectContaining({ success: true }));
  });
});
