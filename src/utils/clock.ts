// Single source of time for billing-related operations.
export function currentTime(): Date {
  return new Date();
}

// Convert a date to the first day of its UTC calendar month.
export function getUtcMonth(date: Date): string {
  const year = date.getUTCFullYear();

  const month = String(
    date.getUTCMonth() + 1
  ).padStart(2, "0");

  return `${year}-${month}-01`;
}