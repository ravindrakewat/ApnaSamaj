import React from 'react';
import { Box, Typography } from '@mui/material';

export interface ApnaSamajLogoProps {
  size?: number;
  showText?: boolean;
  textColor?: string;
  subtextColor?: string;
}

export const ApnaSamajLogo: React.FC<ApnaSamajLogoProps> = ({
  size = 38,
  showText = true,
  textColor = 'primary.main',
  subtextColor = 'text.secondary',
}) => {
  return (
    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1.25, userSelect: 'none' }}>
      <Box
        component="img"
        src="/favicon.svg"
        alt="Apna Samaj Logo"
        sx={{
          width: size,
          height: size,
          borderRadius: `${Math.round(size * 0.24)}px`,
          boxShadow: '0 2px 8px rgba(30, 58, 138, 0.25)',
          flexShrink: 0,
          transition: 'transform 0.2s ease-in-out',
          '&:hover': {
            transform: 'scale(1.05)',
          },
        }}
      />
      {showText && (
        <Box sx={{ display: 'flex', flexDirection: 'column' }}>
          <Typography
            variant="h6"
            component="span"
            sx={{
              fontWeight: 800,
              color: textColor,
              lineHeight: 1.15,
              fontSize: `${Math.max(16, Math.round(size * 0.52))}px`,
              letterSpacing: '-0.02em',
            }}
          >
            Apna Samaj
          </Typography>
          <Typography
            variant="caption"
            component="span"
            sx={{
              color: subtextColor,
              lineHeight: 1.1,
              fontSize: '11px',
              fontWeight: 600,
              opacity: 0.85,
            }}
          >
            अपना समाज • Community
          </Typography>
        </Box>
      )}
    </Box>
  );
};
