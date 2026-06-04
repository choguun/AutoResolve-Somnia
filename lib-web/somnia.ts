import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { http } from 'wagmi';

// Re-export the server-safe chain definition so existing imports of
// `somniaTestnet` from this file still work. The actual definition now lives
// in `somnia-chain.ts` because `getDefaultConfig` is client-only and would
// poison server bundles if imported from a route handler.
export { somniaTestnet } from './somnia-chain';
import { somniaTestnet } from './somnia-chain';

export const config = getDefaultConfig({
  appName: 'AutoResolve',
  projectId: process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID || '00000000000000000000000000000000',
  chains: [somniaTestnet],
  ssr: true,
  transports: {
    [somniaTestnet.id]: http('https://dream-rpc.somnia.network'),
  },
});
