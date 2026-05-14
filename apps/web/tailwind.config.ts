import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          dark:    '#0A0F3F',  // Navy — sidebar bg, page headings
          medium:  '#5AA4C8',  // Primary blue — CTAs, active states, borders
          light:   '#D0E0F0',  // Light blue — info boxes, badge bg, hover states
          lighter: '#EAF4FB',  // Very light blue — card hover, subtle fills
        },
        gold: {
          DEFAULT: '#B5833A',  // Amber gold — warnings, highlights, premium accents
          light:   '#F0DC90',  // Pastel yellow — gold info boxes, warning bg
        },
        surface: {
          page:  '#F0F0F0',  // Soft white — page background
          card:  '#FFFFFF',  // Card / panel background
          muted: '#D8DCE8',  // Blue-tinted — dividers, subtle borders
        },
        accent: {
          purple: '#C8C8F0',  // Soft purple — optional accent fills
        },
        role: {
          superadmin: '#7C3AED', // Purple badge — platform admin
          admin:      '#5AA4C8', // Blue badge — tenant admin (matches primary-blue)
          manager:    '#D97706', // Orange badge
          operator:   '#6B7280', // Gray badge
          quality:    '#7C3AED', // Purple badge
          viewer:     '#6B7280', // Gray badge
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
