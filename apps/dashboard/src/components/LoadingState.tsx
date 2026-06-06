export default function LoadingState() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="rounded-xl border border-gray-100 bg-white p-5"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 space-y-2">
              <div className="flex gap-2">
                <div className="h-5 w-16 animate-pulse rounded-full bg-gray-100" />
                <div className="h-5 w-24 animate-pulse rounded-full bg-gray-100" />
              </div>
              <div className="h-4 w-3/4 animate-pulse rounded bg-gray-100" />
              <div className="h-3 w-1/2 animate-pulse rounded bg-gray-100" />
            </div>
            <div className="h-8 w-16 animate-pulse rounded-lg bg-gray-100" />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <div className="h-14 animate-pulse rounded-lg bg-gray-50" />
            <div className="h-14 animate-pulse rounded-lg bg-gray-50" />
            <div className="h-14 animate-pulse rounded-lg bg-gray-50" />
            <div className="h-14 animate-pulse rounded-lg bg-gray-50" />
          </div>
          <div className="mt-4 flex gap-2">
            <div className="h-7 w-20 animate-pulse rounded-full bg-gray-100" />
            <div className="h-7 w-16 animate-pulse rounded-full bg-gray-100" />
          </div>
        </div>
      ))}
    </div>
  );
}
