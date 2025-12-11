/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Glassmorphism color palette
        glass: {
          bg: '#0f0f23',           // Deep dark blue background
          surface: 'rgba(255, 255, 255, 0.1)',
          card: 'rgba(255, 255, 255, 0.08)',
          border: 'rgba(255, 255, 255, 0.18)',
          hover: 'rgba(255, 255, 255, 0.15)',
          accent: {
            purple: '#a855f7',
            pink: '#ec4899',
            blue: '#3b82f6',
            cyan: '#06b6d4',
            teal: '#14b8a6',
            green: '#22c55e',
            amber: '#f59e0b',
            rose: '#f43f5e',
          },
        },
        // Keep legacy names for compatibility
        clay: {
          bg: '#0f0f23',
          surface: 'rgba(255, 255, 255, 0.1)',
          mint: '#14b8a6',
          peach: '#f43f5e',
          lavender: '#a855f7',
          butter: '#f59e0b',
          coral: '#ec4899',
          sky: '#3b82f6',
        },
        cream: '#1a1a2e',
        'warm-white': '#16162a',
        sage: {
          DEFAULT: '#14b8a6',
          light: '#2dd4bf',
          dark: '#0d9488',
        },
        terracotta: {
          DEFAULT: '#f43f5e',
          light: '#fb7185',
        },
        charcoal: {
          DEFAULT: '#1f2937',
          light: '#374151',
        },
      },
      fontFamily: {
        display: ['Inter', 'Nunito', 'sans-serif'],
        body: ['Inter', 'Nunito', 'sans-serif'],
      },
      borderRadius: {
        'glass': '16px',
        'glass-lg': '24px',
        'glass-xl': '32px',
        'glass-pill': '9999px',
        // Legacy names
        'clay': '16px',
        'clay-lg': '24px',
        'clay-xl': '32px',
        'clay-pill': '9999px',
      },
      boxShadow: {
        'glass': '0 8px 32px rgba(0, 0, 0, 0.3)',
        'glass-sm': '0 4px 16px rgba(0, 0, 0, 0.2)',
        'glass-lg': '0 16px 48px rgba(0, 0, 0, 0.4)',
        'glass-glow': '0 0 40px rgba(168, 85, 247, 0.3)',
        'glass-glow-pink': '0 0 40px rgba(236, 72, 153, 0.3)',
        'glass-glow-blue': '0 0 40px rgba(59, 130, 246, 0.3)',
        'glass-glow-teal': '0 0 40px rgba(20, 184, 166, 0.3)',
        'glass-inner': 'inset 0 1px 1px rgba(255, 255, 255, 0.1)',
        // Legacy names
        'clay': '0 8px 32px rgba(0, 0, 0, 0.3)',
        'clay-sm': '0 4px 16px rgba(0, 0, 0, 0.2)',
        'clay-lg': '0 16px 48px rgba(0, 0, 0, 0.4)',
        'clay-pressed': 'inset 0 2px 4px rgba(0, 0, 0, 0.3)',
        'clay-float': '0 20px 60px rgba(0, 0, 0, 0.5)',
      },
      backdropBlur: {
        'glass': '16px',
        'glass-lg': '24px',
        'glass-xl': '40px',
      },
      animation: {
        'fade-in': 'fadeIn 0.4s ease forwards',
        'slide-up': 'slideUp 0.4s ease forwards',
        'glass-shimmer': 'glassShimmer 2s ease-in-out infinite',
        'glow-pulse': 'glowPulse 2s ease-in-out infinite',
        'float': 'float 6s ease-in-out infinite',
        // Legacy
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
        glassShimmer: {
          '0%, 100%': { backgroundPosition: '200% center' },
          '50%': { backgroundPosition: '-200% center' },
        },
        glowPulse: {
          '0%, 100%': { opacity: '0.5' },
          '50%': { opacity: '1' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
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
