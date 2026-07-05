/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#1E5EFF',
          dark: '#0F3D91',
          darker: '#082A63'
        },
        bg: '#F8FAFC',
        surface: '#FFFFFF',
        success: '#22C55E',
        warning: '#F59E0B',
        danger: '#EF4444',
        textprimary: '#14213D',
        textsecondary: '#64748B',
        borderc: '#E5EAF3'
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif']
      },
      boxShadow: {
        card: '0 2px 12px rgba(0,0,0,0.04)',
        cardHover: '0 8px 24px rgba(15,61,145,0.08)'
      },
      backgroundImage: {
        'aviation-gradient': 'linear-gradient(135deg, #082A63 0%, #0F3D91 40%, #1E5EFF 100%)'
      },
      animation: {
        'radar-sweep': 'radar-sweep 4s linear infinite',
        'float-slow': 'float-slow 6s ease-in-out infinite',
        'pulse-slow': 'pulse-slow 3s ease-in-out infinite',
        'dash-move': 'dash-move 20s linear infinite'
      },
      keyframes: {
        'radar-sweep': {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' }
        },
        'float-slow': {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-10px)' }
        },
        'pulse-slow': {
          '0%, 100%': { opacity: 1 },
          '50%': { opacity: 0.4 }
        },
        'dash-move': {
          '0%': { strokeDashoffset: 0 },
          '100%': { strokeDashoffset: -200 }
        }
      }
    }
  },
  plugins: []
}
