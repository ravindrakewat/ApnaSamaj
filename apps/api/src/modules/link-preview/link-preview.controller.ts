import { Response } from 'express';
import { ApiResponse, LinkPreviewMetadata } from '@apnasamaj/shared-types';
import { getLinkPreviewQuerySchema } from '@apnasamaj/validation';
import { AuthenticatedRequest } from '../../middleware/authenticate';
import {
  getLinkPreviewMetadata,
  LinkPreviewError,
} from '../../services/link-preview.service';

/**
 * POST /api/v1/link-preview
 * Fetches SSRF-protected metadata and generates a rich preview card for a submitted URL.
 */
export async function getLinkPreviewHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      const response: ApiResponse = {
        success: false,
        error: 'Authentication required to generate link previews.',
        timestamp: new Date().toISOString(),
      };
      res.status(401).json(response);
      return;
    }

    const parsed = getLinkPreviewQuerySchema.safeParse(req.body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0]?.message || 'A valid URL is required.';
      const response: ApiResponse = {
        success: false,
        error: issue,
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    const metadata = await getLinkPreviewMetadata(parsed.data.url);

    const response: ApiResponse<LinkPreviewMetadata> = {
      success: true,
      message: 'Link preview metadata retrieved successfully.',
      data: metadata,
      timestamp: new Date().toISOString(),
    };
    res.status(200).json(response);
  } catch (err: unknown) {
    if (err instanceof LinkPreviewError) {
      const response: ApiResponse = {
        success: false,
        error: err.message,
        timestamp: new Date().toISOString(),
      };
      res.status(err.statusCode).json(response);
      return;
    }

    console.error('[LinkPreview Controller] Unexpected error:', err);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to generate link preview. Please try again.',
      timestamp: new Date().toISOString(),
    };
    res.status(500).json(response);
  }
}
