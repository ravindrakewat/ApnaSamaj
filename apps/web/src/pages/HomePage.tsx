import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Container,
  Paper,
  Box,
  Typography,
  Button,
  Grid,
  Card,
  CardContent,
  Chip,
  Stack,
} from '@mui/material';
import GroupsIcon from '@mui/icons-material/Groups';
import HowToRegIcon from '@mui/icons-material/HowToReg';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import LoginIcon from '@mui/icons-material/Login';
import BadgeIcon from '@mui/icons-material/Badge';
import SecurityIcon from '@mui/icons-material/Security';
import EventIcon from '@mui/icons-material/Event';
import DynamicFeedIcon from '@mui/icons-material/DynamicFeed';
import { useAuth } from '../context/AuthContext';

export const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  return (
    <Container maxWidth="lg" sx={{ py: 6 }}>
      {/* Hero Section */}
      <Paper
        elevation={2}
        sx={{
          p: { xs: 4, sm: 6 },
          borderRadius: 4,
          background: 'linear-gradient(135deg, #1e3c72 0%, #2a5298 100%)',
          color: 'white',
          textAlign: 'center',
          mb: 6,
        }}
      >
        <Box display="inline-flex" p={2} borderRadius="50%" bgcolor="rgba(255,255,255,0.15)" mb={2}>
          <GroupsIcon sx={{ fontSize: 48, color: 'white' }} />
        </Box>
        <Typography variant="h3" component="h1" fontWeight="bold" gutterBottom sx={{ fontSize: { xs: '2rem', sm: '2.8rem' } }}>
          Apna Samaj
        </Typography>
        <Typography variant="h6" sx={{ opacity: 0.9, maxWidth: 640, mx: 'auto', mb: 4, fontWeight: 400 }}>
          The digital platform connecting families, preserving heritage, and fostering community solidarity across India and worldwide.
        </Typography>

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} justifyContent="center">
          {user ? (
            <>
              <Button
                variant="contained"
                size="large"
                startIcon={<DynamicFeedIcon />}
                onClick={() => navigate('/feed')}
                sx={{
                  px: 4,
                  py: 1.5,
                  fontWeight: 600,
                  borderRadius: 3,
                  bgcolor: '#ff9800',
                  color: 'white',
                  '&:hover': { bgcolor: '#f57c00' },
                }}
              >
                Community Feed
              </Button>
              <Button
                variant="outlined"
                size="large"
                startIcon={<AccountCircleIcon />}
                onClick={() => navigate('/profile')}
                sx={{
                  px: 4,
                  py: 1.5,
                  fontWeight: 600,
                  borderRadius: 3,
                  bgcolor: '#ffffff',
                  color: '#1e3c72',
                  '&:hover': { bgcolor: '#f0f0f0' },
                }}
              >
                My Profile ({user.fullName || user.phone})
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="contained"
                size="large"
                startIcon={<HowToRegIcon />}
                onClick={() => navigate('/register')}
                sx={{ px: 4, py: 1.5, fontWeight: 600, borderRadius: 3, bgcolor: '#ff9800', '&:hover': { bgcolor: '#f57c00' } }}
              >
                Register as Member
              </Button>
              <Button
                variant="outlined"
                size="large"
                startIcon={<LoginIcon />}
                onClick={() => navigate('/login')}
                sx={{ px: 4, py: 1.5, fontWeight: 600, borderRadius: 3, color: 'white', borderColor: 'white', '&:hover': { borderColor: '#f0f0f0', bgcolor: 'rgba(255,255,255,0.1)' } }}
              >
                Member Login
              </Button>
            </>
          )}
        </Stack>
      </Paper>

      {/* Highlights / Features */}
      <Typography variant="h5" component="h2" fontWeight="bold" textAlign="center" gutterBottom>
        Community Foundation Pillars
      </Typography>
      <Typography variant="body1" color="text.secondary" textAlign="center" sx={{ mb: 4, maxWidth: 600, mx: 'auto' }}>
        Built with bank-grade security, identity privacy, and member empowerment at its heart.
      </Typography>

      <Grid container spacing={3}>
        <Grid item xs={12} sm={4}>
          <Card
            elevation={1}
            onClick={() => navigate('/directory')}
            sx={{
              borderRadius: 3,
              height: '100%',
              p: 1,
              cursor: 'pointer',
              transition: 'transform 0.15s ease-in-out, box-shadow 0.15s ease-in-out',
              '&:hover': {
                transform: 'translateY(-3px)',
                boxShadow: 3,
              },
            }}
          >
            <CardContent>
              <Box display="inline-flex" p={1.5} borderRadius={2} bgcolor="primary.light" color="primary.main" mb={2}>
                <BadgeIcon sx={{ fontSize: 28 }} />
              </Box>
              <Typography variant="h6" fontWeight="bold" gutterBottom>
                Verified Directory
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Connect with verified members of the samaj with lineage, sub-caste, and gotra identity safeguards.
              </Typography>
              <Box mt={2}>
                <Chip label="Explore Directory →" size="small" color="primary" variant="filled" clickable />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={4}>
          <Card elevation={1} sx={{ borderRadius: 3, height: '100%', p: 1 }}>
            <CardContent>
              <Box display="inline-flex" p={1.5} borderRadius={2} bgcolor="warning.light" color="warning.main" mb={2}>
                <SecurityIcon sx={{ fontSize: 28 }} />
              </Box>
              <Typography variant="h6" fontWeight="bold" gutterBottom>
                Privacy & Role Security
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Protected personal phone numbers, tamper-proof administrative controls, and Argon2id cryptographic hashing.
              </Typography>
              <Box mt={2}>
                <Chip label="Strict Least-Privilege" size="small" color="primary" variant="outlined" />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={4}>
          <Card elevation={1} sx={{ borderRadius: 3, height: '100%', p: 1 }}>
            <CardContent>
              <Box display="inline-flex" p={1.5} borderRadius={2} bgcolor="info.light" color="info.main" mb={2}>
                <EventIcon sx={{ fontSize: 28 }} />
              </Box>
              <Typography variant="h6" fontWeight="bold" gutterBottom>
                Events & Matrimony
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Community announcements, festival gatherings, youth initiatives, and matrimonial connections.
              </Typography>
              <Box mt={2}>
                <Chip label="Upcoming Modules" size="small" variant="outlined" />
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Container>
  );
};
