/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        primary: '#7B2FBE',
        deep: '#5A1E82',
        bright: '#8B2FD1',
        ink: '#0B0B0F',
        charcoal: '#17171C',
        lavender: '#F6F2FA',
        muted: '#6B6472',
        ok: '#22C55E',
        warn: '#F97316',
        bad: '#DC2626',
      },
    },
  },
  plugins: [],
};
