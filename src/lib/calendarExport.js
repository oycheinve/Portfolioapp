// Etap 4: eksport wydarzeń do kalendarza – link Google Calendar oraz plik .ics (Apple / Outlook)

function compact(iso) {
  return iso.replaceAll('-', '');
}

function nextDay(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const n = new Date(Date.UTC(y, m - 1, d + 1));
  return `${n.getUTCFullYear()}${String(n.getUTCMonth() + 1).padStart(2, '0')}${String(n.getUTCDate()).padStart(2, '0')}`;
}

// Wydarzenie całodniowe
export function googleCalendarUrl({ title, date, details = '' }) {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: `${compact(date)}/${nextDay(date)}`,
    details,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function escapeIcs(text) {
  return String(text || '')
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

export function buildIcs(events) {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Moj Majatek//Dywidendy//PL', 'CALSCALE:GREGORIAN'];
  for (const e of events) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.uid || `${compact(e.date)}-${Math.random().toString(36).slice(2)}`}@moj-majatek`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${compact(e.date)}`,
      `DTEND;VALUE=DATE:${nextDay(e.date)}`,
      `SUMMARY:${escapeIcs(e.title)}`,
      `DESCRIPTION:${escapeIcs(e.details)}`,
      'BEGIN:VALARM',
      'TRIGGER:-P1D',
      'ACTION:DISPLAY',
      `DESCRIPTION:${escapeIcs(e.title)}`,
      'END:VALARM',
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

export function downloadIcs(events, filename = 'wydarzenia.ics') {
  const blob = new Blob([buildIcs(events)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
