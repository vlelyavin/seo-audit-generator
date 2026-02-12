import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Override default gray with pure neutral grays (no blue tint)
        gray: {
          50: '#fafafa',   // Pure neutral (250, 250, 250)
          100: '#f5f5f5',  // Pure neutral (245, 245, 245)
          200: '#e5e5e5',  // Pure neutral (229, 229, 229)
          300: '#d4d4d4',  // Pure neutral (212, 212, 212)
          400: '#a3a3a3',  // Pure neutral (163, 163, 163)
          500: '#737373',  // Pure neutral (115, 115, 115)
          600: '#525252',  // Pure neutral (82, 82, 82)
          700: '#404040',  // Pure neutral (64, 64, 64)
          800: '#262626',  // Pure neutral (38, 38, 38)
          900: '#171717',  // Pure neutral (23, 23, 23)
          950: '#0a0a0a',  // Pure neutral (10, 10, 10) - matches --color-card
        },
      },
    },
  },
  plugins: [],
};

export default config;
