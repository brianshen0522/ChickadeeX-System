/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Professional Medical Primary Palette - Calming Blues
        primary: {
          50: '#f0f9ff',          // Very light medical blue
          100: '#e0f2fe',         // Light medical blue  
          200: '#bae6fd',         // Lighter blue
          300: '#7dd3fc',         // Medium light blue
          400: '#38bdf8',         // Standard blue
          500: '#0ea5e9',         // Primary medical blue
          600: '#0284c7',         // Darker medical blue
          700: '#0369a1',         // Deep blue
          800: '#075985',         // Very deep blue
          900: '#0c4a6e',         // Darkest blue
        },
        
        // Medical Trust Green - Secondary palette  
        secondary: {
          50: '#f0fdf4',          // Very light green
          100: '#dcfce7',         // Light medical green
          200: '#bbf7d0',         // Lighter green
          300: '#86efac',         // Medium light green
          400: '#4ade80',         // Standard green
          500: '#22c55e',         // Primary medical green
          600: '#16a34a',         // Darker green
          700: '#15803d',         // Deep green
          800: '#166534',         // Very deep green
          900: '#14532d',         // Darkest green
        },

        // Medical Success - Fresh mint green
        success: {
          50: '#f0fdf4',          // Very light success
          100: '#dcfce7',         // Light success
          200: '#bbf7d0',         // Lighter success
          300: '#86efac',         // Medium success
          400: '#4ade80',         // Standard success
          500: '#22c55e',         // Primary success
          600: '#16a34a',         // Darker success
          700: '#15803d',         // Deep success
          800: '#166534',         // Very deep success
          900: '#14532d',         // Darkest success
        },

        // Medical Warning - Professional amber
        warning: {
          50: '#fffbeb',          // Very light warning
          100: '#fef3c7',         // Light warning
          200: '#fde68a',         // Lighter warning
          300: '#fcd34d',         // Medium warning
          400: '#fbbf24',         // Standard warning
          500: '#f59e0b',         // Primary warning
          600: '#d97706',         // Darker warning
          700: '#b45309',         // Deep warning
          800: '#92400e',         // Very deep warning
          900: '#78350f',         // Darkest warning
        },

        // Medical Error - Clean, professional red
        error: {
          50: '#fef2f2',          // Very light error
          100: '#fee2e2',         // Light error
          200: '#fecaca',         // Lighter error
          300: '#fca5a5',         // Medium error
          400: '#f87171',         // Standard error
          500: '#ef4444',         // Primary error
          600: '#dc2626',         // Darker error
          700: '#b91c1c',         // Deep error
          800: '#991b1b',         // Very deep error
          900: '#7f1d1d',         // Darkest error
        },

        // Professional Neutral Grays
        neutral: {
          50: '#fafafa',          // Almost white
          100: '#f5f5f5',         // Very light gray
          200: '#e5e5e5',         // Light gray
          300: '#d4d4d4',         // Medium light gray
          400: '#a3a3a3',         // Medium gray
          500: '#737373',         // Primary gray
          600: '#525252',         // Darker gray
          700: '#404040',         // Deep gray
          800: '#262626',         // Very deep gray
          900: '#171717',         // Almost black
        },

        // Medical Technology Accent Colors
        accent: {
          // Medical Technology Blue
          'tech-blue': '#0ea5e9',     // Primary tech blue
          'tech-blue-dark': '#0284c7', // Darker tech blue
          
          // Medical Teal - Trust and cleanliness
          teal: '#06b6d4',           // Primary teal
          'teal-dark': '#0891b2',    // Darker teal
          
          // Medical Mint - Fresh and clean
          mint: '#10b981',           // Primary mint
          'mint-dark': '#059669',    // Darker mint
          
          // Medical Lavender - Calm and professional
          lavender: '#8b5cf6',       // Primary lavender
          'lavender-dark': '#7c3aed', // Darker lavender
        },

        // Medical UI Specific Colors
        medical: {
          // Clean whites and off-whites
          white: '#ffffff',
          'off-white': '#fafafa',
          'cream': '#fefdfb',
          
          // Professional silver accents
          silver: '#e5e7eb',
          'silver-dark': '#d1d5db',
          
          // Deep professional blues
          'deep-blue': '#1e3a8a',
          'navy': '#1e293b',
        }
      },
      fontFamily: {
        'medical': ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        // Professional medical shadows with blue undertones
        'medical': '0 2px 8px rgba(14, 165, 233, 0.08)',
        'medical-lg': '0 4px 16px rgba(14, 165, 233, 0.12)',
        'medical-xl': '0 8px 32px rgba(14, 165, 233, 0.15)',
        
        // Soft neutral shadows
        'soft': '0 1px 6px rgba(107, 114, 128, 0.08)',
        'soft-lg': '0 2px 12px rgba(107, 114, 128, 0.12)',
        
        // Clean technology shadows
        'tech': '0 2px 8px rgba(6, 182, 212, 0.08)',
        'tech-lg': '0 4px 16px rgba(6, 182, 212, 0.12)',
      },
      borderRadius: {
        'medical': '12px',
      }
    },
  },
  plugins: [],
}