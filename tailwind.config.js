/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        serif: ['Fraunces', 'Georgia', 'serif'],
        sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
      },
      colors: {
        forest: {
          800: '#1c2820',
          900: '#121b15',
          950: '#0b130e',
        },
        moss: {
          700: '#2d3b2e',
          800: '#222f24',
          900: '#172218',
        },
        honey: {
          50: '#fdfbf7',
          100: '#f9f5ec',
          200: '#f2e8d3',
          300: '#e7d4ad',
          400: '#d7b97e',
          500: '#c29a53',
          600: '#a77d3c',
          700: '#87602e',
          800: '#6d4c27',
          900: '#573d22',
        },
        sand: {
          50: '#faf8f5',
          100: '#f4f0e8',
          200: '#e8dfd0',
          300: '#d9ccb7',
          400: '#b8a68e',
          500: '#9b876f',
        },
      },
      animation: {
        'drift-subtle': 'drift 10s ease-in-out infinite',
        'flight-bee': 'flight 7s ease-in-out infinite',
        'wing-flutter': 'flutter 0.12s ease-in-out infinite alternate',
      },
      keyframes: {
        drift: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-6px)' },
        },
        flight: {
          '0%, 100%': { transform: 'translate(0px, 0px) rotate(0deg)' },
          '33%': { transform: 'translate(10px, -14px) rotate(4deg)' },
          '66%': { transform: 'translate(-8px, -6px) rotate(-3deg)' },
        },
        flutter: {
          '0%': { opacity: '0.4', transform: 'scaleY(0.85)' },
          '100%': { opacity: '0.85', transform: 'scaleY(1.15)' },
        },
      },
    },
  },
  plugins: [],
};
