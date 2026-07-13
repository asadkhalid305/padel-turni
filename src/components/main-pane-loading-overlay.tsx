import { BrandedLoader } from "@/components/branded-loader";

export function MainPaneLoadingOverlay({ label }: { label: string }) {
  return (
    <div className="fixed inset-x-0 bottom-[76px] top-[73px] z-[90] grid place-items-center bg-[#f4f2e9]/90 backdrop-blur-[2px] lg:bottom-0 lg:left-[280px] lg:top-0 xl:left-[300px]">
      <BrandedLoader label={label} />
    </div>
  );
}
