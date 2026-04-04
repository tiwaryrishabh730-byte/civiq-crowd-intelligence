import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        stitch: {
          black: '#000000',
          elevated: '#050505',
          border: '#202124',
          muted: '#9AA0A6',
          white: '#FFFFFF',
          accent: '#39FF14', // Neon Green
          warning: '#FBBC04',
          critical: '#EA4335',
        },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'Inter', 'sans-serif'],
        mono: ['var(--font-jetbrains-mono)', 'JetBrains Mono', 'monospace'],
      },
      borderRadius: {
        none: '0',
        xs: '0px',
        sm: '0px',
        md: '0px',
        lg: '0px',
        full: '0px', // No round edges globally
      },
      keyframes: {
        glimmer: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' },
        },
        'hardware-scan': {
          '0%': { transform: 'translateY(-100%)', opacity: '0' },
          '10%': { opacity: '1' },
          '90%': { opacity: '1' },
          '100%': { transform: 'translateY(800%)', opacity: '0' },
        },
      },
      animation: {
        'hardware-scan': 'hardware-scan 4s linear infinite',
      }
    },
  },
  plugins: [],
}
export default config