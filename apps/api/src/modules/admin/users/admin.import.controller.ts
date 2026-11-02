import { Response } from 'express';
import {
  ApiResponse,
  BulkImportPreviewSummary,
  BulkImportExecuteResult,
} from '@apnasamaj/shared-types';
import { bulkImportOptionsSchema } from '@apnasamaj/validation';
import { AuthenticatedRequest } from '../../../middleware/authenticate';
import {
  getImportTemplate,
  previewBulkImport,
  executeBulkImport,
} from './admin.import.service';
import { ExcelServiceError } from './excel.service';

/**
 * GET /api/v1/admin/users/import/template
 * Streams the official .xlsx member import template workbook.
 */
export async function downloadTemplateHandler(
  _req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const buffer = await getImportTemplate();

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="ApnaSamaj_Member_Import_Template.xlsx"'
    );
    res.setHeader('Content-Length', buffer.length.toString());

    res.status(200).send(buffer);
  } catch (err: unknown) {
    console.error('[Admin Import Controller] Template generation error:', err);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to generate member import template.',
      timestamp: new Date().toISOString(),
    };
    res.status(500).json(response);
  }
}

/**
 * POST /api/v1/admin/users/import/preview
 * Dry-run preview of an uploaded Excel member roster with zero database writes.
 */
export async function previewImportHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    if (!req.tenant || !req.tenant.isResolved || !req.db) {
      const response: ApiResponse = {
        success: false,
        error:
          'Community context required for member import. Please specify X-Community-Slug header.',
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    if (!req.file || !req.file.buffer) {
      const response: ApiResponse = {
        success: false,
        error:
          'No spreadsheet file provided. Please upload an Excel (.xlsx) file under the "file" field.',
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    const data = await previewBulkImport(req.file.buffer, req.db);

    const response: ApiResponse<BulkImportPreviewSummary> = {
      success: true,
      data,
      timestamp: new Date().toISOString(),
    };

    res.status(200).json(response);
  } catch (err: unknown) {
    if (err instanceof ExcelServiceError) {
      const response: ApiResponse = {
        success: false,
        error: err.message,
        timestamp: new Date().toISOString(),
      };
      res.status(err.statusCode).json(response);
      return;
    }

    console.error('[Admin Import Controller] Preview import error:', err);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to process spreadsheet preview.',
      timestamp: new Date().toISOString(),
    };
    res.status(500).json(response);
  }
}

/**
 * POST /api/v1/admin/users/import/execute
 * Atomically imports valid members into the resolved tenant database with safe skips and audit logging.
 */
export async function executeImportHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    if (!req.tenant || !req.tenant.isResolved || !req.db) {
      const response: ApiResponse = {
        success: false,
        error:
          'Community context required for member import. Please specify X-Community-Slug header.',
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    if (!req.file || !req.file.buffer) {
      const response: ApiResponse = {
        success: false,
        error:
          'No spreadsheet file provided. Please upload an Excel (.xlsx) file under the "file" field.',
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    const parsedOptions = bulkImportOptionsSchema.safeParse(req.body);
    const options = parsedOptions.success ? parsedOptions.data : { skipExisting: true };

    const data = await executeBulkImport(
      req.file.buffer,
      options,
      req.user!,
      req.ip,
      req.headers['user-agent'] as string,
      req.db,
      req.tenant.slug
    );

    const response: ApiResponse<BulkImportExecuteResult> = {
      success: true,
      data,
      timestamp: new Date().toISOString(),
    };

    res.status(200).json(response);
  } catch (err: unknown) {
    if (err instanceof ExcelServiceError) {
      const response: ApiResponse = {
        success: false,
        error: err.message,
        timestamp: new Date().toISOString(),
      };
      res.status(err.statusCode).json(response);
      return;
    }

    console.error('[Admin Import Controller] Execute import error:', err);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to execute member bulk import.',
      timestamp: new Date().toISOString(),
    };
    res.status(500).json(response);
  }
}

