import { ICONS, type IconName } from "@/lib/milestones/icons";

export function Icon({ name, size = 20, weight = 1.8, className }: { name: IconName; size?: number; weight?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={weight} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <path d={ICONS[name]} />
    </svg>
  );
}
