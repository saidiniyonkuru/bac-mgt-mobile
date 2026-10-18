import { Share } from 'react-native';
import { toast } from '../ui/feedback';

export function toCSV(rows: Record<string, unknown>[]) {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(','), ...rows.map((r) => headers.map((h) => escape(r[h])).join(','))].join('\n');
}

/**
 * Opens the phone's share sheet with the rows as CSV text — save it to Drive,
 * send it on WhatsApp or e-mail it, then open it in Excel / Google Sheets.
 */
export async function shareCSV(rows: Record<string, unknown>[], filename: string) {
  if (!rows.length) {
    toast('Nothing to export');
    return false;
  }
  try {
    await Share.share({ title: filename, message: toCSV(rows) }, { dialogTitle: `Export ${filename}`, subject: filename });
    return true;
  } catch {
    return false;
  }
}
