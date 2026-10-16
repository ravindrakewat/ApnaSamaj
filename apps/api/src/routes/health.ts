import { Router, Request, Response } from 'express';
import { ApiResponse, HealthCheckResponse } from '@apnasamaj/shared-types';

export const healthRouter = Router();

healthRouter.get('/health', (_req: Request, res: Response<ApiResponse<HealthCheckResponse>>) => {
  res.status(200).json({
    success: true,
    message: 'Apna Samaj API is healthy',
    data: {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
    },
    timestamp: new Date().toISOString(),
  });
});
