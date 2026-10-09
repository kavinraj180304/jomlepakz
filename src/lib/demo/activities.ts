// STATIC DEMO DATA. No accounts, database, real dates, or persisted state.
export const categories = ["All", "Sports", "Study", "Food", "Social", "Hobbies", "Events"] as const;
export type Category = (typeof categories)[number];
export const dateFilters = ["Upcoming", "Today", "Tomorrow", "Weekend"] as const;
export type DateFilter = (typeof dateFilters)[number];
export type DemoActivity = {
  id: string;
  title: string;
  category: Exclude<Category, "All">;
  day: Exclude<DateFilter, "Upcoming">;
  dayLabel: string;
  schedule: string;
  location: string;
  onCampus: boolean;
  capacity: number;
  participants: readonly string[];
  image: string;
  imageAlt: string;
  description: string;
};

export const demoActivities: readonly DemoActivity[] = [
  { id: "badminton-tonight", title: "Badminton Tonight", category: "Sports", day: "Today", dayLabel: "Tonight", schedule: "Today · 8:00 PM · 90 mins", location: "KK1 Badminton Court", onCampus: true, capacity: 6, participants: ["A", "D", "M", "S"], image: "/demo/sports.jpg", imageAlt: "A shuttlecock resting on badminton rackets", description: "A relaxed evening of badminton with fellow UM students. All skill levels are welcome. Bring your racket and some water." },
  { id: "lunch-buddies", title: "Lunch Buddies", category: "Food", day: "Today", dayLabel: "Today", schedule: "Today · 12:30 PM · 1 hr", location: "UM Central Cafeteria", onCampus: true, capacity: 5, participants: ["J", "N"], image: "/demo/food.jpg", imageAlt: "A colourful bowl of fresh food", description: "Take a study break and share lunch with a small group. Choose your own meal and meet at the cafeteria entrance." },
  { id: "library-study", title: "Library Study Session", category: "Study", day: "Tomorrow", dayLabel: "Tomorrow", schedule: "Tomorrow · 2:00 PM · 2 hrs", location: "UM Main Library", onCampus: true, capacity: 4, participants: ["K", "H", "R", "T"], image: "/demo/study.jpg", imageAlt: "Books and study materials on a desk", description: "Quiet company for getting through assignments. Bring your own work and join a shared break between study blocks." },
  { id: "weekend-food", title: "Weekend Food Hangout", category: "Social", day: "Weekend", dayLabel: "Weekend", schedule: "Weekend · 1:00 PM · 90 mins", location: "Bangsar cafe", onCampus: false, capacity: 6, participants: ["L", "F", "C"], image: "/demo/food.jpg", imageAlt: "Fresh food prepared for a shared meal", description: "Meet a few new faces over a casual meal near campus. This is an illustrative demo listing, not a real organised event." },
];

