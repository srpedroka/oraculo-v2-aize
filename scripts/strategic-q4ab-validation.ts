export function hasGroundedRelativeHistoricalPeriod(lessons: string[]) {
  return lessons.some((lesson) => /\b(?:ciclo|plano|ano|per[ií]odo)\s+anterior\b/i.test(lesson));
}
