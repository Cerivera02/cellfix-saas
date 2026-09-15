export function KindBadges({ isForSale, isRepairPart }: { isForSale: boolean; isRepairPart: boolean }) {
  return (
    <div className="flex flex-wrap gap-1">
      {isForSale && (
        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs whitespace-nowrap text-zinc-700">Venta</span>
      )}
      {isRepairPart && (
        <span className="rounded-full border border-zinc-200 px-2 py-0.5 text-xs whitespace-nowrap text-zinc-600">
          Refacción
        </span>
      )}
    </div>
  );
}
