import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          dark:    '#1A3D2B',  // Sidebar background, H1 headings
          medium:  '#2D6A4F',  // Buttons primary, H2 headings, active borders
          light:   '#D8F3DC',  // Info boxes, success badges
          lighter: '#F0FAF3',  // Sidebar hover states
        },
        gold: {
          DEFAULT: '#B5833A',  // Section labels, H3, accents, warnings
          light:   '#FFF3DC',  // Gold info boxes
        },
        surface: {
          page:  '#F5F5F0',  // Page background
          card:  '#FFFFFF',  // Card / panel background
          muted: '#E0E0D8',  // Dividers, muted borders
        },
        role: {
          superadmin: '#7C3AED', // Purple badge — platform admin
          admin:      '#2D6A4F', // Green badge — tenant admin
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
