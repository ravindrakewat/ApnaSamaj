import ExcelJS from 'exceljs';
import {
  validateBulkImportRow,
  FORBIDDEN_BULK_IMPORT_FIELDS,
} from '@apnasamaj/validation';
import type {
  BulkImportMemberRow,
  BulkImportRowError,
  BulkImportPreviewRow,
} from '@apnasamaj/shared-types';

export class ExcelServiceError extends Error {
  public statusCode: number;
  constructor(message: string, statusCode: number = 400) {
    super(message);
    this.name = 'ExcelServiceError';
    this.statusCode = statusCode;
  }
}

export class ExcelValidationError extends ExcelServiceError {
  constructor(message: string) {
    super(message, 400);
    this.name = 'ExcelValidationError';
  }
}

export interface ParsedExcelRow {
  rowNumber: number;
  data: BulkImportMemberRow;
}

export interface ParsedExcelResult {
  totalDataRows: number;
  validRows: ParsedExcelRow[];
  duplicateInFileRows: Array<{ rowNumber: number; phone: string; firstRowNumber: number }>;
  invalidRows: Array<{ rowNumber: number; errors: BulkImportRowError[] }>;
  allPreviewRows: BulkImportPreviewRow[];
  errors: BulkImportRowError[];
}

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_DATA_ROWS = 1000;

/**
 * Extracts and sanitizes cell value safely:
 * - Detects formulas and flags them to avoid executing or trusting formula injection.
 * - Extracts text from rich text, dates, numbers, or string cells.
 */
function extractCellValue(cell: ExcelJS.Cell): { value: string | null; isFormula: boolean } {
  const val = cell.value;
  if (val === null || val === undefined) {
    return { value: null, isFormula: false };
  }

  if (typeof val === 'object') {
    // Detect formula object: ExcelJS stores formulas as { formula: '...', result: '...' }
    if ('formula' in val) {
      return { value: null, isFormula: true };
    }
    // Rich text handling
    if ('richText' in val && Array.isArray((val as { richText: unknown[] }).richText)) {
      const parts = (val as { richText: Array<{ text?: string }> }).richText;
      const text = parts.map((p) => p.text || '').join('').trim();
      return { value: text.length > 0 ? text : null, isFormula: false };
    }
    // Shared string or text property
    if ('text' in val) {
      const text = String((val as { text: unknown }).text).trim();
      return { value: text.length > 0 ? text : null, isFormula: false };
    }
    // Date object
    if (val instanceof Date) {
      return { value: val.toISOString(), isFormula: false };
    }
    const str = String(val).trim();
    return { value: str.length > 0 ? str : null, isFormula: false };
  }

  // Primitive number, boolean, or string
  const str = String(val).trim();
  return { value: str.length > 0 ? str : null, isFormula: false };
}

/**
 * Generates an official, pre-formatted .xlsx template for bulk member imports.
 */
