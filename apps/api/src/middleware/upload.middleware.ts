import multer, { FileFilterCallback } from 'multer';
import { Request, Response, NextFunction } from 'express';
import { ApiResponse } from '@apnasamaj/shared-types';
import { config } from '../config/env';

const storage = multer.memoryStorage();

const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

function fileFilter(
  _req: Request,
  file: Express.Multer.File,
  callback: FileFilterCallback
): void {
  if (allowedMimes.includes(file.mimetype)) {
    callback(null, true);
  } else {
    callback(new Error('INVALID_MIME_TYPE'));
  }
}

const upload = multer({
  storage,
  limits: {
    fileSize: config.maxMediaFileSizeBytes, // 5MB
    files: 1, // 1 file per upload request
  },
  fileFilter,
});

export const singleImageUpload = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  upload.single('file')(req, res, (err: unknown) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          const maxMb = (config.maxMediaFileSizeBytes / (1024 * 1024)).toFixed(0);
          const response: ApiResponse = {
            success: false,
            error: `File size exceeds the maximum limit of ${maxMb}MB.`,
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

      if ((err as Error)?.message === 'INVALID_MIME_TYPE') {
        const response: ApiResponse = {
          success: false,
          error: 'Invalid file format. Only JPEG, PNG, WebP, and GIF images are allowed.',
          timestamp: new Date().toISOString(),
        };
        res.status(400).json(response);
        return;
      }

      const response: ApiResponse = {
        success: false,
        error: (err as Error)?.message || 'Failed to process file upload.',
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    if (!req.file) {
      const response: ApiResponse = {
        success: false,
        error: 'No image file was provided in the request.',
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    next();
  });
};
