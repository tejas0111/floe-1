import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AVAILABLE_CHAINS } from "@/lib/chains";

interface FilterBarProps {
  owner: string;
  chain: string;
  onOwnerChange: (v: string) => void;
  onChainChange: (v: string) => void;
  onSearch: () => void;
  onClear: () => void;
}

export default function FilterBar({
  owner,
  chain,
  onOwnerChange,
  onChainChange,
  onSearch,
  onClear,
}: FilterBarProps) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 sm:flex-row sm:items-end">
      <div className="flex-1">
        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">
          Owner Address
        </label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={owner}
            onChange={(e) => onOwnerChange(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onSearch()}
            placeholder="0x... or wallet address"
            className="pl-9 font-mono"
          />
        </div>
      </div>
      <div className="sm:w-48">
        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">
          Chain
        </label>
        <select
          value={chain}
          onChange={(e) => onChainChange(e.target.value)}
          className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        >
          <option value="">All chains</option>
          {AVAILABLE_CHAINS.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex gap-2">
        <Button onClick={onSearch} className="bg-slate-900 hover:bg-slate-800">
          Search
        </Button>
        {(owner || chain) && (
          <Button variant="ghost" size="icon" onClick={onClear} className="text-slate-400">
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
