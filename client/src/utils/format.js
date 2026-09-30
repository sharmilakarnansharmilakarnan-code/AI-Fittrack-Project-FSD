// Shared display helpers. Dates/times from the API are UTC.
export const formatDate = (d) =>
  new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export const formatDateTime = (d) => `${new Date(d).toISOString().slice(0, 16).replace("T", " ")} UTC`;

export const errorText = (err) =>
  (err && err.errors && err.errors.length ? err.errors.join(" ") : err && err.message) || "Something went wrong.";

const TONES = {
  success: ["active", "completed"],
  warning: ["pending"],
  danger: ["cancelled", "expired"],
};
export const statusTone = (status) =>
  Object.keys(TONES).find((tone) => TONES[tone].includes(status)) || "muted";
