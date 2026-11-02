import { BulkImportPreviewSummary, BulkImportRowError } from '@apnasamaj/shared-types';

/**
 * Sanitizes a string value to protect against CSV / Spreadsheet formula injection.
 * Prepends a single quote if the value begins with formula characters: =, +, -, @, \t, \r.
 */
export function sanitizeCsvCell(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  let str = String(value).trim();

  // Protect against formula injection in Excel / Google Sheets / LibreOffice
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }

  // If the cell contains quotes, commas, or newlines, wrap in quotes and escape internal quotes
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

/**
 * Generates a clean, formula-injection-safe CSV string containing the row-level validation
 * errors and problem rows from a member bulk import preview or execution.
 */
export function generateImportErrorReportCsv(
  summary: BulkImportPreviewSummary | { errors: BulkImportRowError[] }
): string {
  const headers = [
    'Excel Row',
    'Member Name',
    'Mobile Number',
    'Row Status',
    'Validation Errors',
  ];

  const rows: string[][] = [];

  if ('previewRows' in summary && Array.isArray(summary.previewRows)) {
    // Export rows that are not VALID (i.e. duplicates, existing, format errors)
    const problemRows = summary.previewRows.filter((r) => r.status !== 'VALID');

    for (const r of problemRows) {
      const errorMsg =
        r.errors && r.errors.length > 0
          ? r.errors.join('; ')
          : r.status === 'EXISTING_IN_DB'
          ? 'Member already exists in community database'
          : r.status === 'DUPLICATE_IN_FILE'
          ? 'Duplicate mobile number within uploaded file'
          : 'Invalid data format';

      rows.push([
        String(r.rowNumber),
        r.fullName || '',
        r.phone || '',
        r.status,
        errorMsg,
      ]);
    }
  } else if ('errors' in summary && Array.isArray(summary.errors)) {
    // Group error entries by rowNumber
    const grouped = new Map<number, BulkImportRowError[]>();
    for (const err of summary.errors) {
      const existing = grouped.get(err.rowNumber) || [];
      existing.push(err);
      grouped.set(err.rowNumber, existing);
    }

    for (const [rowNum, errList] of grouped.entries()) {
      const combinedMsg = errList.map((e) => `${e.field}: ${e.message}`).join('; ');
      const sampleVal = errList[0]?.value || '';
      rows.push([
        String(rowNum),
        '',
        sampleVal,
        'FAILED',
        combinedMsg,
      ]);
    }
  }

  const csvLines = [
    headers.map(sanitizeCsvCell).join(','),
    ...rows.map((row) => row.map(sanitizeCsvCell).join(',')),
  ];

  return csvLines.join('\r\n');
}

/**
 * Initiates a browser download for generated CSV text content.
 */
export function triggerCsvDownload(csvContent: string, filename: string): void {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

