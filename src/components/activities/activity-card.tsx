import type { ReactNode } from "react";
import { MapPin, Users } from "lucide-react";
import { cn } from "@/lib/utils";

type ActivityCardProps = {
  title: string;
  schedule: string;
  location: string;
  attendance?: string;
  participantInitials?: readonly string[];
  dayLabel?: string;
  capacityLabel?: string;
  description?: string;
  cover?: ReactNode;
  action?: ReactNode;
  className?: string;
};

/** Presentational shell: pass display text and optional cover/action content. */
export function ActivityCard({
  title, schedule, location, attendance, participantInitials, dayLabel, capacityLabel,
  description, cover, action, className,
}: ActivityCardProps) {
  return (
    <article className={cn("min-w-0 bg-card text-card-foreground", className)}>
      <div className="relative isolate aspect-[8/5] overflow-hidden rounded-xl bg-secondary">
        {cover}
        <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-3">
          {dayLabel ? <span className="rounded-full bg-background px-3 py-1.5 text-xs font-bold">{dayLabel}</span> : <span />}
          <div className="flex items-center gap-2">
            {capacityLabel && <span className="rounded-full bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground">{capacityLabel}</span>}
            {action}
          </div>
        </div>
      </div>
      <div className="space-y-2 pt-4">
        <h2 className="activity-title break-words">{title}</h2>
        <p className="text-sm text-muted-foreground">{schedule}</p>
        <p className="flex items-start gap-2 text-sm text-muted-foreground"><MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" /><span>{location}</span></p>
        {attendance && <div className="flex items-center gap-3 pt-1 text-sm text-muted-foreground">{participantInitials && <div className="flex -space-x-2" aria-hidden="true">{participantInitials.slice(0, 3).map((initial, index) => <span key={`${initial}-${index}`} className={cn("flex size-8 items-center justify-center rounded-full border-2 border-background text-xs font-bold text-white", ["bg-amber-500", "bg-blue-500", "bg-pink-500"][index])}>{initial}</span>)}</div>}<p className="flex items-center gap-1.5"><Users className="size-4 shrink-0" aria-hidden="true" /><span>{attendance}</span></p></div>}
        {description && <p className="pt-3 text-sm">{description}</p>}
      </div>
    </article>
  );
}
