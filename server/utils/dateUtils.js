/**
 * Date helpers. Everything is done in UTC so results do not depend on the
 * server's time zone. Dates without a time ("2026-09-18") mean UTC midnight,
 * which is also how workout dates are stored.
 */
const DAY_MS = 24 * 60 * 60 * 1000;

const startOfUtcDay = (date) => {
  const d = new Date(date);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
};

const addDays = (date, days) => new Date(new Date(date).getTime() + days * DAY_MS);

/** "YYYY-MM-DD" for the UTC day of `date`. */
const toDayKey = (date) => new Date(date).toISOString().slice(0, 10);

/** Monday (UTC) of the week containing `date`. */
const startOfIsoWeek = (date) => {
  const day = startOfUtcDay(date);
  const offset = (day.getUTCDay() + 6) % 7; // Mon=0 ... Sun=6
  return addDays(day, -offset);
};

module.exports = { DAY_MS, startOfUtcDay, addDays, toDayKey, startOfIsoWeek };
