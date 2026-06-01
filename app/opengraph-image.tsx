import { ImageResponse } from 'next/og';
import { CONTRACT_ADDRESS } from '@/lib-web/contract';

export const runtime = 'edge';
export const alt = 'AutoResolve — Agent-resolved prediction markets on Somnia';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function OpengraphImage() {
  const shortAddress = `${CONTRACT_ADDRESS.slice(0, 6)}…${CONTRACT_ADDRESS.slice(-4)}`;

  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: 'linear-gradient(135deg, #050508 0%, #0a0a18 50%, #0a0f1f 100%)',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          padding: 64,
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            background:
              'radial-gradient(circle at 80% 20%, rgba(139, 92, 246, 0.25) 0%, transparent 40%), radial-gradient(circle at 20% 80%, rgba(6, 182, 212, 0.25) 0%, transparent 40%)',
          }}
        />

        <div style={{ display: 'flex', alignItems: 'center', gap: 16, position: 'relative' }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 14,
              background: 'linear-gradient(135deg, #22d3ee 0%, #a78bfa 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 32,
              fontWeight: 900,
              color: '#050508',
            }}
          >
            ◆
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ color: '#ffffff', fontSize: 32, fontWeight: 800, letterSpacing: -0.5 }}>
              AutoResolve
            </div>
            <div style={{ color: '#a5f3fc', fontSize: 16, fontWeight: 500 }}>
              Built for the Somnia Agentathon
            </div>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            marginTop: 64,
            position: 'relative',
            flexGrow: 1,
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              color: '#ffffff',
              fontSize: 72,
              fontWeight: 800,
              letterSpacing: -2,
              lineHeight: 1.05,
              maxWidth: 1000,
            }}
          >
            Agent-resolved prediction markets.
          </div>
          <div
            style={{
              color: '#a5f3fc',
              fontSize: 36,
              fontWeight: 500,
              marginTop: 24,
              maxWidth: 900,
            }}
          >
            No human oracle. No multisig. No off-chain resolver.
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 24,
            position: 'relative',
            paddingTop: 24,
            borderTop: '1px solid rgba(255, 255, 255, 0.1)',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ color: '#71717a', fontSize: 14, textTransform: 'uppercase', letterSpacing: 1.5 }}>
              Deployed on
            </div>
            <div style={{ color: '#e4e4e7', fontSize: 18, fontWeight: 600, marginTop: 4 }}>
              Somnia Shannon Testnet
            </div>
          </div>
          <div style={{ width: 1, height: 40, background: 'rgba(255, 255, 255, 0.1)' }} />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ color: '#71717a', fontSize: 14, textTransform: 'uppercase', letterSpacing: 1.5 }}>
              Contract
            </div>
            <div
              style={{
                color: '#22d3ee',
                fontSize: 18,
                fontWeight: 600,
                fontFamily: 'monospace',
                marginTop: 4,
              }}
            >
              {shortAddress}
            </div>
          </div>
          <div style={{ width: 1, height: 40, background: 'rgba(255, 255, 255, 0.1)' }} />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ color: '#71717a', fontSize: 14, textTransform: 'uppercase', letterSpacing: 1.5 }}>
              Receipts
            </div>
            <div
              style={{ color: '#34d399', fontSize: 18, fontWeight: 600, fontFamily: 'monospace', marginTop: 4 }}
            >
              2400421 · 2400485
            </div>
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
