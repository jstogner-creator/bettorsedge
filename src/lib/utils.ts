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
    if (typeof date === 'string') {
      // If it's a pure date string (YYYY-MM-DD), use it directly
      if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return date;
      }
      
      const d = new Date(date);
      if (isNaN(d.getTime())) return format(new Date(), "yyyy-MM-dd");
      
      // If the string doesn't contain time info (e.g. "2024-03-27"), 
      // some browsers parse it as UTC, which can shift the day.
      // We only want to apply the 6-hour offset to games with actual times.
      const hasTime = date.includes('T') || date.includes(':');
      if (!hasTime) return format(d, "yyyy-MM-dd");
      
      return format(subHours(d, 6), "yyyy-MM-dd");
    }
    
    // For Date objects, always apply the offset
    return format(subHours(date, 6), "yyyy-MM-dd");
  } catch (e) {
    return format(new Date(), "yyyy-MM-dd");
  }
}
