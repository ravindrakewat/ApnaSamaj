import multer, { FileFilterCallback } from 'multer';
import { Request, Response, NextFunction } from 'express';
import { ApiResponse } from '@apnasamaj/shared-types';

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

const storage = multer.memoryStorage();

function fileFilter(
  _req: Request,
  file: Express.Multer.File,
  callback: FileFilterCallback
): void {
  const originalName = file.originalname.toLowerCase();
  const isXlsxExt = originalName.endsWith('.xlsx');

  // Accept standard OpenXML MIME types or generic binary stream if extension is .xlsx
  const validMimes = [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/octet-stream',
    'application/vnd.ms-excel',
    'application/x-zip-compressed',
  ];

  if (isXlsxExt && validMimes.includes(file.mimetype)) {
    callback(null, true);
  } else if (isXlsxExt) {
    // If browser reported unusual MIME type but extension is strictly .xlsx
    callback(null, true);
  } else {
    callback(new Error('INVALID_FILE_TYPE'));
  }
}

const upload = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES,
    files: 1,
  },
  fileFilter,
});

/**
 * Middleware handling Excel (.xlsx) file upload in memory with 5MB limit.
 */
export const excelUploadMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  upload.single('file')(req, res, (err: unknown) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          const response: ApiResponse = {
            success: false,
            error: 'File size exceeds the maximum limit of 5MB.',
            timestamp: new Date().toISOString(),
          };
          res.status(400).json(response);
          return;
        }

        const response: ApiResponse = {
          success: false,
          error: `Upload error: ${err.message}`,
          timestamp: new Date().toISOString(),
        };
        res.status(400).json(response);
        return;
      }

      if ((err as Error)?.message === 'INVALID_FILE_TYPE') {
        const response: ApiResponse = {
          success: false,
          error: 'Invalid file format. Only Excel (.xlsx) files are allowed.',
          timestamp: new Date().toISOString(),
        };
        res.status(400).json(response);
        return;
      }

      const response: ApiResponse = {
        success: false,
        error: (err as Error)?.message || 'Failed to process spreadsheet upload.',
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    if (!req.file || !req.file.buffer) {
      const response: ApiResponse = {
        success: false,
        error: 'No spreadsheet file was provided. Please upload an Excel (.xlsx) file under the "file" field.',
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    next();
  });
};

