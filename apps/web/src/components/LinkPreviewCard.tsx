import React, { useState } from 'react';
import {
  Box,
  Typography,
  Chip,
  IconButton,
  Link,
  useTheme,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import YouTubeIcon from '@mui/icons-material/YouTube';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import LanguageIcon from '@mui/icons-material/Language';
import { LinkPreviewMetadata } from '@apnasamaj/shared-types';

interface LinkPreviewCardProps {
  preview: LinkPreviewMetadata;
  onRemove?: () => void;
  showRemoveButton?: boolean;
}

export const LinkPreviewCard: React.FC<LinkPreviewCardProps> = ({
  preview,
  onRemove,
  showRemoveButton = false,
}) => {
  const theme = useTheme();
  const [imageError, setImageError] = useState(false);

  const getDomain = (urlStr: string): string => {
    try {
      const parsed = new URL(urlStr);
      return parsed.hostname.replace(/^www\./, '');
    } catch {
      return urlStr;
    }
  };

  const domain = getDomain(preview.url);

  // Provider branding
  let providerColor: 'error' | 'warning' | 'primary' | 'default' = 'default';
  let providerIcon = <LanguageIcon fontSize="small" />;
  let providerLabel = preview.siteName || domain;

  if (preview.provider === 'youtube') {
    providerColor = 'error';
    providerIcon = <YouTubeIcon fontSize="small" sx={{ color: '#ff0000' }} />;
    providerLabel = 'YouTube';
  } else if (preview.provider === 'amazon') {
    providerColor = 'warning';
    providerIcon = <ShoppingCartIcon fontSize="small" sx={{ color: '#ff9900' }} />;
    providerLabel = 'Amazon';
  }

  const handleCardClick = (e: React.MouseEvent) => {
    // If clicked on remove button, do not navigate
    if ((e.target as HTMLElement).closest('.preview-remove-btn')) {
      return;
    }
    window.open(preview.url, '_blank', 'noopener,noreferrer');
  };

  const hasThumbnail = Boolean(preview.thumbnailUrl && !imageError);

  return (
    <Box
      onClick={handleCardClick}
      sx={{
        position: 'relative',
        display: 'flex',
        flexDirection: { xs: 'column', sm: hasThumbnail ? 'row' : 'column' },
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 2.5,
        overflow: 'hidden',
        bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.04)' : '#f8fafc',
        cursor: 'pointer',
        transition: 'all 0.2s ease-in-out',
        '&:hover': {
          borderColor: 'primary.main',
          boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
          transform: 'translateY(-1px)',
        },
        my: 1.5,
      }}
    >
      {/* Remove Button for Composer Mode */}
      {showRemoveButton && onRemove && (
        <IconButton
          className="preview-remove-btn"
          size="small"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          sx={{
            position: 'absolute',
            top: 6,
            right: 6,
            zIndex: 2,
            bgcolor: 'rgba(0,0,0,0.6)',
            color: '#ffffff',
            '&:hover': {
              bgcolor: 'rgba(0,0,0,0.8)',
            },
          }}
          aria-label="Remove link preview"
        >
          <CloseIcon sx={{ fontSize: 16 }} />
        </IconButton>
      )}

      {/* Thumbnail or Fallback Icon */}
      {hasThumbnail ? (
        <Box
          sx={{
            width: { xs: '100%', sm: 180 },
            minWidth: { xs: '100%', sm: 180 },
            height: { xs: 160, sm: 'auto' },
            minHeight: { sm: 110 },
            position: 'relative',
            bgcolor: 'rgba(0,0,0,0.05)',
            overflow: 'hidden',
          }}
        >
          <img
            src={preview.thumbnailUrl!}
            alt={preview.title || 'Link thumbnail'}
            onError={() => setImageError(true)}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              display: 'block',
            }}
            loading="lazy"
          />
        </Box>
      ) : (
        <Box
          sx={{
            p: 2,
            pb: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 1,
          }}
        >
          {providerIcon}
          <Typography variant="caption" fontWeight="bold" color="text.secondary">
            {domain}
          </Typography>
        </Box>
      )}

      {/* Text Info */}
      <Box sx={{ p: 1.5, flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        {/* Provider Chip & Domain */}
        {hasThumbnail && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
            <Chip
              size="small"
              icon={providerIcon}
              label={providerLabel}
              variant="outlined"
              color={providerColor}
              sx={{ height: 22, fontSize: '0.72rem', fontWeight: 600 }}
            />
            <Typography variant="caption" color="text.secondary" noWrap>
              {domain}
            </Typography>
          </Box>
        )}

        {/* Title */}
        <Typography
          variant="subtitle2"
          fontWeight="bold"
          sx={{
            lineHeight: 1.3,
            mb: 0.5,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            color: 'text.primary',
          }}
        >
          {preview.title}
        </Typography>

        {/* Description */}
        {preview.description && (
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{
              lineHeight: 1.35,
              fontSize: '0.8rem',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              mb: 0.75,
            }}
          >
            {preview.description}
          </Typography>
        )}

        {/* Bottom Link Action */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 'auto' }}>
          <Link
            href={preview.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 0.5,
              fontSize: '0.75rem',
              fontWeight: 500,
              textDecoration: 'none',
              color: 'primary.main',
              '&:hover': { textDecoration: 'underline' },
            }}
          >
            <span>{preview.url.length > 50 ? preview.url.slice(0, 47) + '…' : preview.url}</span>
            <OpenInNewIcon sx={{ fontSize: 13 }} />
          </Link>
        </Box>
      </Box>
    </Box>
  );
};
