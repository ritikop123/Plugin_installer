/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        arix: {
          bg: '#0a0d14',
          surface: '#101522',
          surfaceLight: '#161c2e',
          surfaceHover: '#1d253c',
          border: '#1e293b',
          borderGlow: '#00d2ff',
          accent: '#00d2ff',
          accentHover: '#38bdf8',
          purple: '#7952ff',
          textMuted: '#94a3b8',
          textBase: '#f1f5f9',
          success: '#10b981',
          warning: '#f59e0b',
          danger: '#ef4444',
        }
      },
      boxShadow: {
        'arix-glow': '0 0 20px -5px rgba(0, 210, 255, 0.25)',
        'arix-card': '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
        'arix-modal': '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      }
    },
  },
  plugins: [],
};
