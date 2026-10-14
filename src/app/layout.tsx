import type { Metadata } from "next";
import { Inter, Newsreader } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { EffectsProvider } from "@/components/motion";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const newsreader = Newsreader({
  subsets: ["latin"],
  variable: "--font-newsreader",
  style: ["normal", "italic"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Chronicle — your personal newspaper",
    template: "%s · Chronicle",
  },
  description:
    "A personalized newspaper and research digest. Chronicle collects the news, papers and saved reading you care about, then edits it down to a calm five-minute briefing.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${newsreader.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem={false}
          disableTransitionOnChange
        >
          <EffectsProvider>{children}</EffectsProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
