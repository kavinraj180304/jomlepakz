import { BookOpen, Dumbbell, Utensils, Users, Palette, CalendarDays } from "lucide-react";
import { categories, type Category } from "@/lib/demo/activities";
import { cn } from "@/lib/utils";

const icons = { Sports: Dumbbell, Study: BookOpen, Food: Utensils, Social: Users, Hobbies: Palette, Events: CalendarDays };
export function CategoryChips({ value, onChange }: { value: Category; onChange: (category: Category) => void }) {
  return (
    <div aria-label="Activity categories" className="horizontal-scroll flex gap-2 overflow-x-auto pb-1">
      {categories.map(category => {
        const Icon = category === "All" ? null : icons[category];
        return <button key={category} type="button" aria-pressed={value === category} onClick={() => onChange(category)} className={cn("flex h-11 shrink-0 items-center gap-2 rounded-2xl border px-4 text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring", value === category ? "border-primary/30 bg-accent text-primary" : "border-transparent bg-muted text-secondary-foreground")}>{Icon && <Icon className="size-4" aria-hidden="true" />}{category}</button>;
      })}
    </div>
  );
}
