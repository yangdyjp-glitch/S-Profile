import { cleanStoredEntry } from "../lib/profile/entry-text.mjs";

export const entryFormatMigration = "entry-date-heading-v2";

export function entryFormatUpdates(rows) {
  const updates = [];
  for (const { id, data } of rows) {
    const original = JSON.parse(data);
    const cleaned = cleanStoredEntry(original);
    if (cleaned !== original) updates.push({ id, data: JSON.stringify(cleaned) });
  }
  return updates;
}
