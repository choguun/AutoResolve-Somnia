'use client';

import { useEffect, useState } from 'react';
import { parseEther } from 'viem';
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { showConfirmedTransactionToast, showSubmittedTransactionToast } from '@/lib-web/transactionToast';
import { TransactionStatus } from '@/components/shared/TransactionStatus';
import {
  BetOption,
  CONTRACT_ABI,
  CONTRACT_ADDRESS,
  MarketStatus,
  endTimeMs,
  formatStt,
  oddsPercent,
  type Market,
} from '@/lib-web/contract';

export function BetPanel({ marketId, market }: { marketId: bigint; market: Market }) {
  const { address } = useAccount();
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState('0.001');
  // v22 (H2): use the shared endTimeMs helper. v19 (L2) added the uint32
  // clamping inline in formatCountdown but missed this callsite; see the
  // matching comment in useResolutionStatus. The contract caps
  // MAX_DURATION to 1 day, so the comparison is safe for any reasonable
  // endTime, but the helper is the right single source of truth.
  // v61 (H0): lowered the default bet amount from 0.01 to 0.001 STT
  // (= MIN_BET on the contract). The previous default was a "safety
  // margin" against MIN_BET but it forced users to fund their wallet
  // with >0.01 STT just to try the bet flow; 0.001 is enough to
  // validate the integration, and a user who wants to bet more just
  // changes the input.
  const disabled = market.status !== MarketStatus.Open || Date.now() >= endTimeMs(market.endTime);

  const { writeContract, data: hash, isPending, error: writeError } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  // v61 (H0): better error surface. The pre-v61 onError did
  // `err.message.slice(0, 120)` which truncated wallet gas
  // errors to "insufficient funds for gas" or "User rejected
  // transaction" without the actual shortAddress / reason code.
  // Show the FULL error message (capped at 280 chars to avoid
  // breaking the toast UI) AND a specific hint when the error
  // looks like a gas/balance issue so the user knows what to fix.
  useEffect(() => {
    if (!writeError) return;
    const msg = (writeError as Error & { shortMessage?: string }).shortMessage
      ?? (writeError as Error).message
      ?? 'Bet tx failed (unknown reason)';
    const trimmed = msg.slice(0, 280);
    const looksLikeGas = /gas|funds|insufficient|nonce|underpriced|rejected/i.test(msg);
    toast.error(
      looksLikeGas
        ? `${trimmed}\n\nHint: this is usually a wallet-side issue — top up your STT balance (faucet at https://docs.somnia.network/) and retry.`
        : trimmed,
      { duration: 8000 }
    );
  }, [writeError]);

  const placeBet = (option: BetOption) => {
    writeContract(
      {
        address: CONTRACT_ADDRESS,
        abi: CONTRACT_ABI,
        functionName: 'bet',
        args: [marketId, option],
        value: parseEther(amount),
        // v61 (H1): pin an explicit gas limit. The pre-v61 call relied
        // on viem's eth_estimateGas, but the user's wallet was returning
        // a raw tx with `gas: 0x0` ("Gas limit is less than 21000") —
        // a known MetaMask behavior when its own gas estimation fails
        // (common on testnets with non-standard gas accounting).
        // v61 (H1.5): bumped 300_000n → 1_200_000n. The first attempt
        // at 300k reverted OOG on the user's first YES-side bet on
        // market #3: the live on-chain gas usage was 879,988 (and
        // eth_estimateGas returned 2,319,982 — a known over-estimate
        // on Somnia testnet, but the real cost is the 880k figure).
        // v61 (H1.6): bumped 1_200_000n → 2_500_000n. A subsequent
        // bet on the same market with the 1.2M pin still reverted
        // OOG (1.2M = 100% of limit used), but a 1.8M pin on the
        // SAME call from the SAME state succeeded with gasUsed
        // 479,988. The on-chain gas cost is non-deterministic
        // across calls (it varies by Somnia's per-block state
        // access cost, which is over-strict for cold slots). The
        // safe pin is `eth_estimateGas` (~1.72M for this call) +
        // ~45% headroom = 2.5M. On Somnia Shannon at 6 gwei base,
        // 2.5M gas = 0.015 STT per bet — still under the 0.001 STT
        // minimum bet in real cost terms. The on-chain reversion
        // will still surface the real reason (e.g. MarketNotOpen,
        // BetBelowMinimum) in the toast — pinning gas only affects
        // the gas-limit field, not the execution semantics.
        gas: 2_500_000n,
      },
      {
        onSuccess: (txHash) =>
          showSubmittedTransactionToast(
            txHash,
            `Placing ${option === BetOption.Yes ? 'YES' : 'NO'} bet...`,
            'place-bet'
          ),
      }
    );
  };

  useEffect(() => {
    if (!isSuccess) return;
    // v45 (M2): mirror PayoutClaim's v19 H2 + v43 L1 invalidation pattern
    // on a successful bet. The bet flow adds the (user, marketId) pair to
    // userMarketIds (v40 L0), increments userYesBets/userNoBets, and bumps
    // the per-market yes/no totals. Without this invalidate, the My Bets
    // tab is stale for the full 10s useMyBets refetchInterval (the just-
    // bet market won't appear, and a fresh bet on a previously-unbetted
    // market is invisible to the user) and the per-market yes/no totals
    // are stale for 5s (the useMarket refetchInterval). The address gate
    // is the same one PayoutClaim uses — invalidating with an undefined
    // key would no-op.
    if (address) {
      queryClient.invalidateQueries({
        queryKey: ['myBets', address],
      });
      queryClient.invalidateQueries({
        queryKey: ['userBets', marketId.toString(), address],
      });
      queryClient.invalidateQueries({
        queryKey: ['market', marketId.toString()],
      });
    }
    showConfirmedTransactionToast(hash, 'Bet placed', 'place-bet');
  }, [hash, isSuccess, queryClient, marketId, address]);

  const yesOdds = oddsPercent(market.yesTotal, market.noTotal, 'yes');
  const noOdds = oddsPercent(market.yesTotal, market.noTotal, 'no');

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl shadow-2xl shadow-black/20 sm:p-8">
      <div className="mb-5 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Place Bet</h2>
          <p className="text-sm text-zinc-500">Choose a side and stake STT before the market closes.</p>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4">
        <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-5 text-center shadow-inner backdrop-blur-sm">
          <div className="flex items-center justify-center gap-2 text-3xl font-extrabold text-emerald-300 drop-shadow-sm">
            {yesOdds.toFixed(1)}%
            <TrendingUp className="h-6 w-6 opacity-80" />
          </div>
          <div className="mt-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">YES · {formatStt(market.yesTotal)}</div>
        </div>
        <div className="rounded-xl border border-rose-400/20 bg-rose-400/10 p-5 text-center shadow-inner backdrop-blur-sm">
          <div className="flex items-center justify-center gap-2 text-3xl font-extrabold text-rose-300 drop-shadow-sm">
            {noOdds.toFixed(1)}%
            <TrendingDown className="h-6 w-6 opacity-80" />
          </div>
          <div className="mt-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">NO · {formatStt(market.noTotal)}</div>
        </div>
      </div>

      <div className="mb-6">
        <label className="mb-2 block text-sm font-semibold uppercase tracking-wider text-zinc-300">Amount (STT)</label>
        <input
          type="number"
          min="0.001"
          step="0.001"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          disabled={disabled}
          className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-white shadow-inner outline-none transition-all duration-300 focus:border-cyan-400/50 focus:bg-black/60 focus:ring-4 focus:ring-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <button
          onClick={() => placeBet(BetOption.Yes)}
          disabled={disabled || isPending || isConfirming}
          className="rounded-xl bg-gradient-to-r from-emerald-400 to-emerald-500 px-4 py-3.5 font-bold text-emerald-950 shadow-[0_0_15px_rgba(52,211,153,0.3)] transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_0_20px_rgba(52,211,153,0.5)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100 disabled:hover:shadow-none"
        >
          Bet YES
        </button>
        <button
          onClick={() => placeBet(BetOption.No)}
          disabled={disabled || isPending || isConfirming}
          className="rounded-xl bg-gradient-to-r from-rose-400 to-rose-500 px-4 py-3.5 font-bold text-rose-950 shadow-[0_0_15px_rgba(251,113,133,0.3)] transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_0_20px_rgba(251,113,133,0.5)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100 disabled:hover:shadow-none"
        >
          Bet NO
        </button>
      </div>
      <TransactionStatus hash={hash} isConfirming={isConfirming} />
    </div>
  );
}
