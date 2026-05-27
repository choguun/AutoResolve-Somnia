import { CreateMarketForm } from '@/components/markets/CreateMarketForm';

export default function CreatePage() {
  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-8 rounded-lg border border-white/10 bg-white/[0.045] p-5 sm:p-7">
        <div className="mb-3 inline-flex rounded-full border border-violet-400/20 bg-violet-400/10 px-3 py-1 text-xs font-medium text-violet-200">
          New market
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">Create Market</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400 sm:text-base">
          Define a question, cite a source, and choose how long traders can place positions
          before Somnia agents resolve the outcome.
        </p>
      </div>
      <CreateMarketForm />
    </div>
  );
}
