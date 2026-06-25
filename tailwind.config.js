/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        primary: '#0274DF',
        accent: '#208AEF',
        danger: '#EF4444',
        ink: '#0A0A0A',
        surface: '#141414',
        lift: '#1E1E1E',
        line: '#2A2A2A',
        ghost: '#888888',
        paper: '#F2F2F2',
      },
      fontFamily: {
        sans: ['JetBrainsMono_400Regular', 'sans-serif'],
        medium: ['JetBrainsMono_500Medium', 'sans-serif'],
        semibold: ['JetBrainsMono_600SemiBold', 'sans-serif'],
        bold: ['JetBrainsMono_700Bold', 'sans-serif'],
        mono: ['JetBrainsMono_400Regular', 'monospace'],
        'mono-bold': ['JetBrainsMono_700Bold', 'monospace'],
      },
    },
  },
  plugins: [],
};
