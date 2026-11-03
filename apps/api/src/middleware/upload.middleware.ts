import os from 'os';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
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


const videoTempDir = path.join(os.tmpdir(), 'apnasamaj-video-uploads');
if (!fs.existsSync(videoTempDir)) {
  try {
    fs.mkdirSync(videoTempDir, { recursive: true });
  } catch (err) {
    console.warn('[Upload Middleware] Could not create video temp dir:', err);
  }
}

const videoDiskStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, videoTempDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeExt = ext === '.mp4' || ext === '.webm' ? ext : '.tmp';
    const unique = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${safeExt}`;
    cb(null, unique);
  },
});

const allowedVideoMimes = ['video/mp4', 'video/webm'];

function videoFileFilter(
  _req: Request,
  file: Express.Multer.File,
  callback: FileFilterCallback
): void {
  if (allowedVideoMimes.includes(file.mimetype)) {
    callback(null, true);
  } else {
    callback(new Error('INVALID_MIME_TYPE'));
  }
}

const videoUpload = multer({
  storage: videoDiskStorage,
  limits: {
    fileSize: config.maxVideoFileSizeBytes, // 30MB
    files: 1,
  },
  fileFilter: videoFileFilter,
});

export const singleVideoUpload = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  videoUpload.single('file')(req, res, (err: unknown) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          const maxMb = (config.maxVideoFileSizeBytes / (1024 * 1024)).toFixed(0);
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
          error: 'Invalid file format. Only MP4 and WebM videos are allowed.',
          timestamp: new Date().toISOString(),
        };
        res.status(400).json(response);
        return;
      }

      const response: ApiResponse = {
        success: false,
        error: (err as Error)?.message || 'Failed to process video file upload.',
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    if (!req.file) {
      const response: ApiResponse = {
        success: false,
        error: 'No video file was provided in the request.',
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    next();
  });
};


const allowedDocumentMimes = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
];

function documentFileFilter(
  _req: Request,
  file: Express.Multer.File,
  callback: FileFilterCallback
): void {
  if (allowedDocumentMimes.includes(file.mimetype)) {
    callback(null, true);
  } else {
    callback(new Error('INVALID_MIME_TYPE'));
  }
}

const documentUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
    files: 1,
  },
  fileFilter: documentFileFilter,
});

export const singleDocumentUpload = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  documentUpload.single('file')(req, res, (err: unknown) => {
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

      if ((err as Error)?.message === 'INVALID_MIME_TYPE') {
        const response: ApiResponse = {
          success: false,
          error: 'Invalid file format. Only PDF, JPEG, PNG, and WebP documents are allowed.',
          timestamp: new Date().toISOString(),
        };
        res.status(400).json(response);
        return;
      }

      const response: ApiResponse = {
        success: false,
        error: (err as Error)?.message || 'Failed to process document file upload.',
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    if (!req.file) {
      const response: ApiResponse = {
        success: false,
        error: 'No file was provided in the request.',
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    next();
  });
};
