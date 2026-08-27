import pdfMake from "pdfmake/build/pdfmake.js";
import pdfFonts from "pdfmake/build/vfs_fonts.js";

import { convertCourseCreditsToEC } from "./credit-conversion.js";
import { serializeOutputJson } from "./output.js";

pdfMake.addVirtualFileSystem(pdfFonts);

const CREDIT_SYSTEM_LABELS = Object.freeze({
  ects: "ECTS",
  us_semester_credits: "US semester credits",
  us_quarter_credits: "US quarter credits",
  uk_cats: "UK credits (CATS)",
  other: "Other",
});

const GRADING_SYSTEM_LABELS = Object.freeze({
  numeric_higher_better: "Numeric - higher grades are better",
  numeric_lower_better: "Numeric - lower grades are better",
  letter_grades: "Letter grades",
  pass_fail: "Pass / Fail",
  other: "Other",
});

export function buildPdfDefinition(output, { logoUrl = "" } = {}) {
  const outputJson = serializeOutputJson(output);
  const attachmentName = `dsai-admission-${output.formVersion}.json`;

  return {
    info: {
      title: `DS&AI admission application ${output.formVersion}`,
      author: "Eindhoven University of Technology",
      subject: "DS&AI additional admissions information",
      creator: "TU/e DS&AI offline admissions form",
    },
    pageSize: "A4",
    pageMargins: [42, 58, 42, 52],
    header: () => ({
      text: "TU/e · DS&AI Additional Admissions Form",
      style: "pageHeader",
      margin: [42, 22, 42, 0],
    }),
    footer: (currentPage, pageCount) => ({
      columns: [
        { text: `Form ${output.formVersion}`, alignment: "left" },
        { text: `Page ${currentPage} of ${pageCount}`, alignment: "right" },
      ],
      style: "pageFooter",
      margin: [42, 0, 42, 18],
    }),
    content: [
      buildReportHeading(output, logoUrl),
      {
        text: "1. Applicant",
        style: "sectionHeading",
      },
      detailsTable([
        ["Full name", output.applicant.fullName],
        ["TU/e student number", output.applicant.tueStudentNumber],
      ]),
      {
        text: "2. Previous studies",
        style: "sectionHeading",
      },
      ...output.previousStudies.flatMap((study) =>
        buildPreviousStudySection(study),
      ),
      ...buildPrerequisiteCoverage(output),
      ...buildUnusedCoursesWarning(output),
      ...buildCourseGradeWarning(output),
      {
        text: `The validated Output JSON is embedded in this PDF as ${attachmentName}.`,
        margin: [0, 18, 0, 6],
      },
      {
        text: `Output schema version: ${output.outputSchemaVersion}`,
        style: "metadata",
      },
      {
        text: `Generated: ${formatDateTime(output.generatedAt)}`,
        style: "metadata",
      },
      ...buildWarnings(output.generationWarnings),
    ],
    files: {
      outputJson: {
        src: textToDataUrl(outputJson, "application/json"),
        name: attachmentName,
        description: "Machine-readable DS&AI admission application data",
      },
    },
    defaultStyle: {
      font: "Roboto",
      fontSize: 9.5,
      lineHeight: 1.25,
      color: "#111111",
    },
    styles: {
      reportTitle: {
        fontSize: 19,
        bold: true,
        color: "#111111",
      },
      reportSubtitle: {
        fontSize: 10.5,
        color: "#5f6368",
        margin: [0, 5, 0, 0],
      },
      sectionHeading: {
        fontSize: 12.5,
        bold: true,
        color: "#111111",
        margin: [0, 18, 0, 8],
      },
      requirementHeading: {
        fontSize: 11,
        bold: true,
        color: "#111111",
        margin: [0, 12, 0, 5],
      },
      muted: {
        color: "#5f6368",
        italics: true,
      },
      tableLabel: {
        bold: true,
        color: "#333333",
      },
      metadata: {
        color: "#5f6368",
        fontSize: 8.5,
        margin: [0, 1, 0, 0],
      },
      warning: {
        color: "#8a5a00",
        fontSize: 8.5,
        margin: [0, 4, 0, 0],
      },
      reviewAlertHeading: {
        fontSize: 10.5,
        bold: true,
        color: "#111111",
        margin: [0, 14, 0, 5],
      },
      reviewAlertNotice: {
        color: "#5f6368",
        fontSize: 9,
        margin: [0, 0, 0, 6],
      },
      pageHeader: {
        color: "#5f6368",
        fontSize: 8,
      },
      pageFooter: {
        color: "#777777",
        fontSize: 8,
      },
    },
  };
}

