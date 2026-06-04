import { defineChain } from 'viem';

// Server-safe Somnia Shannon Testnet chain definition. This file MUST NOT
// import anything from `@rainbow-me/rainbowkit` or anything else client-only,
// because server-side route handlers (e.g. app/api/receipt/by-tx/[hash]) and
// the relayer both need the chain definition. The `config` export in
// `somnia.ts` uses `getDefaultConfig` which is client-only — keep that
// export in `somnia.ts` and have it re-export `somniaTestnet` from here.
export const somniaTestnet = defineChain({
  id: 50312,
  name: 'Somnia Shannon Testnet',
  nativeCurrency: {
    name: 'Somnia Test Token',
    symbol: 'STT',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ['https://dream-rpc.somnia.network'],
      webSocket: ['wss://dream-rpc.somnia.network/ws'],
    },
    public: {
      http: ['https://dream-rpc.somnia.network'],
    },
  },
  blockExplorers: {
    default: {
      name: 'Somnia Shannon Explorer',
      url: 'https://shannon-explorer.somnia.network',
    },
  },
  testnet: true,
});
