export const PRESET_CATEGORIES = [
  "Videogames",
  "Anime",
  "Nature",
  "Cars",
  "Abstract",
  "Space",
  "Minimal",
  "Cityscape",
  "Fantasy & Sci-Fi",
  "Animals",
  "Seasonal",
  "Moods",
  "Other",
] as const;

export type PresetCategory = (typeof PRESET_CATEGORIES)[number];
