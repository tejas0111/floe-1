import { getChainConfig } from "@/lib/chains";

interface ChainBadgeProps {
  chain: string | null;
  className?: string;
}

export default function ChainBadge({ chain, className = "" }: ChainBadgeProps) {
  const config = getChainConfig(chain);
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${className}`}
      style={{
        backgroundColor: config.bgColor,
        color: config.color,
      }}
    >
      {config.label}
    </span>
  );
}
