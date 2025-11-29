/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Claymorphism candy pastels
        clay: {
          bg: '#E8F4F0',
          surface: '#F2F9F7',
          mint: '#A8E6CF',
          peach: '#FFB5A7',
          lavender: '#D4C1EC',
          butter: '#FFF3B0',
          coral: '#FF8B94',
          sky: '#B8E0FF',
        },
        cream: '#FDF8F3',
        'warm-white': '#FFFCF9',
        sage: {
          DEFAULT: '#4A6741',
          light: '#6B8F5E',
          dark: '#3A5233',
        },
        terracotta: {
          DEFAULT: '#C4704B',
          light: '#E08A62',
        },
        charcoal: {
          DEFAULT: '#2D2D2D',
          light: '#4A4A4A',
        },
      },
      fontFamily: {
        display: ['Nunito', 'Quicksand', 'sans-serif'],
        body: ['Nunito', 'Quicksand', 'sans-serif'],
      },
      borderRadius: {
        'clay': '24px',
        'clay-lg': '32px',
        'clay-xl': '40px',
        'clay-pill': '9999px',
      },
      boxShadow: {
        'clay': '8px 8px 16px rgba(163, 177, 198, 0.5), -8px -8px 16px rgba(255, 255, 255, 0.8), inset 2px 2px 4px rgba(255, 255, 255, 0.6)',
        'clay-sm': '4px 4px 8px rgba(163, 177, 198, 0.4), -4px -4px 8px rgba(255, 255, 255, 0.7), inset 1px 1px 2px rgba(255, 255, 255, 0.5)',
        'clay-lg': '12px 12px 24px rgba(163, 177, 198, 0.5), -12px -12px 24px rgba(255, 255, 255, 0.9), inset 3px 3px 6px rgba(255, 255, 255, 0.7)',
        'clay-pressed': 'inset 4px 4px 8px rgba(163, 177, 198, 0.5), inset -4px -4px 8px rgba(255, 255, 255, 0.7)',
        'clay-float': '16px 16px 32px rgba(163, 177, 198, 0.4), -16px -16px 32px rgba(255, 255, 255, 0.9), inset 4px 4px 8px rgba(255, 255, 255, 0.8)',
      },
      animation: {
        'fade-in': 'fadeIn 0.4s ease forwards',
        'slide-up': 'slideUp 0.4s ease forwards',
        'clay-bounce': 'clayBounce 0.3s ease',
        'clay-press': 'clayPress 0.15s ease forwards',
      },
      keyframes: {
        fadeIn: {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        slideUp: {
          from: { opacity: '0', transform: 'translateY(20px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        clayBounce: {
          '0%, 100%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(0.96)' },
        },
        clayPress: {
          '0%': { transform: 'scale(1)' },
          '100%': { transform: 'scale(0.98)' },
        },
      },
    },
  },
  plugins: [],
}
