import pdfMake from "pdfmake/build/pdfmake.js";
import pdfFonts from "pdfmake/build/vfs_fonts.js";

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
  const studiesByReference = new Map(
    output.previousStudies.map((study) => [study.studyReference, study]),
  );

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
        text: "Applicant",
        style: "sectionHeading",
      },
      detailsTable([
        ["Full name", output.applicant.fullName],
        ["TU/e student number", output.applicant.tueStudentNumber],
      ]),
      {
        text: "Previous studies",
        style: "sectionHeading",
      },
      ...output.previousStudies.flatMap((study, index) =>
        buildPreviousStudySection(study, index),
      ),
      {
        text: "Relevant courses",
        style: "sectionHeading",
      },
      ...output.courses.flatMap((course, index) =>
        buildCourseSection(course, index, studiesByReference),
      ),
      ...buildPrerequisiteCoverage(output),
      {
        text: "Embedded machine-readable information",
        style: "sectionHeading",
      },
      {
        text: `The validated Output JSON is embedded in this PDF as ${attachmentName}.`,
        margin: [0, 0, 0, 6],
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
      degreeHeading: {
        fontSize: 10.5,
        bold: true,
        color: "#0a7d61",
        margin: [0, 9, 0, 5],
      },
      courseHeading: {
        fontSize: 10.5,
        bold: true,
        color: "#0a7d61",
        margin: [0, 10, 0, 5],
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
        text: `Applicant report · Academic year ${output.formVersion}`,
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
      },
    ],
    columnGap: 16,
    margin: [0, 4, 0, 10],
  };
}

function buildPreviousStudySection(study, index) {
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

  return [
    {
      text: `Degree ${index + 1}: ${study.degreeProgrammeName}`,
      style: "degreeHeading",
    },
    detailsTable(details),
  ];
}

function buildCourseSection(course, index, studiesByReference) {
  const study = studiesByReference.get(course.degreeReference);
  const degreeLabel = study
    ? `${study.degreeProgrammeName} — ${study.universityName}`
    : course.degreeReference;
  return [
    {
      text: `Course ${index + 1}: ${course.courseCode} ${course.courseTitle}`,
      style: "courseHeading",
    },
    detailsTable([
      ["Degree", degreeLabel],
      [
        "Course credits",
        formatCourseCredits(course, study),
      ],
      ["Final grade", formatCourseGrade(course)],
      ["Official course description", course.officialDescription],
    ]),
  ];
}

function formatCourseCredits(course, study) {
  const convertedCredits = Number.isFinite(course.courseEC)
    ? ` (${formatEC(course.courseEC)} EC)`
    : "";

  if (!study) {
    return `${course.credits}${convertedCredits}`;
  }

  const creditSystem = getCreditSystemLabel(study);
  return (
    `${course.credits} / ${study.totalDegreeCredits} ` +
    `${creditSystem}${convertedCredits}`
  );
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
  const studiesByReference = new Map(
    output.previousStudies.map((study) => [study.studyReference, study]),
  );
  const coursesByReference = new Map(
    output.courses.map((course, index) => [
      course.courseReference,
      {
        course,
        courseNumber: index + 1,
        study: studiesByReference.get(course.degreeReference),
      },
    ]),
  );

  return [
    {
      text: "Prerequisite coverage",
      style: "sectionHeading",
    },
    ...output.prerequisiteCoverage.flatMap((requirement, index) =>
      buildRequirementSection(requirement, index + 1, coursesByReference),
    ),
  ];
}

function buildRequirementSection(
  requirement,
  requirementNumber,
  coursesByReference,
) {
  const heading = {
    text: `${requirementNumber}. ${requirement.requirementTitle}`,
    style: "requirementHeading",
  };
  const knowledgeTable = buildRequiredKnowledgeTable(
    requirement,
    coursesByReference,
  );
  const explanations = buildAdditionalExplanations(
    requirement,
    coursesByReference,
  );

  if (!requirement.courseEvidence.length) {
    return [
      {
        stack: [
          heading,
          knowledgeTable,
          {
            text: "No relevant course selected.",
            style: "muted",
            margin: [0, 0, 0, 4],
          },
        ],
        unbreakable: true,
      },
    ];
  }

  return [
    {
      stack: [heading, knowledgeTable],
      unbreakable: true,
    },
    ...explanations,
  ];
}

function buildRequiredKnowledgeTable(requirement, coursesByReference) {
  const rows = requirement.topics.map((topic) => [
    toTableCell(topic),
    buildCoveredByCell(requirement.courseEvidence, topic, coursesByReference),
  ]);

  return standardTable(
    ["*", 140],
    [
      [
        {
          text: "Required knowledge",
          style: "tableLabel",
          fillColor: "#f4f4f4",
        },
        {
          text: "Covered by",
          style: "tableLabel",
          fillColor: "#f4f4f4",
        },
      ],
      ...rows,
    ],
  );
}

function buildCoveredByCell(courseEvidence, topic, coursesByReference) {
  const coveredByCourses = courseEvidence
    .filter((evidence) => evidence.topicsCovered.includes(topic))
    .map((evidence) => {
      const courseEntry = coursesByReference.get(evidence.courseReference);
      return courseEntry
        ? formatCoveredByCourse(courseEntry)
        : evidence.courseReference;
    });

  if (!coveredByCourses.length) {
    return toTableCell("");
  }

  return {
    text: coveredByCourses.flatMap((course, index) => {
      if (typeof course === "string") {
        return [
          ...(index > 0 ? ["\n"] : []),
          { text: course, bold: true, color: "#0a7d61" },
        ];
      }

      return [
        ...(index > 0 ? ["\n"] : []),
        { text: course.label, bold: true, color: "#0a7d61" },
        { text: course.details, color: "#5f6368" },
      ];
    }),
  };
}

function formatCoveredByCourse({ course, courseNumber, study }) {
  const credits = Number.isFinite(course.courseEC)
    ? `${formatEC(course.courseEC)} EC`
    : `${course.credits}${study ? ` ${getCreditSystemLabel(study)}` : ""}`;

  return {
    label: `Course ${courseNumber}`,
    details: ` · ${credits} · grade ${formatCourseGrade(course)}`,
  };
}

function formatEC(value) {
  return new Intl.NumberFormat("en-GB", {
    maximumFractionDigits: 2,
  }).format(value);
}

function buildAdditionalExplanations(requirement, coursesByReference) {
  return requirement.courseEvidence.flatMap((evidence) => {
    if (!evidence.additionalExplanation) {
      return [];
    }

    const courseEntry = coursesByReference.get(evidence.courseReference);
    const courseLabel = courseEntry
      ? `Course ${courseEntry.courseNumber}`
      : evidence.courseReference;

    return [
      {
        text: `Additional explanation \u2014 ${courseLabel}`,
        style: "tableLabel",
        margin: [0, 5, 0, 2],
      },
      {
        text: evidence.additionalExplanation,
        margin: [0, 0, 0, 5],
      },
    ];
  });
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

  return { text: value || "—" };
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
