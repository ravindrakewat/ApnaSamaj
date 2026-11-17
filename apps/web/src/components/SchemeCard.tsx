import React from 'react';
import { Card, CardContent, Typography, Box, Chip, Button, Avatar, Stack } from '@mui/material';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import CategoryIcon from '@mui/icons-material/Category';
import GroupIcon from '@mui/icons-material/Group';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import LaunchIcon from '@mui/icons-material/Launch';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { useNavigate } from 'react-router-dom';
import { ParsedGovernmentScheme, SCHEME_CATEGORIES, validateOfficialUrl } from '../services/government-schemes.service';

interface SchemeCardProps {
  scheme: ParsedGovernmentScheme;
}

export const SchemeCard: React.FC<SchemeCardProps> = ({ scheme }) => {
  const navigate = useNavigate();

  const handleCardClick = () => {
    navigate(`/government-schemes/${scheme.id}`);
  };

  const categoryObj = SCHEME_CATEGORIES.find((c) => c.key === scheme.category);
  const categoryLabel = categoryObj ? categoryObj.labelHi : scheme.category;

  const officialUrlCheck = scheme.officialWebsite ? validateOfficialUrl(scheme.officialWebsite) : null;

  return (
    <Card
      elevation={1}
      sx={{
        borderRadius: 3,
        border: '1px solid',
        borderColor: 'divider',
        transition: 'all 0.2s ease-in-out',
        '&:hover': {
          transform: 'translateY(-2px)',
          boxShadow: 3,
          borderColor: 'primary.main',
        },
        cursor: 'pointer',
      }}
      onClick={handleCardClick}
    >
      <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
        {/* Header: Department & Category */}
        <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={1} gap={1}>
          <Box display="flex" alignItems="center" gap={1}>
            <Avatar sx={{ bgcolor: 'secondary.light', color: 'secondary.main', width: 36, height: 36 }}>
              <AccountBalanceIcon fontSize="small" />
            </Avatar>
            <Box>
              <Typography variant="caption" color="text.secondary" fontWeight={600} display="block">
                {scheme.department}
              </Typography>
              <Typography variant="h6" fontWeight={700} sx={{ lineHeight: 1.3, fontSize: { xs: '1.05rem', sm: '1.2rem' } }}>
                {scheme.title}
              </Typography>
            </Box>
          </Box>
          <Chip
            size="small"
            label={categoryLabel}
            color="primary"
            variant="filled"
            sx={{ fontWeight: 600, borderRadius: 1.5 }}
          />
        </Box>

        {/* Badges: Beneficiaries, Location, Deadline */}
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ my: 1.5 }}>
          <Chip
            size="small"
            icon={<GroupIcon fontSize="small" />}
            label={scheme.targetBeneficiaries}
            sx={{ bgcolor: '#f1f5f9', color: '#334155' }}
          />
          <Chip
            size="small"
            icon={<LocationOnIcon fontSize="small" />}
            label={scheme.locationState}
            sx={{ bgcolor: '#f8fafc', color: '#475569' }}
          />
          {scheme.deadline && (
            <Chip
              size="small"
              label={`अंतिम तिथि: ${scheme.deadline}`}
              color="warning"
              variant="outlined"
              sx={{ fontWeight: 600 }}
            />
          )}
        </Stack>

        {/* Benefits Preview */}
        {scheme.benefits && (
          <Box sx={{ bgcolor: '#f0fdf4', border: '1px solid #bbf7d0', p: 1.25, borderRadius: 2, mb: 2 }}>
            <Typography variant="caption" fontWeight={700} color="#166534" display="block">
              ✨ मिलने वाले मुख्य लाभ / Key Benefits:
            </Typography>
            <Typography variant="body2" color="#15803d" sx={{ fontWeight: 500 }}>
              {scheme.benefits}
            </Typography>
          </Box>
        )}

        {/* Footer: Official Link & Details Button */}
        <Box
          display="flex"
          justifyContent="space-between"
          alignItems="center"
          pt={1.5}
          borderTop="1px solid"
          borderColor="divider"
        >
          {officialUrlCheck?.isValid ? (
            <Button
              size="small"
              variant="text"
              color="primary"
              startIcon={<LaunchIcon fontSize="small" />}
              href={officialUrlCheck.normalizedUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              sx={{ textTransform: 'none', fontWeight: 600 }}
            >
              आधिकारिक पोर्टल / Official Portal
            </Button>
          ) : (
            <Typography variant="caption" color="text.secondary">
              Apna Samaj Welfare Scheme
            </Typography>
          )}

          <Button
            size="small"
            variant="contained"
            color="primary"
            endIcon={<ArrowForwardIcon fontSize="small" />}
            onClick={(e) => {
              e.stopPropagation();
              handleCardClick();
            }}
            sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600, px: 2 }}
          >
            पूर्ण विवरण / View Scheme
          </Button>
        </Box>
      </CardContent>
    </Card>
  );
};
