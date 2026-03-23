import { useAppStore } from '../lib/store';

// Default timezone if none set in company settings
const DEFAULT_TZ = 'Australia/Sydney';

// Get the configured timezone from company info
export function getTimezone() {
  const companyInfo = useAppStore.getState().companyInfo;
  return companyInfo?.timezone || DEFAULT_TZ;
}

// Get today's date string (YYYY-MM-DD) in the configured timezone
export function getTodayStr(tz) {
  const timezone = tz || getTimezone();
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

// Get current time formatted for display (e.g. "Mon, 9 Mar 2026 · 3:45 PM")
export function getFormattedDateTime(tz) {
  const timezone = tz || getTimezone();
  const now = new Date();
  const date = new Intl.DateTimeFormat('en-AU', { timeZone: timezone, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(now);
  const time = new Intl.DateTimeFormat('en-AU', { timeZone: timezone, hour: 'numeric', minute: '2-digit', hour12: true }).format(now);
  return `${date} · ${time}`;
}

// Common timezone options for the settings dropdown
export const TIMEZONE_OPTIONS = [
  { value: 'Australia/Sydney', label: 'Sydney (AEST/AEDT)' },
  { value: 'Australia/Melbourne', label: 'Melbourne (AEST/AEDT)' },
  { value: 'Australia/Brisbane', label: 'Brisbane (AEST)' },
  { value: 'Australia/Adelaide', label: 'Adelaide (ACST/ACDT)' },
  { value: 'Australia/Perth', label: 'Perth (AWST)' },
  { value: 'Australia/Darwin', label: 'Darwin (ACST)' },
  { value: 'Australia/Hobart', label: 'Hobart (AEST/AEDT)' },
  { value: 'Pacific/Auckland', label: 'Auckland (NZST/NZDT)' },
  { value: 'Asia/Tokyo', label: 'Tokyo (JST)' },
  { value: 'Asia/Singapore', label: 'Singapore (SGT)' },
  { value: 'Asia/Kolkata', label: 'Kolkata (IST)' },
  { value: 'Europe/London', label: 'London (GMT/BST)' },
  { value: 'Europe/Berlin', label: 'Berlin (CET/CEST)' },
  { value: 'America/New_York', label: 'New York (EST/EDT)' },
  { value: 'America/Chicago', label: 'Chicago (CST/CDT)' },
  { value: 'America/Denver', label: 'Denver (MST/MDT)' },
  { value: 'America/Los_Angeles', label: 'Los Angeles (PST/PDT)' },
];
