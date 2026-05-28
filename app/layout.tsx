import type { Metadata } from 'next';
import { Outfit } from 'next/font/google';
import { Toaster } from 'sonner';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { Providers } from '@/components/shared/Providers';
import { TooltipProvider } from '@/components/shared/Tooltip';
import './globals.css';

const outfit = Outfit({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'AutoResolve — Autonomous Prediction Markets on Somnia',
  description:
    'The first fully on-chain, agent-powered prediction market that resolves itself using Somnia LLM agents.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${outfit.className} flex min-h-screen flex-col antialiased`}>
        <Providers>
          <TooltipProvider>
            <Header />
            <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-10">
              {children}
            </main>
            <Footer />
            <Toaster 
              theme="dark" 
              position="bottom-right" 
              toastOptions={{
                className: 'rounded-xl border border-white/10 bg-[#050508]/95 backdrop-blur-xl text-white shadow-[0_0_30px_rgba(6,182,212,0.15)] font-sans',
              }}
            />
          </TooltipProvider>
        </Providers>
      </body>
    </html>
  );
}
