import type { Metadata } from 'next';
import { Toaster } from 'sonner';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { Providers } from '@/components/shared/Providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'AutoResolve — Autonomous Prediction Markets on Somnia',
  description:
    'The first fully on-chain, agent-powered prediction market that resolves itself using Somnia LLM agents.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col antialiased">
        <Providers>
          <Header />
          <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-10">
            {children}
          </main>
          <Footer />
          <Toaster theme="dark" position="bottom-right" richColors />
        </Providers>
      </body>
    </html>
  );
}
