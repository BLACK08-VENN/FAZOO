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
        primary: '#875CFF',
        deep: '#080616',
        bright: '#6CE5FF',
        ink: '#F8F7FF',
        charcoal: '#CBC7E7',
        lavender: '#17122E',
        muted: '#9B95B8',
        ok: '#55E6B1',
        warn: '#FFC765',
        bad: '#FF7096',
      },
    },
  },
  plugins: [],
};
