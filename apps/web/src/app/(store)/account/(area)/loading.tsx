import { DotSpinner } from "@/components/ui/dot-spinner";

/** While a section loads, only the area beside the sidebar shows the spinner; the banner and sidebar stay. */
export default function Loading() {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="flex min-h-[40vh] items-center justify-center">
      <DotSpinner size={56} />
      <span className="sr-only">Loading</span>
    </div>
  );
}
