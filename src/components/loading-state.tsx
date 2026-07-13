import { BrandedLoader } from "@/components/branded-loader";

export function LoadingState({
  label = "Loading page...",
}: {
  label?: string;
}) {
  return (
    <div className="grid min-h-[calc(100dvh-13rem)] place-items-center lg:min-h-[calc(100dvh-4.5rem)]">
      <BrandedLoader label={label} />
    </div>
  );
}