export async function generateImportTemplate(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Apna Samaj Community Platform';
  workbook.created = new Date();

  // -------------------------------------------------------------
  // Sheet 1: Members Data Entry
  // -------------------------------------------------------------
  const worksheet = workbook.addWorksheet('Members');

  worksheet.columns = [
    { header: 'Full Name', key: 'fullName', width: 26 },
    { header: 'Mobile Number', key: 'phone', width: 22 },
    { header: 'Gender', key: 'gender', width: 16 },
    { header: 'City', key: 'city', width: 20 },
    { header: 'State', key: 'state', width: 22 },
    { header: 'Sub-Caste', key: 'subCaste', width: 20 },
    { header: 'Gotra', key: 'gotra', width: 20 },
  ];

  // Header styling: Deep blue, white bold text
  const headerRow = worksheet.getRow(1);
  headerRow.height = 30;
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1E3A8A' },
    };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      bottom: { style: 'medium', color: { argb: 'FF0F172A' } },
      left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    };
  });

  // Pre-format Mobile Number column as Text (@) and set Gender dropdown for rows 2..500
  for (let r = 2; r <= 500; r++) {
    worksheet.getCell(`B${r}`).numFmt = '@';
    worksheet.getCell(`C${r}`).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: ['"MALE,FEMALE,OTHER"'],
      showErrorMessage: true,
      errorTitle: 'Invalid Gender',
      error: 'Please select MALE, FEMALE, or OTHER from the dropdown.',
    };
  }

  // Add sample rows for guidance
  worksheet.addRow({
    fullName: 'Ramesh Kewat',
    phone: '9876543210',
    gender: 'MALE',
    city: 'Indore',
    state: 'Madhya Pradesh',
    subCaste: 'Kewat',
    gotra: 'Kashyap',
  });

  worksheet.addRow({
    fullName: 'Sita Nishad',
    phone: '+919123456789',
    gender: 'FEMALE',
    city: 'Bhopal',
    state: 'Madhya Pradesh',
    subCaste: 'Nishad',
    gotra: 'Bharadwaj',
  });

  // -------------------------------------------------------------
  // Sheet 2: Guidelines & Instructions
  // -------------------------------------------------------------
  const instructionsSheet = workbook.addWorksheet('Instructions');
  instructionsSheet.columns = [
    { header: 'Field Name (स्तम्भ)', key: 'field', width: 28 },
    { header: 'Required? (अनिवार्य?)', key: 'required', width: 20 },
    { header: 'Format / Rules (स्वीकृत प्रारूप)', key: 'format', width: 36 },
    { header: 'Instructions & Example (विवरण व उदाहरण)', key: 'notes', width: 65 },
  ];

  const instHeader = instructionsSheet.getRow(1);
  instHeader.height = 30;
  instHeader.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1E3A8A' },
    };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });

  instructionsSheet.addRow({
    field: 'Full Name (पूरा नाम)',
    required: 'YES (हाँ, अनिवार्य)',
    format: 'Text (2–100 characters)',
    notes: 'Member canonical legal name. Example: "Ramesh Kewat".',
  });

  instructionsSheet.addRow({
    field: 'Mobile Number (मोबाइल)',
    required: 'YES (हाँ, अनिवार्य)',
    format: '10 digits (starting 6-9) or E.164 (+91XXXXXXXXXX)',
    notes: 'Used for identity and member password claiming. Example: 9876543210.',
  });

  instructionsSheet.addRow({
    field: 'Gender (लिंग)',
    required: 'NO (वैकल्पिक)',
    format: 'MALE, FEMALE, or OTHER',
    notes: 'Select from dropdown or leave empty.',
  });

  instructionsSheet.addRow({
    field: 'City (शहर)',
    required: 'NO (वैकल्पिक)',
    format: 'Text (max 100 characters)',
    notes: 'Member city of residence. Example: "Indore".',
  });

  instructionsSheet.addRow({
    field: 'State (राज्य)',
    required: 'NO (वैकल्पिक)',
    format: 'Text (max 100 characters)',
    notes: 'Member state. Example: "Madhya Pradesh".',
  });

  instructionsSheet.addRow({
    field: 'Sub-Caste (उपजाति)',
    required: 'NO (वैकल्पिक)',
    format: 'Text (max 100 characters)',
    notes: 'Community sub-caste. Example: "Kewat", "Mallah", "Nishad".',
  });

  instructionsSheet.addRow({
    field: 'Gotra (गोत्र)',
    required: 'NO (वैकल्पिक)',
    format: 'Text (max 100 characters)',
    notes: 'Gotra or lineage. Example: "Kashyap".',
  });

  instructionsSheet.addRow({});
  instructionsSheet.addRow({
    field: 'SECURITY & PRIVACY NOTICE',
    required: 'CRITICAL',
    format: 'Platform Security Policy',
    notes:
      'Do NOT add columns for passwords, roles, or account status. All members are created with role MEMBER in PENDING status. Members set their own password securely after approval via Forgot Password.',
  });

  const rawBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(rawBuffer);
}

/**
 * Parses and validates an uploaded Excel (.xlsx) buffer:
 * - Rejects files > 5MB.
 * - Rejects malformed or suspicious workbook structures.
 * - Enforces max 1,000 data rows.
 * - Validates headers: rejects forbidden security columns and unrecognized columns.
 * - Disallows formula values in data cells.
 * - Normalizes phones and validates with @apnasamaj/validation.
 * - Detects intra-file duplicate phones.
 */
