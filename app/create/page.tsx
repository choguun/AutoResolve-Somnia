import { CreateMarketForm } from '@/components/markets/CreateMarketForm';

export default function CreatePage() {
  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white">Create Market</h1>
        <p className="mt-2 text-zinc-400">
          Define a question and resolution source. Somnia agents will autonomously resolve it.
        </p>
      </div>
      <CreateMarketForm />
    </div>
  );
}
