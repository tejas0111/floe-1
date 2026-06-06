import { ConnectButton, useCurrentAccount, useDisconnectWallet } from "@mysten/dapp-kit";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { truncateMiddle } from "@/lib/format";

export default function SuiWalletButton() {
  const currentAccount = useCurrentAccount();
  const { mutate: disconnectWallet, isPending } = useDisconnectWallet();

  if (currentAccount?.address) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 pl-3 pr-1.5">
        <div className="h-2 w-2 rounded-full bg-emerald-500" />
        <div className="flex flex-col py-1">
          <span className="text-xs font-semibold text-slate-700">Sui</span>
          <span className="text-xs font-mono text-slate-500">
            {truncateMiddle(currentAccount.address, 6, 4)}
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => disconnectWallet()}
          disabled={isPending}
          className="h-7 w-7 p-0 text-slate-400 hover:text-red-500"
          title="Disconnect Sui wallet"
        >
          <LogOut className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  }

  return (
    <ConnectButton
      connectText="Connect Sui"
      className="inline-flex h-8 items-center justify-center rounded-md border border-input bg-background px-3 text-sm font-medium shadow-xs transition-all hover:bg-accent hover:text-accent-foreground"
    />
  );
}
