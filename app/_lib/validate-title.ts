export const TITLE_REQUIRED = "Enter a title";
export const TITLE_TOO_LONG = "Title can be at most 200 characters";
export type TitleError = typeof TITLE_REQUIRED | typeof TITLE_TOO_LONG;

const MAX_TITLE_LENGTH = 200;

export function validateTitle(title: string): TitleError | null {
  if (title.trim() === "") return TITLE_REQUIRED;
  // Count Unicode code points, not UTF-16 units.
  if ([...title].length > MAX_TITLE_LENGTH) return TITLE_TOO_LONG;
  return null;
}
