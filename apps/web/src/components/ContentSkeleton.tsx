/**
 * ContentSkeleton — a brief shimmer shown while the editor/database area
 * swaps to a newly selected page or database (~150ms). Purely cosmetic:
 * it smooths the transition instead of flashing a blank frame. Tokens only.
 */
export function ContentSkeleton() {
  return (
    <div aria-hidden className="mx-auto w-full max-w-3xl px-8 pb-32 pt-10 md:px-12">
      <div className="folio-shimmer mb-6 h-9 w-2/5" />
      <div className="flex flex-col gap-3">
        <div className="folio-shimmer h-4 w-full" />
        <div className="folio-shimmer h-4 w-full" />
        <div className="folio-shimmer h-4 w-11/12" />
        <div className="folio-shimmer h-4 w-full" />
        <div className="folio-shimmer h-4 w-3/4" />
      </div>
      <div className="mt-8 flex flex-col gap-3">
        <div className="folio-shimmer h-4 w-full" />
        <div className="folio-shimmer h-4 w-5/6" />
      </div>
    </div>
  );
}
