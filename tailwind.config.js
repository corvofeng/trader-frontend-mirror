/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      boxShadow: {
        'fin-subtle': '0 1px 3px 0 rgba(15, 23, 42, 0.05), 0 1px 2px -1px rgba(15, 23, 42, 0.05)',
        'fin-card': '0 2px 4px rgba(15, 23, 42, 0.03), 0 10px 24px -4px rgba(15, 23, 42, 0.08), 0 0 0 1px rgba(15, 23, 42, 0.04)',
        'fin-card-dark': '0 0 0 1px rgba(255, 255, 255, 0.07), 0 4px 18px -2px rgba(0, 0, 0, 0.7), 0 16px 36px -4px rgba(0, 0, 0, 0.9)',
        'fin-floating': '0 8px 30px -4px rgba(15, 23, 42, 0.15), 0 20px 48px -8px rgba(15, 23, 42, 0.18)',
        'fin-floating-dark': '0 0 0 1px rgba(255, 255, 255, 0.1), 0 12px 36px -4px rgba(0, 0, 0, 0.8), 0 24px 64px -8px rgba(0, 0, 0, 0.95)',
      },
      transitionTimingFunction: {
        'emil-out': 'cubic-bezier(0.23, 1, 0.32, 1)',
        'emil-in-out': 'cubic-bezier(0.77, 0, 0.175, 1)',
        'spring-snappy': 'cubic-bezier(0.19, 1, 0.22, 1)',
      },
      animation: {
        'fade-in': 'fadeIn 0.2s cubic-bezier(0.23, 1, 0.32, 1)',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'scale(0.97)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
      },
    },
  },
  plugins: [],
};