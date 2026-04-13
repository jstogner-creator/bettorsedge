import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { subHours, format } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Returns the current date in US Eastern Time (America/New_York).
 * Useful for initializing calendars to the correct sports day.
 */
export function getNYDate(): Date {
  const now = new Date();
  const nyDateStr = formatInTimeZone(now, 'America/New_York', 'yyyy-MM-dd');
  const [y, m, d] = nyDateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/**
 * Returns the "Sports Slate Date" for a given date/time.
 * Subtracts 6 hours so that games starting after midnight (e.g. 1 AM ET) 
 * are correctly associated with the previous day's slate.
 */
export function getSlateDate(date: Date | string): string {
  try {
    const d = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(d.getTime())) return format(new Date(), "yyyy-MM-dd");
    const slateDate = format(subHours(d, 6), "yyyy-MM-dd");
    console.log(`[getSlateDate] Input: ${date}, Output: ${slateDate}`);
    return slateDate;
  } catch (e) {
    return format(new Date(), "yyyy-MM-dd");
  }
}
