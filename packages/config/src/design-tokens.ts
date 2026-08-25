/**
 * Fazoo identity tokens — sophisticated purple-and-black.
 * Shared between the admin portal (CSS custom properties) and the mobile
 * app (theme constants). Client branding (e.g. Lenovo) is configured per
 * organization in the database; these are Fazoo platform defaults.
 */

export const colors = {
  primaryPurple: '#7B2FBE',
  deepPurple: '#5A1E82',
  brightPurple: '#8B2FD1',
  nearBlack: '#0B0B0F',
  charcoal: '#17171C',
  softBackground: '#F6F2FA',
  white: '#FFFFFF',
  mutedText: '#6B6472',
  successGreen: '#22C55E',
  warningOrange: '#F97316',
  errorRed: '#DC2626',
} as const;

export type ColorToken = keyof typeof colors;

/** Status colours always paired with text labels — never colour alone. */
export const statusColors = {
  present: { fg: colors.successGreen, bg: 'rgba(34,197,94,0.12)' },
  sick_leave: { fg: colors.warningOrange, bg: 'rgba(249,115,22,0.12)' },
  weekly_off: { fg: colors.primaryPurple, bg: 'rgba(123,47,190,0.10)' },
  absent: { fg: colors.errorRed, bg: 'rgba(220,38,38,0.12)' },
  open: { fg: colors.warningOrange, bg: 'rgba(249,115,22,0.12)' },
  completed: { fg: colors.successGreen, bg: 'rgba(34,197,94,0.12)' },
  pending: { fg: colors.warningOrange, bg: 'rgba(249,115,22,0.12)' },
  approved: { fg: colors.successGreen, bg: 'rgba(34,197,94,0.12)' },
  rejected: { fg: colors.errorRed, bg: 'rgba(220,38,38,0.12)' },
  suspended: { fg: colors.errorRed, bg: 'rgba(220,38,38,0.12)' },
} as const;
