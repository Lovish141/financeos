import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Brand = mint/teal (design accent: logo, active nav, links, focus rings)
        brand: {
          50: "oklch(0.97 0.015 168 / <alpha-value>)",
          100: "oklch(0.94 0.03 168 / <alpha-value>)",
          200: "oklch(0.89 0.04 170 / <alpha-value>)",
          300: "oklch(0.78 0.07 170 / <alpha-value>)",
          400: "oklch(0.62 0.09 170 / <alpha-value>)",
          500: "oklch(0.5 0.09 168 / <alpha-value>)",
          600: "oklch(0.46 0.07 172 / <alpha-value>)",
          700: "oklch(0.4 0.06 172 / <alpha-value>)",
          800: "oklch(0.34 0.05 175 / <alpha-value>)",
          900: "oklch(0.28 0.04 176 / <alpha-value>)",
        },
        // Ink = cool neutral gray (text, borders, dark primary surfaces)
        ink: {
          50: "oklch(0.985 0.003 250 / <alpha-value>)",
          100: "oklch(0.96 0.004 250 / <alpha-value>)",
          200: "oklch(0.92 0.004 250 / <alpha-value>)",
          300: "oklch(0.89 0.005 250 / <alpha-value>)",
          400: "oklch(0.6 0.01 260 / <alpha-value>)",
          500: "oklch(0.5 0.01 260 / <alpha-value>)",
          600: "oklch(0.42 0.01 260 / <alpha-value>)",
          700: "oklch(0.34 0.02 260 / <alpha-value>)",
          800: "oklch(0.28 0.02 260 / <alpha-value>)",
          900: "oklch(0.25 0.01 260 / <alpha-value>)",
        },
        // Semantic tones matched to the design spec
        risk: {
          50: "oklch(0.96 0.03 40 / <alpha-value>)",
          500: "oklch(0.55 0.14 40 / <alpha-value>)",
          600: "oklch(0.52 0.16 30 / <alpha-value>)",
        },
        watch: {
          50: "oklch(0.97 0.04 80 / <alpha-value>)",
          500: "oklch(0.58 0.1 65 / <alpha-value>)",
        },
        mint: {
          50: "oklch(0.965 0.015 168 / <alpha-value>)",
          500: "oklch(0.49 0.085 168 / <alpha-value>)",
        },
      },
      fontFamily: {
        sans: ["var(--font-manrope)", "system-ui", "sans-serif"],
        mono: ["var(--font-plex-mono)", "ui-monospace", "monospace"],
      },
      boxShadow: {
        soft: "0 1px 2px oklch(0.3 0.02 260 / 0.04)",
        card: "0 1px 3px oklch(0.3 0.02 260 / 0.05), 0 8px 24px -14px oklch(0.3 0.02 260 / 0.14)",
        elevated: "0 4px 24px oklch(0.3 0.02 260 / 0.07)",
        glow: "0 6px 20px -8px oklch(0.5 0.09 168 / 0.5)",
        modal: "0 24px 70px oklch(0.2 0.02 260 / 0.28)",
        slideover: "-12px 0 40px oklch(0.2 0.02 260 / 0.16)",
        "inner-top": "inset 0 1px 0 oklch(1 0 0 / 0.6)",
      },
      borderRadius: {
        xl: "0.625rem", // 10px — inputs / buttons
        "2xl": "1rem", // 16px — cards
        "3xl": "1.25rem", // 20px — onboarding / large panels
      },
      letterSpacing: {
        eyebrow: "0.14em",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "none" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "slide-in": {
          "0%": { transform: "translateX(100%)" },
          "100%": { transform: "none" },
        },
        pop: {
          "0%": { opacity: "0", transform: "translateY(10px) scale(0.97)" },
          "100%": { opacity: "1", transform: "none" },
        },
        "toast-in": {
          "0%": { opacity: "0", transform: "translate(-50%, 12px)" },
          "100%": { opacity: "1", transform: "translate(-50%, 0)" },
        },
        "bar-rise": {
          "0%": { transform: "scaleY(0)" },
          "100%": { transform: "scaleY(1)" },
        },
        "pulse-dot": {
          "0%,100%": { opacity: "1", transform: "scale(1)" },
          "50%": { opacity: "0.4", transform: "scale(0.7)" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.4s ease both",
        "fade-in": "fade-in 0.3s ease",
        "slide-in": "slide-in 0.34s cubic-bezier(0.2,0.85,0.25,1) both",
        pop: "pop 0.26s cubic-bezier(0.2,0.85,0.25,1) both",
        "toast-in": "toast-in 0.28s cubic-bezier(0.2,0.85,0.25,1) both",
        "bar-rise": "bar-rise 0.6s cubic-bezier(0.2,0.85,0.25,1) both",
        "pulse-dot": "pulse-dot 1.8s ease-in-out infinite",
      },
      backgroundImage: {
        "brand-gradient":
          "linear-gradient(135deg, oklch(0.55 0.09 168) 0%, oklch(0.5 0.09 168) 55%, oklch(0.44 0.08 172) 100%)",
      },
    },
  },
  plugins: [],
};

export default config;
