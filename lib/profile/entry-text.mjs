// Match a date used as a heading, with its separator, at the start of a note.
const dayLabel = /^(?:(?<year>[12]\d{3})[ \t　]*[年./-][ \t　]*)?(?<month>\d{1,2})[ \t　]*[月./-][ \t　]*(?<day>\d{1,2})(?:[ \t　]*[日号])?(?!\d)/u;
const monthLabel = /^(?<year>[12]\d{3})[ \t　]*[年./-][ \t　]*(?<month>\d{1,2})(?:[ \t　]*月)?(?!\d)/u;
const compactDayLabel = /^(?<month>0[1-9]|1[0-2])(?<day>\d{2})(?=[ \t　]*[:：])/u;
const separator = /^(?:[ \t　]*[:：、，,。]|[ \t　]*[.．](?![0-9０-９])|\s+|$)/u;

/** @param {string} body */
export function entryDateLabel(body) {
  const text = body.trimStart();
  // These full-width characters each occupy one code unit. Slice the original note.
  const start = text.slice(0, 64).replace(/[０-９．／－]/gu,
    (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  const match = dayLabel.exec(start) || monthLabel.exec(start) || compactDayLabel.exec(start);
  if (!match?.groups) return null;
  const tail = text.slice(match[0].length);
  const divider = separator.exec(tail);
  if (!divider) return null;
  const remainder = tail.slice(divider[0].length).trimStart();
  // A range or a qualification such as “09.29 至 10.03” is part of the sentence.
  if (!divider[0].trim() && /^(?:[-－–—~～至到]\s*[0-9０-９]|[之以]?[前后]|是|的|截止)/u.test(remainder)) return null;
  return {
    year: match.groups.year || "",
    month: match.groups.month.padStart(2, "0"),
    day: match.groups.day?.padStart(2, "0") || "",
    colonDelimited: /[:：]/u.test(divider[0]),
    remainder,
  };
}

/** @param {NonNullable<ReturnType<typeof entryDateLabel>>} label @param {string} reference */
export function dateOfEntryLabel(label, reference) {
  const year = label.year || reference.match(/^([12]\d{3})-/)?.[1];
  return year ? [year, label.month, label.day].filter(Boolean).join("-") : "";
}

/** @param {string} body @param {string} date */
export function withoutRepeatedEntryDate(body, date) {
  if (!date) return body;
  let text = body;
  while (true) {
    const label = entryDateLabel(text);
    if (!label || dateOfEntryLabel(label, date) !== date) return text;
    text = label.remainder;
  }
}

// Without a confirmed date, only a calendar label with an explicit colon is unambiguous.
/** @param {string} line */
function withoutUndatedLineLabel(line) {
  let text = line;
  while (true) {
    const label = entryDateLabel(text);
    if (!label?.colonDelimited) return text;
    const month = Number(label.month);
    if (month < 1 || month > 12) return text;
    if (label.day) {
      const day = Number(label.day);
      // A missing year can be a leap year.
      const lastDay = new Date(Date.UTC(Number(label.year || 2000), month, 0)).getUTCDate();
      if (day < 1 || day > lastDay) return text;
    }
    text = label.remainder;
  }
}

/** @template {{ body: string, date: string, source?: string, author?: string }} T @param {T} entry */
export function cleanStoredEntry(entry) {
  let body = entry.body;
  if (entry.source) {
    body = entry.date ? withoutRepeatedEntryDate(body, entry.date)
      : body.replace(/[^\r\n]+/gu, withoutUndatedLineLabel);
  }
  if (body === entry.body && !Object.hasOwn(entry, "author")) return entry;
  const cleaned = { ...entry, body };
  delete cleaned.author;
  return cleaned;
}
