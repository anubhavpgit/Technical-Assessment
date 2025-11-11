/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Notion-inspired color palette
        notion: {
          bg: {
            primary: '#ffffff',
            secondary: '#f7f6f3',
            tertiary: '#f1f1ef',
          },
          border: {
            DEFAULT: '#e9e9e7',
            light: '#f1f1ef',
            dark: '#d3d3d1',
          },
          text: {
            primary: '#37352f',
            secondary: '#787774',
            tertiary: '#9b9a97',
          },
          accent: {
            blue: '#2383e2',
            purple: '#9065b0',
            red: '#d44c47',
            green: '#4dab9a',
            yellow: '#dfab01',
            gray: '#9b9a97',
          },
          surface: {
            gray: '#f7f6f3',
            blue: '#e8f3f8',
            purple: '#f4f0f7',
            red: '#fceeed',
            green: '#edf6f4',
            yellow: '#fef8e7',
          }
        }
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
      },
      fontSize: {
        'xs': ['0.75rem', { lineHeight: '1rem' }],
        'sm': ['0.875rem', { lineHeight: '1.25rem' }],
        'base': ['1rem', { lineHeight: '1.5rem' }],
        'lg': ['1.125rem', { lineHeight: '1.75rem' }],
        'xl': ['1.25rem', { lineHeight: '1.75rem' }],
        '2xl': ['1.5rem', { lineHeight: '2rem' }],
        '3xl': ['1.875rem', { lineHeight: '2.25rem' }],
        '4xl': ['2.25rem', { lineHeight: '2.5rem' }],
      },
      spacing: {
        '18': '4.5rem',
        '88': '22rem',
        '112': '28rem',
        '128': '32rem',
      },
      borderRadius: {
        'notion': '0.1875rem', // 3px - Notion's subtle radius
      },
      boxShadow: {
        'notion': '0 1px 3px rgba(0, 0, 0, 0.05)',
        'notion-md': '0 2px 6px rgba(0, 0, 0, 0.08)',
        'notion-lg': '0 4px 12px rgba(0, 0, 0, 0.1)',
        'notion-xl': '0 8px 24px rgba(0, 0, 0, 0.12)',
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-in',
        'slide-up': 'slideUp 0.2s ease-out',
        'slide-down': 'slideDown 0.2s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        slideDown: {
          '0%': { transform: 'translateY(-10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}
