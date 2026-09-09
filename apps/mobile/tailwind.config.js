/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Sora'],
      },
      colors: {
        primary: '#7B2FBE',
        deep: '#5A1E82',
        bright: '#9B4FE8',
        primaryText: '#7B2FBE',
        primaryGlow: '#9333EA',
        backdrop: '#F6F4FB',
        surface: 'rgba(255,255,255,0.94)',
        edge: 'rgba(26,21,38,0.08)',
        ink: '#1B1623',
        charcoal: '#4A4358',
        lavender: 'rgba(123,47,190,0.07)',
        muted: '#6E667F',
        ok: '#16A34A',
        warn: '#D97706',
        bad: '#DC2626',
      },
    },
  },
  plugins: [],
};
