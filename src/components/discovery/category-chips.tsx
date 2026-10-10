import { BookOpen, Dumbbell, Utensils, Users, Palette, CalendarDays, Trophy, Gamepad2, Trees, HeartHandshake, Clapperboard, Ellipsis } from "lucide-react";
import type { ActivityCategory } from "@/lib/activities/validation";
import { cn } from "@/lib/utils";

const icons = { Sports: Trophy, Study: BookOpen, Food: Utensils, Gaming: Gamepad2, Events: CalendarDays, Fitness: Dumbbell, Outdoor: Trees, Volunteering: HeartHandshake, Networking: Users, Hobby: Palette, Entertainment: Clapperboard, Other: Ellipsis };
export function CategoryChips({ categories, value, onChange }: { categories: ActivityCategory[]; value: string; onChange: (category: string) => void }) {
  return (
    <div aria-label="Activity categories" className="horizontal-scroll flex gap-2 overflow-x-auto pb-1">
      {[{ slug: "", name: "All" }, ...categories].map(category => {
        const Icon = icons[category.name as keyof typeof icons];
        return <button key={category.slug} type="button" aria-pressed={value === category.slug} onClick={() => onChange(category.slug)} className={cn("flex h-11 shrink-0 items-center gap-2 rounded-2xl border px-4 text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring", value === category.slug ? "border-primary/30 bg-accent text-primary" : "border-transparent bg-muted text-secondary-foreground")}>{Icon && <Icon className="size-4" aria-hidden="true" />}{category.name}</button>;
      })}
    </div>
  );
}
