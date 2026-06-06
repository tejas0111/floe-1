import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import EvmWalletButton from "@/components/wallet/EvmWalletButton";
import SuiWalletButton from "@/components/wallet/SuiWalletButton";

interface TopBarProps {
  title: string;
  onRefresh?: () => void;
  refreshing?: boolean;
}

export default function TopBar({ title, onRefresh, refreshing }: TopBarProps) {
  return (
    <header className="flex h-16 items-center justify-between border-b border-gray-200 bg-white px-8">
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>

      <div className="flex items-center gap-3">
        {onRefresh && (
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={refreshing}
            className="gap-2"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        )}

        <EvmWalletButton />
        <SuiWalletButton />
      </div>
    </header>
  );
}
