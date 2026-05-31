/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#0052ff',
          active: '#003ecc',
          disabled: '#a8b8cc',
        },
        ink: '#0a0b0d',
        body: {
          DEFAULT: '#5b616e',
          strong: '#0a0b0d',
        },
        muted: {
          DEFAULT: '#7c828a',
          soft: '#a8acb3',
        },
        hairline: {
          DEFAULT: '#dee1e6',
          soft: '#eef0f3',
        },
        canvas: '#ffffff',
        surface: {
          soft: '#f7f7f7',
          card: '#ffffff',
          strong: '#eef0f3',
          dark: '#0a0b0d',
          'dark-elevated': '#16181c',
        },
        'on-primary': '#ffffff',
        'on-dark': {
          DEFAULT: '#ffffff',
          soft: '#a8acb3',
        },
        semantic: {
          up: '#05b169',
          down: '#cf202f',
        },
        'accent-yellow': '#f4b000',
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'system-ui', 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
        mono: ['JetBrains Mono', 'Geist Mono', 'monospace'],
      },
      fontSize: {
        'display-mega': ['80px', { lineHeight: '1.0', letterSpacing: '-2px', fontWeight: '400' }],
        'display-xl': ['64px', { lineHeight: '1.0', letterSpacing: '-1.6px', fontWeight: '400' }],
        'display-lg': ['52px', { lineHeight: '1.0', letterSpacing: '-1.3px', fontWeight: '400' }],
        'display-md': ['44px', { lineHeight: '1.09', letterSpacing: '-1px', fontWeight: '400' }],
        'display-sm': ['36px', { lineHeight: '1.11', letterSpacing: '-0.5px', fontWeight: '400' }],
        'title-lg': ['32px', { lineHeight: '1.13', letterSpacing: '-0.4px', fontWeight: '400' }],
        'title-md': ['18px', { lineHeight: '1.33', fontWeight: '600' }],
        'title-sm': ['16px', { lineHeight: '1.25', fontWeight: '600' }],
        'body-sm': ['14px', { lineHeight: '1.43', fontWeight: '400' }],
        'caption': ['13px', { lineHeight: '1.38', fontWeight: '400' }],
      },
      borderRadius: {
        'xs': '4px',
        'sm': '8px',
        'md': '12px',
        'lg': '16px',
        'xl': '24px',
        'pill': '100px',
      },
      spacing: {
        'xxs': '4px',
        'xs': '8px',
        'sm': '12px',
        'md': '20px',
        'section': '96px',
      },
    },
  },
  plugins: [],
}
