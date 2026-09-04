/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        primary: '#3139B4',
        deep: '#141454',
        bright: '#4A52D6',
        ink: '#0C0A19',
        charcoal: '#1E2036',
        lavender: '#E8EAF4',
        muted: '#686B73',
        ok: '#22C55E',
        warn: '#F97316',
        bad: '#DC2626',
      },
    },
  },
  plugins: [],
};
