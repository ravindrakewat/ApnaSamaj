import React, { useState } from 'react';
import {
  Box,
  Button,
  IconButton,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Tooltip,
  Typography,
} from '@mui/material';
import TranslateIcon from '@mui/icons-material/Translate';
import CheckIcon from '@mui/icons-material/Check';
import {
  useTranslation,
  changeLanguage,
  getCurrentLanguage,
  LANGUAGE_NAMES,
  SUPPORTED_LANGUAGES,
  SupportedLanguage,
} from '@apnasamaj/i18n';

interface LanguageSelectorProps {
  variant?: 'auto' | 'icon-only' | 'button-only';
}

export const LanguageSelector: React.FC<LanguageSelectorProps> = ({ variant = 'auto' }) => {
  const { t, i18n } = useTranslation('nav');
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);

  const currentLang =
    i18n.language && (i18n.language === 'hi' || i18n.language === 'en')
      ? (i18n.language as SupportedLanguage)
      : getCurrentLanguage();

  const handleOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleSelectLanguage = async (lang: SupportedLanguage) => {
    handleClose();
    if (lang !== currentLang) {
      await changeLanguage(lang);
    }
  };

  const currentLabel = LANGUAGE_NAMES[currentLang] || LANGUAGE_NAMES.hi;
  const tooltipText = t('changeLanguage', 'भाषा बदलें / Change Language');

  return (
    <Box sx={{ display: 'inline-flex', alignItems: 'center' }}>
      <Tooltip title={tooltipText}>
        {/* On mobile / small screens, render compact IconButton */}
        <Box sx={{ display: variant === 'button-only' ? 'none' : { xs: 'inline-flex', sm: variant === 'icon-only' ? 'inline-flex' : 'none' } }}>
          <IconButton
            onClick={handleOpen}
            color="inherit"
            size="small"
            aria-label={t('selectLanguage', 'भाषा चुनें / Select language')}
            aria-haspopup="true"
            aria-expanded={open ? 'true' : 'false'}
            aria-controls={open ? 'language-menu' : undefined}
            sx={{
              border: 1,
              borderColor: 'divider',
              borderRadius: 1.5,
              p: 0.75,
            }}
          >
            <TranslateIcon fontSize="small" color="primary" />
          </IconButton>
        </Box>
      </Tooltip>

      <Tooltip title={tooltipText}>
        {/* On desktop / tablet, render Button with label */}
        <Box sx={{ display: variant === 'icon-only' ? 'none' : { xs: 'none', sm: 'inline-flex' } }}>
          <Button
            onClick={handleOpen}
            color="inherit"
            size="small"
            startIcon={<TranslateIcon color="primary" sx={{ fontSize: 18 }} />}
            aria-label={t('selectLanguage', 'भाषा चुनें / Select language')}
            aria-haspopup="true"
            aria-expanded={open ? 'true' : 'false'}
            aria-controls={open ? 'language-menu' : undefined}
            sx={{
              textTransform: 'none',
              fontWeight: 500,
              border: 1,
              borderColor: 'divider',
              borderRadius: 1.5,
              px: 1.25,
              py: 0.5,
              minWidth: 'auto',
              '&:hover': {
                borderColor: 'primary.main',
                bgcolor: 'action.hover',
              },
            }}
          >
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {currentLabel}
            </Typography>
          </Button>
        </Box>
      </Tooltip>

      <Menu
        id="language-menu"
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        MenuListProps={{
          'aria-labelledby': 'language-button',
          role: 'menu',
        }}
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'right',
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'right',
        }}
        PaperProps={{
          elevation: 3,
          sx: {
            mt: 1,
            minWidth: 160,
            borderRadius: 2,
            boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
          },
        }}
      >
        {SUPPORTED_LANGUAGES.map((lang) => {
          const isSelected = currentLang === lang;
          return (
            <MenuItem
              key={lang}
              selected={isSelected}
              onClick={() => handleSelectLanguage(lang)}
              sx={{
                py: 1,
                px: 2,
                display: 'flex',
                justifyContent: 'space-between',
                fontWeight: isSelected ? 600 : 400,
              }}
            >
              <ListItemText
                primary={LANGUAGE_NAMES[lang]}
                secondary={lang === 'hi' ? 'Hindi' : 'अंग्रेज़ी'}
                primaryTypographyProps={{
                  fontWeight: isSelected ? 600 : 400,
                  color: isSelected ? 'primary.main' : 'text.primary',
                }}
                secondaryTypographyProps={{
                  variant: 'caption',
                }}
              />
              {isSelected && (
                <ListItemIcon sx={{ minWidth: 'auto', color: 'primary.main', ml: 1 }}>
                  <CheckIcon fontSize="small" />
                </ListItemIcon>
              )}
            </MenuItem>
          );
        })}
      </Menu>
    </Box>
  );
};
