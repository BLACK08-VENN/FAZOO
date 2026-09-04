/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        primary: '#7C5CFF',
        deep: '#151233',
        bright: '#34D1FF',
        ink: '#F4F7FF',
        charcoal: '#C9D2F3',
        lavender: '#1B173E',
        muted: '#93A0C8',
        ok: '#2CE6A6',
        warn: '#FFB84D',
        bad: '#FF6B8A',
      },
    },
  },
  plugins: [],
};
