// Reference catalog shared by activity forms/discovery. Keep in sync with
// supabase/seed.sql; tests check IDs, slugs, labels, order and active flags.
export const activityCategories = [
  { id: "880cd028-bf0d-4f43-9ddc-000000000001", slug: "sports", name: "Sports", sortOrder: 1, isActive: true },
  { id: "880cd028-bf0d-4f43-9ddc-000000000002", slug: "study", name: "Study", sortOrder: 2, isActive: true },
  { id: "880cd028-bf0d-4f43-9ddc-000000000003", slug: "food", name: "Food", sortOrder: 3, isActive: true },
  { id: "880cd028-bf0d-4f43-9ddc-000000000004", slug: "gaming", name: "Gaming", sortOrder: 4, isActive: true },
  { id: "880cd028-bf0d-4f43-9ddc-000000000005", slug: "events", name: "Events", sortOrder: 5, isActive: true },
  { id: "880cd028-bf0d-4f43-9ddc-000000000006", slug: "fitness", name: "Fitness", sortOrder: 6, isActive: true },
  { id: "880cd028-bf0d-4f43-9ddc-000000000007", slug: "outdoor", name: "Outdoor", sortOrder: 7, isActive: true },
  { id: "880cd028-bf0d-4f43-9ddc-000000000008", slug: "volunteering", name: "Volunteering", sortOrder: 8, isActive: true },
  { id: "880cd028-bf0d-4f43-9ddc-000000000009", slug: "networking", name: "Networking", sortOrder: 9, isActive: true },
  { id: "880cd028-bf0d-4f43-9ddc-000000000010", slug: "hobby", name: "Hobby", sortOrder: 10, isActive: true },
  { id: "880cd028-bf0d-4f43-9ddc-000000000011", slug: "entertainment", name: "Entertainment", sortOrder: 11, isActive: true },
  { id: "880cd028-bf0d-4f43-9ddc-000000000012", slug: "other", name: "Other", sortOrder: 12, isActive: true },
] as const;

export type ActivityCategoryName = (typeof activityCategories)[number]["name"];
export const activityCategoryNames = activityCategories
  .filter(category => category.isActive)
  .map(category => category.name);

// IDs above are deterministic for a fresh Development seed. Resolve database
// relationships by slug when existing rows have different preserved IDs.
