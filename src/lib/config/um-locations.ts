export const LOCATION_MAX_LENGTH = 150;
export const CUSTOM_LOCATION_ID = "custom";
export const CUSTOM_LOCATION_LABEL = "Other / Custom Location";

// Curated place names, not coordinates, venue availability or map integration.
// Sources: official UM library, iFest, facilities and botanic garden pages;
// source links are recorded in supabase/README.md.
export const umLocations = [
  { id: "um-main-library", label: "UM Main Library", isActive: true },
  { id: "um-sports-centre", label: "UM Sports Centre", isActive: true },
  { id: "um-varsity-lake", label: "UM Varsity Lake", isActive: true },
  { id: "dewan-tunku-canselor", label: "Dewan Tunku Canselor (DTC)", isActive: true },
  { id: "kompleks-perdanasiswa", label: "Kompleks Perdanasiswa", isActive: true },
  { id: "rimba-ilmu", label: "Rimba Ilmu Botanic Garden", isActive: true },
] as const;

export function normalizeLocationText(input: unknown): string {
  if (typeof input !== "string") throw new Error("Enter a location.");
  // Reject controls before trim, including embedded/newline-only submissions.
  if (Array.from(input).some(character => {
    const code = character.codePointAt(0)!;
    return code < 32 || (code >= 127 && code <= 159);
  })) throw new Error("Use a single-line location without control characters.");
  const value = input.trim();
  if (!value) throw new Error("Enter a location.");
  // Match PostgreSQL char_length for the saved, normalized text.
  if (Array.from(value).length > LOCATION_MAX_LENGTH) {
    throw new Error(`Keep the location to ${LOCATION_MAX_LENGTH} characters or fewer.`);
  }
  return value;
}

export function resolveActivityLocation(selection: unknown, customText: unknown = ""): string {
  if (selection === CUSTOM_LOCATION_ID) return normalizeLocationText(customText);
  const preset = umLocations.find(location => location.id === selection && location.isActive);
  if (!preset) throw new Error("Choose a location or Other / Custom Location.");
  return preset.label;
}
