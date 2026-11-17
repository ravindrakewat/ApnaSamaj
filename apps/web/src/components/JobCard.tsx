import React from 'react';
import { Card, CardContent, Typography, Box, Chip, Button, Avatar, Stack } from '@mui/material';
import BusinessIcon from '@mui/icons-material/Business';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import PaymentsIcon from '@mui/icons-material/Payments';
import WorkOutlineIcon from '@mui/icons-material/WorkOutline';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { useNavigate } from 'react-router-dom';
import { ParsedJobListing } from '../services/employment.service';

interface JobCardProps {
  job: ParsedJobListing;
  onApplyClick?: (job: ParsedJobListing) => void;
}

export const JobCard: React.FC<JobCardProps> = ({ job, onApplyClick }) => {
  const navigate = useNavigate();

  const handleCardClick = () => {
    navigate(`/employment/${job.id}`);
  };

  const formattedDate = new Date(job.createdAt).toLocaleDateString('hi-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

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
        {/* Header: Company & Employment Type */}
        <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={1} gap={1}>
          <Box display="flex" alignItems="center" gap={1}>
            <Avatar sx={{ bgcolor: 'primary.light', color: 'primary.main', width: 36, height: 36 }}>
              <BusinessIcon fontSize="small" />
            </Avatar>
            <Box>
              <Typography variant="subtitle2" fontWeight={600} color="text.secondary">
                {job.company}
              </Typography>
              <Typography variant="h6" fontWeight={700} sx={{ lineHeight: 1.3, fontSize: { xs: '1.05rem', sm: '1.2rem' } }}>
                {job.title}
              </Typography>
            </Box>
          </Box>
          <Chip
            size="small"
            label={job.employmentType}
            color="primary"
            variant="outlined"
            sx={{ fontWeight: 600, borderRadius: 1.5 }}
          />
        </Box>

        {/* Badges: Location, Salary, Experience */}
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ my: 1.5 }}>
          <Chip
            size="small"
            icon={<LocationOnIcon fontSize="small" />}
            label={job.location}
            sx={{ bgcolor: '#f1f5f9', color: '#334155', fontWeight: 500 }}
          />
          <Chip
            size="small"
            icon={<PaymentsIcon fontSize="small" />}
            label={job.salary}
            color="success"
            variant="outlined"
            sx={{ fontWeight: 600 }}
          />
          <Chip
            size="small"
            icon={<WorkOutlineIcon fontSize="small" />}
            label={job.experience}
            sx={{ bgcolor: '#f8fafc', color: '#475569' }}
          />
        </Stack>

        {/* Short Description */}
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            mb: 2,
            lineHeight: 1.5,
          }}
        >
          {job.description.replace(/^🏢.*|📍.*|💰.*|💼.*|⏱️.*|📞.*/gm, '').trim()}
        </Typography>

        {/* Footer: Author, Date, Apply CTA */}
        <Box
          display="flex"
          justifyContent="space-between"
          alignItems="center"
          pt={1.5}
          borderTop="1px solid"
          borderColor="divider"
        >
          <Box display="flex" alignItems="center" gap={1}>
            <Avatar
              src={job.authorAvatarUrl || undefined}
              sx={{ width: 24, height: 24, fontSize: '0.75rem', bgcolor: 'primary.main' }}
            >
              {job.authorName.charAt(0)}
            </Avatar>
            <Typography variant="caption" color="text.secondary">
              {job.authorName} · {formattedDate}
            </Typography>
          </Box>

          <Button
            size="small"
            variant="contained"
            color="primary"
            endIcon={<ArrowForwardIcon fontSize="small" />}
            onClick={(e) => {
              e.stopPropagation();
              if (onApplyClick) onApplyClick(job);
              else handleCardClick();
            }}
            sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600, px: 2 }}
          >
            विवरण देखें / View Details
          </Button>
        </Box>
      </CardContent>
    </Card>
  );
};
