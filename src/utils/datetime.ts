// Date/time utilities for the app
// Provides functions used by receipt-processor and other modules

/**
 * Format a date string (or Date object) to YYYY-MM-DDTHH:MM (local time)
 */
export function formatDateTimeISO(dateString: string | Date): string {
  try {
    const date = (dateString instanceof Date) ? dateString : new Date(dateString);
    if (isNaN(date.getTime())) {
      throw new Error('Invalid date');
    }
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  } catch {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  }
}

/**
 * Return current local time in YYYY-MM-DDTHH:MM format, and the timezone offset as +HH:MM
 */
export function getCurrentLocalTimeISO(): string {
  return formatDateTimeISO(new Date());
}

export function getTimezoneOffset(): string {
  const offset = -new Date().getTimezoneOffset(); // minutes
  const sign = offset >= 0 ? '+' : '-';
  const abs = Math.abs(offset);
  const hours = String(Math.floor(abs / 60)).padStart(2, '0');
  const minutes = String(abs % 60).padStart(2, '0');
  return `${sign}${hours}:${minutes}`;
}

/**
 * Normalize/parse date (as returned by LLM) into ISO YYYY-MM-DDTHH:MM (local)
 * If the provided string lacks a year, uses the current year.
 * If there is no time, defaults to 12:00.
 */
export function normalizeDateFromLLM(dateStr: any): string {
  const now = new Date();
  const currentYear = now.getFullYear();
  if (!dateStr) {
    return formatDateTimeISO(now);
  }

  let s = String(dateStr).trim();
  s = s.replace(/(st|nd|rd|th)\b/gi, '').replace(/[ ,\.]+/g, ' ').trim();

  // Try direct parse first
  const direct = new Date(s);
  if (!isNaN(direct.getTime())) {
    return formatDateTimeISO(direct);
  }

  // Try patterns like MM-DD or M/D with optional year
  const md = s.match(/^(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?$/);
  if (md) {
    const month = Number(md[1]);
    const day = Number(md[2]);
    let year = md[3] ? Number(md[3]) : currentYear;
    if (year < 100) year += 2000;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T12:00`;
  }

  // Try patterns like 'Nov 17' or '17 Nov 2024'
  const parts = s.split(' ').filter(Boolean);
  if (parts.length >= 2) {
    const monthNames: any = {
      jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
      jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
    };
    let month: number | null = null;
    let day: number | null = null;
    let year: number | null = null;
    // find month token, day token and optional year token
    for (const token of parts) {
      const lower = token.toLowerCase().slice(0, 3);
      const monthCandidate = monthNames[lower];
      if (monthCandidate) {
        month = monthCandidate;
        continue;
      }
      const num = Number(token);
      if (!isNaN(num)) {
        if (num > 31) year = num;
        else if (!day) day = num;
      }
    }
    if (month && day) {
      const actualYear = year || currentYear;
      return `${actualYear}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}T12:00`;
    }
  }

  // Fallback to current time
  return formatDateTimeISO(now);
}

/**
 * Format date into YYYY-MM-DD (date only) in local timezone
 */
export function formatDateISO(dateString: string | Date): string {
  try {
    const date = (dateString instanceof Date) ? dateString : new Date(dateString);
    if (isNaN(date.getTime())) throw new Error('Invalid date');
    return date.toISOString().split('T')[0];
  } catch {
    return new Date().toISOString().split('T')[0];
  }
}
