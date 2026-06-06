import { Loader2, LogOut, Wallet } from "lucide-react";
import { useAccount, useDisconnect } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { Button } from "@/components/ui/button";
import { truncateMiddle } from "@/lib/format";

export default function EvmWalletButton() {
  const { address, chain, isConnected, isConnecting } = useAccount();
  const { disconnect } = useDisconnect();
  const { openConnectModal } = useConnectModal();

  if (isConnected && address) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 pl-3 pr-1.5">
        <div className="h-2 w-2 rounded-full bg-emerald-500" />
        <div className="flex flex-col py-1">
          <span className="text-xs font-semibold text-slate-700">EVM</span>
          <span className="text-xs font-mono text-slate-500">
            {truncateMiddle(address, 6, 4)} {chain?.name ? `· ${chain.name}` : ""}
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => disconnect()}
          className="h-7 w-7 p-0 text-slate-400 hover:text-red-500"
          title="Disconnect EVM wallet"
        >
          <LogOut className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  }

  return (
    <Button
      onClick={() => openConnectModal?.()}
      disabled={!openConnectModal || isConnecting}
      size="sm"
      variant="outline"
      className="gap-2"
    >
      {isConnecting ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Wallet className="h-3.5 w-3.5" />
      )}
      Connect EVM
    </Button>
  );
}