export async function parseExcelBuffer(buffer: Buffer): Promise<ParsedExcelResult> {
  if (!buffer || !Buffer.isBuffer(buffer)) {
    throw new ExcelValidationError('No file buffer provided for Excel parsing.');
  }

  if (buffer.length > MAX_UPLOAD_BYTES) {
    throw new ExcelValidationError(
      `File size (${(buffer.length / (1024 * 1024)).toFixed(1)}MB) exceeds the maximum allowed limit of 5MB.`
    );
  }

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as any);
  } catch (err) {
    throw new ExcelValidationError(
      'Invalid or corrupt Excel workbook. Please upload a valid .xlsx spreadsheet.'
    );
  }

  if (!workbook.worksheets || workbook.worksheets.length === 0) {
    throw new ExcelValidationError('Excel file contains no worksheets.');
  }

  // Look for a worksheet named 'Members' (case-insensitive) or default to the first sheet
  const worksheet =
    workbook.worksheets.find((ws) => ws.name.toLowerCase().trim() === 'members') ||
    workbook.worksheets[0];

  if (!worksheet || worksheet.rowCount < 1) {
    throw new ExcelValidationError('Spreadsheet is empty.');
  }

  // -------------------------------------------------------------
  // 1. Header Validation (Row 1)
  // -------------------------------------------------------------
  const headerRow = worksheet.getRow(1);
  if (!headerRow || headerRow.cellCount === 0) {
    throw new ExcelValidationError('Spreadsheet is missing a header row.');
  }

  // Map of column index (1-based) to canonical field key
  const columnMap = new Map<number, keyof BulkImportMemberRow>();
  const seenHeaderFields = new Set<string>();

  const knownHeaderMap: Record<string, keyof BulkImportMemberRow> = {
    fullname: 'fullName',
    name: 'fullName',
    पूरानाम: 'fullName',
    नाम: 'fullName',
    mobilenumber: 'phone',
    mobile: 'phone',
    phone: 'phone',
    phonenumber: 'phone',
    मोबाइल: 'phone',
    मोबाइलनंबर: 'phone',
    फोन: 'phone',
    gender: 'gender',
    sex: 'gender',
    लिंग: 'gender',
    city: 'city',
    शहर: 'city',
    state: 'state',
    राज्य: 'state',
    subcaste: 'subCaste',
    उपजाति: 'subCaste',
    gotra: 'gotra',
    गोत्र: 'gotra',
  };

  headerRow.eachCell((cell, colNumber) => {
    const { value: rawHeader, isFormula } = extractCellValue(cell);
    if (isFormula) {
      throw new ExcelValidationError(
        `Header in column ${colNumber} contains a formula, which is strictly prohibited.`
      );
    }

    if (!rawHeader) return;

    const normalizedHeader = rawHeader.toLowerCase().trim().replace(/[\s\-_]/g, '');

    // Security check: Reject forbidden columns
    for (const forbidden of FORBIDDEN_BULK_IMPORT_FIELDS) {
      if (normalizedHeader === forbidden.toLowerCase()) {
        throw new ExcelValidationError(
          `Security violation: Header contains forbidden column "${rawHeader}". Roles, passwords, account status, and tenant IDs cannot be imported.`
        );
      }
    }

    const fieldKey = knownHeaderMap[normalizedHeader];
    if (!fieldKey) {
      throw new ExcelValidationError(
        `File contains unrecognized column header: "${rawHeader}". Allowed columns: Full Name, Mobile Number, Gender, City, State, Sub-Caste, Gotra.`
      );
    }

    if (seenHeaderFields.has(fieldKey)) {
      throw new ExcelValidationError(
        `File contains duplicate column header for "${rawHeader}".`
      );
    }

    seenHeaderFields.add(fieldKey);
    columnMap.set(colNumber, fieldKey);
  });

  // Required header verification
  if (!seenHeaderFields.has('fullName') || !seenHeaderFields.has('phone')) {
    throw new ExcelValidationError(
      'Missing required column headers: "Full Name" and "Mobile Number" must be present.'
    );
  }

  // -------------------------------------------------------------
  // 2. Data Rows Validation (Row 2 onwards)
  // -------------------------------------------------------------
  const validRows: ParsedExcelRow[] = [];
  const duplicateInFileRows: Array<{ rowNumber: number; phone: string; firstRowNumber: number }> = [];
  const invalidRows: Array<{ rowNumber: number; errors: BulkImportRowError[] }> = [];
  const allPreviewRows: BulkImportPreviewRow[] = [];
  const allErrors: BulkImportRowError[] = [];

  const seenPhonesInFile = new Map<string, number>(); // normalizedPhone -> firstRowNumber
  let totalDataRows = 0;

  for (let r = 2; r <= worksheet.rowCount; r++) {
    const row = worksheet.getRow(r);

    // Extract values based on column map
    let rowHasData = false;
    let rowHasFormula = false;
    const rawRow: Record<string, unknown> = {};

    columnMap.forEach((fieldKey, colNumber) => {
      const cell = row.getCell(colNumber);
      const { value, isFormula } = extractCellValue(cell);
      if (isFormula) {
        rowHasFormula = true;
      }
      if (value !== null && value !== '') {
        rowHasData = true;
        rawRow[fieldKey] = value;
      }
    });

    // Skip completely empty rows
    if (!rowHasData && !rowHasFormula) {
      continue;
    }

    totalDataRows++;

    if (totalDataRows > MAX_DATA_ROWS) {
      throw new ExcelValidationError(
        `File exceeds maximum limit of ${MAX_DATA_ROWS} data rows. Found more than ${MAX_DATA_ROWS} rows.`
      );
    }

    // Formula rejection check
    if (rowHasFormula) {
      const formulaError: BulkImportRowError = {
        rowNumber: r,
        field: 'formula',
        message: 'Formulas are strictly prohibited in member data cells.',
      };
      allErrors.push(formulaError);
      invalidRows.push({ rowNumber: r, errors: [formulaError] });
      allPreviewRows.push({
        rowNumber: r,
        fullName: String(rawRow.fullName ?? ''),
        phone: String(rawRow.phone ?? ''),
        status: 'INVALID_FORMAT',
        errors: [formulaError.message],
      });
      continue;
    }

    // Validate using Zod schema
    const validationResult = validateBulkImportRow(rawRow, r);

    if (!validationResult.success) {
      const rowErrors: BulkImportRowError[] = validationResult.errors.map((e) => ({
        rowNumber: e.rowNumber,
        field: e.field,
        value: e.value,
        message: e.message,
      }));
      allErrors.push(...rowErrors);
      invalidRows.push({ rowNumber: r, errors: rowErrors });
      allPreviewRows.push({
        rowNumber: r,
        fullName: String(rawRow.fullName ?? ''),
        phone: String(rawRow.phone ?? ''),
        gender: rawRow.gender as BulkImportMemberRow['gender'],
        city: rawRow.city as string,
        state: rawRow.state as string,
        subCaste: rawRow.subCaste as string,
        gotra: rawRow.gotra as string,
        status: 'INVALID_FORMAT',
        errors: rowErrors.map((e) => e.message),
      });
      continue;
    }

    const validData = validationResult.data;

    // Intra-file duplicate mobile number detection
    if (seenPhonesInFile.has(validData.phone)) {
      const firstRow = seenPhonesInFile.get(validData.phone)!;
      const dupError: BulkImportRowError = {
        rowNumber: r,
        field: 'phone',
        value: validData.phone,
        message: `Duplicate mobile number in row ${firstRow}.`,
      };
      allErrors.push(dupError);
      duplicateInFileRows.push({
        rowNumber: r,
        phone: validData.phone,
        firstRowNumber: firstRow,
      });
      allPreviewRows.push({
        rowNumber: r,
        fullName: validData.fullName,
        phone: validData.phone,
        gender: validData.gender,
        city: validData.city,
        state: validData.state,
        subCaste: validData.subCaste,
        gotra: validData.gotra,
        status: 'DUPLICATE_IN_FILE',
        errors: [dupError.message],
      });
      continue;
    }

    // First time seeing this valid phone in the file
    seenPhonesInFile.set(validData.phone, r);
    validRows.push({ rowNumber: r, data: validData });
    allPreviewRows.push({
      rowNumber: r,
      fullName: validData.fullName,
      phone: validData.phone,
      gender: validData.gender,
      city: validData.city,
      state: validData.state,
      subCaste: validData.subCaste,
      gotra: validData.gotra,
      status: 'VALID',
    });
  }

  if (totalDataRows === 0) {
    throw new ExcelValidationError('Uploaded spreadsheet contains no member data rows.');
  }

  return {
    totalDataRows,
    validRows,
    duplicateInFileRows,
    invalidRows,
    allPreviewRows,
    errors: allErrors,
  };
}