export async function createAugmentedPdfBlob(output, options = {}) {
  const definition = buildPdfDefinition(output, options);
  return pdfMake.createPdf(definition).getBlob();
}

export function getPdfFilename(output) {
  return `DSAI-additional-admissions-${output.formVersion}.pdf`;
}

export function downloadPdfBlob(blob, output) {
  const filename = getPdfFilename(output);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function buildReportHeading(output, logoUrl) {
  const textColumn = {
    width: "*",
    stack: [
      { text: "DS&AI Additional Admissions Form", style: "reportTitle" },
      {
        text: `Academic year ${output.formVersion}`,
        style: "reportSubtitle",
      },
    ],
  };

  if (!logoUrl) {
    return { ...textColumn, margin: [0, 4, 0, 10] };
  }

  return {
    columns: [
      textColumn,
      {
        image: logoUrl,
        width: 58,
        alignment: "right",
        margin: [0, -18, 0, 0],
      },
    ],
    columnGap: 16,
    margin: [0, 4, 0, 10],
  };
}

function buildPreviousStudySection(study) {
  const details = [
    ["Degree programme", study.degreeProgrammeName],
    ["Graduation date", formatDate(study.graduationDate)],
    ["University", study.universityName],
    ["Location", `${study.city}, ${study.country}`],
    [
      "Full-time equivalent duration",
      formatStudyDuration(study.fullTimeEquivalentDurationYears),
    ],
    ["Credit system", getCreditSystemLabel(study)],
    ["Total degree credits", String(study.totalDegreeCredits)],
    [
      "Grading system",
      GRADING_SYSTEM_LABELS[study.gradingSystem] ?? study.gradingSystem,
    ],
  ];

  if (study.bestGrade) {
    details.push(["Best possible grade", study.bestGrade]);
  }
  if (study.minimumPassingGrade) {
    details.push(["Minimum passing grade", study.minimumPassingGrade]);
  }
  if (study.gradingSystemInformation) {
    details.push([
      "Grading system information",
      study.gradingSystemInformation,
    ]);
  }

  return [detailsTable(details)];
}

function formatCourseGrade(course) {
  return course.isPassFail ? "Pass" : course.finalGrade;
}

function getCreditSystemLabel(study) {
  if (study.creditSystem === "other") {
    return study.creditSystemOther || CREDIT_SYSTEM_LABELS.other;
  }

  return CREDIT_SYSTEM_LABELS[study.creditSystem] ?? study.creditSystem;
}

function formatStudyDuration(years) {
  return `${years} ${years === 1 ? "year" : "years"}`;
}

function buildPrerequisiteCoverage(output) {
  const studiesByReference = buildStudiesByReference(output.previousStudies);
  const coursesByReference = new Map(
    output.courses.map((course) => {
      const studyEntry = studiesByReference.get(course.degreeReference);
      return [
        course.courseReference,
        {
          course,
          study: studyEntry?.study,
          degreeNumber: studyEntry?.degreeNumber,
        },
      ];
    }),
  );
  const requirementsByCourse = buildRequirementsByCourse(
    output.prerequisiteCoverage,
  );

  return [
    {
      text: "3. Prerequisite coverage",
      style: "sectionHeading",
    },
    ...output.prerequisiteCoverage.flatMap((requirement, index) =>
      buildRequirementSection(
        requirement,
        index + 1,
        coursesByReference,
        requirementsByCourse,
      ),
    ),
  ];
}

function buildUnusedCoursesWarning(output) {
  const usedCourseReferences = new Set(
    output.prerequisiteCoverage.flatMap((requirement) =>
      requirement.courseEvidence.map((evidence) => evidence.courseReference),
    ),
  );
  const unusedCourses = output.courses.filter(
    (course) => !usedCourseReferences.has(course.courseReference),
  );

  if (!unusedCourses.length) return [];

  const studiesByReference = buildStudiesByReference(output.previousStudies);

  return [
    {
      text: "Review alert: unused relevant courses",
      style: "reviewAlertHeading",
    },
    {
      text: "The following entered courses are not used as evidence for any prerequisite subject.",
      style: "reviewAlertNotice",
    },
    ...unusedCourses.map((course) => {
      const studyEntry = studiesByReference.get(course.degreeReference);
      if (!studyEntry) {
        throw new Error(
          `Cannot generate unused course details for unknown degree reference "${course.degreeReference}".`,
        );
      }

      return buildCourseEvidenceTable({
        course,
        study: studyEntry.study,
        degreeNumber: studyEntry.degreeNumber,
        additionalExplanation: "-",
        alsoUsedFor: "-",
      });
    }),
  ];
}

function buildCourseGradeWarning(output) {
  const studiesByReference = new Map(
    output.previousStudies.map((study) => [study.studyReference, study]),
  );
  const coursesBelowPassingGrade = [];

  for (const course of output.courses) {
    if (course.isPassFail) continue;

    const study = studiesByReference.get(course.degreeReference);
    if (!study) {
      throw new Error(
        `Cannot review the grade for unknown degree reference "${course.degreeReference}".`,
      );
    }
    if (
      !["numeric_higher_better", "numeric_lower_better"].includes(
        study.gradingSystem,
      )
    ) {
      continue;
    }

    const courseGrade = parseNumericGrade(course.finalGrade);
    const passingGrade = parseNumericGrade(study.minimumPassingGrade);
    if (courseGrade === null || passingGrade === null) continue;

    const doesNotMeetPassingThreshold =
      study.gradingSystem === "numeric_higher_better"
        ? courseGrade < passingGrade
        : courseGrade > passingGrade;

    if (doesNotMeetPassingThreshold) {
      coursesBelowPassingGrade.push({ course, study });
    }
  }

  if (!coursesBelowPassingGrade.length) return [];

  const body = [
    ["Course code", "Course title", "Grade", "University", "Passing grade"].map(
      (label) => ({
        text: label,
        style: "tableLabel",
        fillColor: "#f4f4f4",
      }),
    ),
    ...coursesBelowPassingGrade.map(({ course, study }) => [
      toTableCell(course.courseCode),
      toTableCell(course.courseTitle),
      toTableCell(formatCourseGrade(course)),
      toTableCell(study.universityName),
      toTableCell(study.minimumPassingGrade),
    ]),
  ];

  return [
    {
      text: "Review alert: course grade may not meet the passing requirement",
      style: "reviewAlertHeading",
    },
    {
      text: "The following numeric course grades appear not to meet the passing threshold of their corresponding degree. Review the entered grades and grading systems.",
      style: "reviewAlertNotice",
    },
    standardTable([65, "*", 45, 120, 65], body),
  ];
}

function parseNumericGrade(value) {
  const normalized = String(value ?? "").trim().replace(",", ".");
  if (!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(normalized)) return null;

  const grade = Number(normalized);
  return Number.isFinite(grade) ? grade : null;
}

function buildStudiesByReference(studies) {
  return new Map(
    studies.map((study, index) => [
      study.studyReference,
      { study, degreeNumber: index + 1 },
    ]),
  );
}

function buildRequirementsByCourse(requirements) {
  const requirementsByCourse = new Map();

  for (const requirement of requirements) {
    for (const evidence of requirement.courseEvidence) {
      const uses = requirementsByCourse.get(evidence.courseReference) ?? [];
      uses.push(requirement);
      requirementsByCourse.set(evidence.courseReference, uses);
    }
  }

  return requirementsByCourse;
}

function buildRequirementSection(
  requirement,
  requirementNumber,
  coursesByReference,
  requirementsByCourse,
) {
  const content = [
    {
      text: `3.${requirementNumber} ${requirement.requirementTitle}`,
      style: "requirementHeading",
    },
    {
      text: "Required topics",
      style: "tableLabel",
      margin: [0, 0, 0, 3],
    },
    {
      ul: requirement.topics,
      margin: [12, 0, 0, 7],
    },
    {
      text: "Evidence",
      style: "tableLabel",
      margin: [0, 0, 0, 3],
    },
  ];

  if (!requirement.courseEvidence.length) {
    content.push({
      text: "No relevant course selected.",
      style: "muted",
      margin: [0, 0, 0, 4],
    });
    return content;
  }

  content.push(
    ...requirement.courseEvidence.flatMap((evidence) =>
      buildEvidenceCourseSection(
        evidence,
        requirement,
        coursesByReference,
        requirementsByCourse,
      ),
    ),
  );

  return content;
}

function buildEvidenceCourseSection(
  evidence,
  currentRequirement,
  coursesByReference,
  requirementsByCourse,
) {
  const courseEntry = coursesByReference.get(evidence.courseReference);
  if (!courseEntry?.study) {
    throw new Error(
      `Cannot generate course evidence for unknown reference "${evidence.courseReference}".`,
    );
  }

  const { course, study, degreeNumber } = courseEntry;
  const otherRequirements = (
    requirementsByCourse.get(evidence.courseReference) ?? []
  ).filter(
    (requirement) =>
      requirement.requirementReference !== currentRequirement.requirementReference,
  );
  return [
    buildCourseEvidenceTable({
      course,
      study,
      degreeNumber,
      additionalExplanation: evidence.additionalExplanation || "-",
      alsoUsedFor: otherRequirements.length
        ? otherRequirements
            .map((requirement) => requirement.requirementTitle)
            .join(", ")
        : "-",
    }),
  ];
}

function buildCourseEvidenceTable({
  course,
  study,
  degreeNumber,
  additionalExplanation,
  alsoUsedFor,
}) {
  const body = [
    ["Course code", "Course title", "EC", "Grade"].map((label) => ({
      text: label,
      style: "tableLabel",
      fillColor: "#f4f4f4",
    })),
    [
      toTableCell(course.courseCode),
      toTableCell(course.courseTitle),
      toTableCell(formatEC(convertCourseToEC(course, study))),
      toTableCell(formatCourseGrade(course)),
    ],
    mergedEvidenceRow(
      "Degree",
      `Degree ${degreeNumber}: ${study.degreeProgrammeName} (${study.universityName})`,
    ),
    mergedEvidenceRow(
      "Official course description",
      course.officialDescription,
    ),
    mergedEvidenceRow("Additional explanation", additionalExplanation),
    mergedEvidenceRow("Also used for", alsoUsedFor),
  ];

  return standardTable([105, "*", 40, 48], body);
}

function mergedEvidenceRow(label, value) {
  return [
    { text: label, style: "tableLabel", fillColor: "#f4f4f4" },
    { text: addPdfSoftBreaks(pdfDisplayValue(value)), colSpan: 3 },
    {},
    {},
  ];
}

function convertCourseToEC(course, study) {
  return convertCourseCreditsToEC({
    creditSystem: study.creditSystem,
    courseCredits: course.credits,
    totalDegreeCredits: study.totalDegreeCredits,
    fullTimeEquivalentDurationYears: study.fullTimeEquivalentDurationYears,
  });
}

function formatEC(value) {
  return new Intl.NumberFormat("en-GB", {
    maximumFractionDigits: 2,
  }).format(value);
}

function detailsTable(rows) {
  return standardTable(
    [135, "*"],
    rows.map(([label, value]) => [
      { text: label, style: "tableLabel", fillColor: "#f4f4f4" },
      toTableCell(value),
    ]),
  );
}

function standardTable(widths, body) {
  return {
    table: { widths, body },
    layout: {
      hLineColor: () => "#d7d7d7",
      vLineColor: () => "#d7d7d7",
      paddingLeft: () => 7,
      paddingRight: () => 7,
      paddingTop: () => 5,
      paddingBottom: () => 5,
    },
    margin: [0, 0, 0, 6],
  };
}

function toTableCell(value) {
  if (value && typeof value === "object") {
    return value;
  }

  return { text: addPdfSoftBreaks(pdfDisplayValue(value)) };
}

function pdfDisplayValue(value) {
  return value === undefined || value === null || value === "" ? "-" : value;
}

// pdfmake does not split very long tokens, which can force a table beyond the
// page boundary. Zero-width spaces add PDF-only wrapping opportunities without
// changing the visible text or the embedded Output JSON.
function addPdfSoftBreaks(value) {
  return String(value).replace(/\S{19,}/gu, (token) => {
    const characters = Array.from(token);
    const chunks = [];

    for (let index = 0; index < characters.length; index += 18) {
      chunks.push(characters.slice(index, index + 18).join(""));
    }
    return chunks.join("\u200B");
  });
}

function buildWarnings(warnings) {
  if (!warnings.length) return [];

  return [
    {
      text: "Generation warnings",
      style: "sectionHeading",
    },
    ...warnings.map((warning) => ({
      text: `${warning.path}: ${warning.message}`,
      style: "warning",
    })),
  ];
}

function formatDate(value) {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "Europe/Amsterdam",
    timeZoneName: "short",
  }).format(date);
}

function textToDataUrl(text, mediaType) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return `data:${mediaType};charset=utf-8;base64,${btoa(binary)}`;
}
