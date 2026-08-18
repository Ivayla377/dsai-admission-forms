import pdfMake from "pdfmake/build/pdfmake.js";
import pdfFonts from "pdfmake/build/vfs_fonts.js";

import { serializeOutputJson } from "./output.js";

pdfMake.addVirtualFileSystem(pdfFonts);

const CREDIT_SYSTEM_LABELS = Object.freeze({
  ects: "ECTS",
  us_semester_credits: "US semester credits",
  us_quarter_credits: "US quarter credits",
  uk_cats: "UK credits (CATS)",
  other: "Other credit system",
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
      { text: "Additional Admissions Form", style: "reportTitle" },
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
  const creditSystem =
    study.creditSystem === "other"
      ? study.creditSystemOther
      : CREDIT_SYSTEM_LABELS[study.creditSystem] ?? study.creditSystem;

  return [
    {
      text: `Degree ${index + 1}: ${study.degreeProgrammeName}`,
      style: "degreeHeading",
    },
    detailsTable([
      ["Study reference", study.studyReference],
      ["Degree programme", study.degreeProgrammeName],
      ["Graduation date", formatDate(study.graduationDate)],
      ["University", study.universityName],
      ["Location", `${study.city}, ${study.country}`],
      ["Total degree credits", String(study.totalDegreeCredits)],
      ["Credit system", creditSystem],
    ]),
  ];
}

function detailsTable(rows) {
  return {
    table: {
      widths: [135, "*"],
      body: rows.map(([label, value]) => [
        { text: label, style: "tableLabel", fillColor: "#f4f4f4" },
        { text: value || "—" },
      ]),
    },
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
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
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
