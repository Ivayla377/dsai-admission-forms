// Annual credit loads are kept explicit so each named conversion is auditable:
// ECTS defines 60 credits per full-time year; Nuffic documents 30 US semester
// credits, 45 US quarter credits and 120 UK CATS credits per full-time year.
export const NAMED_CREDIT_SYSTEM_CREDITS_PER_YEAR = Object.freeze({
  ects: 60,
  us_semester_credits: 30,
  us_quarter_credits: 45,
  uk_cats: 120,
});

export function convertCourseCreditsToEC({
  creditSystem,
  courseCredits,
  totalDegreeCredits,
  fullTimeEquivalentDurationYears,
}) {
  if (!Number.isFinite(courseCredits) || courseCredits <= 0) {
    throw new RangeError("Course credits must be a positive finite number.");
  }

  if (creditSystem === "other") {
    if (!Number.isFinite(totalDegreeCredits) || totalDegreeCredits <= 0) {
      throw new RangeError(
        "Total degree credits must be a positive finite number.",
      );
    }
    if (
      !Number.isFinite(fullTimeEquivalentDurationYears) ||
      fullTimeEquivalentDurationYears <= 0
    ) {
      throw new RangeError(
        "Full-time equivalent duration must be a positive finite number.",
      );
    }

    const courseEC =
      (courseCredits /
        (totalDegreeCredits / fullTimeEquivalentDurationYears)) *
      60;
    return courseEC;
  }

  if (!Object.hasOwn(NAMED_CREDIT_SYSTEM_CREDITS_PER_YEAR, creditSystem)) {
    throw new RangeError(
      `Credit system "${creditSystem}" has no EC conversion rule.`,
    );
  }

  const creditsPerYear = NAMED_CREDIT_SYSTEM_CREDITS_PER_YEAR[creditSystem];
  return (courseCredits / creditsPerYear) * 60;
}
