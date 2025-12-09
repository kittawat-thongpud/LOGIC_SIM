/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'sim-bg': '#1e1e1e',
        'sim-grid': '#2a2a2a',
        'sim-wire-off': '#4b5563',
        'sim-wire-on': '#4ade80',
        'sim-node-body': '#374151',
        'sim-node-border': '#9ca3af',
        'sim-node-selected': '#60a5fa',
        'sim-text': '#e5e7eb',
        'sim-ic-body': '#111827',
        'sim-ic-border': '#3b82f6',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
}
