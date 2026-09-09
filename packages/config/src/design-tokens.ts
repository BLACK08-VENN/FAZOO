/**
 * Fazoo identity tokens — sophisticated purple-white.
 * Shared between the admin portal (CSS custom properties) and the mobile
 * app (theme constants). Client branding (e.g. Lenovo) is configured per
 * organization in the database; these are Fazoo platform defaults.
 *
 * Mobile ships a light premium theme (2026-09): soft lavender-white
 * surfaces, crisp white glass cards, brand-purple accents, and gradient
 * primary buttons.
 */

export const colors = {
  primaryPurple: '#7B2FBE',
  deepPurple: '#5A1E82',
  brightPurple: '#9B4FE8',
  primaryText: '#7B2FBE',
  primaryGlow: '#9333EA',
  nearBlack: '#F6F4FB',
  surface: 'rgba(255,255,255,0.94)',
  edge: 'rgba(26,21,38,0.08)',
  softBackground: 'rgba(123,47,190,0.07)',
  white: '#1B1623',
  mutedText: '#6E667F',
  successGreen: '#16A34A',
  warningOrange: '#D97706',
  errorRed: '#DC2626',
} as const;

export type ColorToken = keyof typeof colors;

/** Status colours always paired with text labels — never colour alone. */
export const statusColors = {
  present: { fg: colors.successGreen, bg: 'rgba(74,222,128,0.12)' },
  sick_leave: { fg: colors.warningOrange, bg: 'rgba(251,146,60,0.12)' },
  weekly_off: { fg: colors.primaryGlow, bg: 'rgba(165,87,224,0.14)' },
  absent: { fg: colors.errorRed, bg: 'rgba(248,113,113,0.12)' },
  open: { fg: colors.warningOrange, bg: 'rgba(251,146,60,0.12)' },
  completed: { fg: colors.successGreen, bg: 'rgba(74,222,128,0.12)' },
  pending: { fg: colors.warningOrange, bg: 'rgba(251,146,60,0.12)' },
  approved: { fg: colors.successGreen, bg: 'rgba(74,222,128,0.12)' },
  rejected: { fg: colors.errorRed, bg: 'rgba(248,113,113,0.12)' },
  suspended: { fg: colors.errorRed, bg: 'rgba(248,113,113,0.12)' },
} as const;
