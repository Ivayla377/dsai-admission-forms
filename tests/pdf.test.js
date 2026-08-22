import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import formDefinition from "../forms/2025-2026.json" with { type: "json" };
import fixture from "./fixtures/synthetic-application.json" with { type: "json" };
import { buildOutput, serializeOutputJson } from "../src/output.js";
import {
  buildPdfDefinition,
  createAugmentedPdfBlob,
  getPdfFilename,
} from "../src/pdf.js";

const output = buildOutput({
  surveyData: fixture,
  formDefinition,
  formVersion: "2025-2026",
  generatedAt: "2026-08-18T10:00:00.000Z",
});

test("the PDF definition embeds the exact Output JSON", () => {
  const definition = buildPdfDefinition(output);
  const attachment = definition.files.outputJson;
  const encodedContent = attachment.src.split(",", 2)[1];
  const embeddedJson = Buffer.from(encodedContent, "base64").toString("utf8");

  assert.equal(attachment.name, "dsai-admission-2025-2026.json");
  assert.equal(embeddedJson, serializeOutputJson(output));
});

test("the application PDF has the user-facing admissions filename", () => {
  assert.equal(
    getPdfFilename(output),
    "DSAI-additional-admissions-2025-2026.pdf",
  );
});

test("the PDF definition includes courses and normalized prerequisite coverage", () => {
  const requirement = getFirstRequirementWithTopics(formDefinition);
  const topic = getChoiceValue(requirement.topics[0]);
  const outputWithEvidence = buildOutput({
    surveyData: {
      ...fixture,
      [requirement.evidenceQuestionName]: [
        {
          course_ref: fixture.relevant_courses[0].course_ref,
          topics_covered: [topic],
          additional_explanation: "The course catalogue uses equivalent terminology.",
        },
      ],
    },
    formDefinition,
    formVersion: "2025-2026",
    generatedAt: "2026-08-18T10:00:00.000Z",
  });
  const definition = buildPdfDefinition(outputWithEvidence);
  const renderedText = collectText(definition.content).join("\n");
  const studyDetailsTable = definition.content.find(
    (item) => item.table?.body?.[0]?.[0]?.text === "Degree programme",
  );
  const courseDetailsTable = definition.content.find(
    (item) =>
      item.table?.body?.[0]?.[0]?.text === "Degree",
  );
  const overviewTable = findTableByFirstCell(
    definition.content,
    `1. ${requirement.title}`,
  );
  const knowledgeTable = findTableByFirstCell(
    definition.content,
    "Required knowledge",
  );

  assert.match(renderedText, /Relevant courses/);
  assert.match(renderedText, /Course 1: MATH101 Linear Algebra/);
  assert.doesNotMatch(renderedText, /MATH101 — Linear Algebra/);
  assert.match(
    renderedText,
    /Bachelor of Computer Science — Example University/,
  );
  assert.doesNotMatch(renderedText, /Study reference/);
  assert.doesNotMatch(renderedText, /Course reference/);
  assert.doesNotMatch(renderedText, /Credit system/);
  assert.doesNotMatch(renderedText, /\(degree-1\)/);
  assert.match(renderedText, /5 \/ 180 ECTS/);
  assert.match(renderedText, /Matrices, vector spaces, linear systems/);
  assert.match(
    renderedText,
    new RegExp(`1\\. ${escapeRegExp(requirement.title)}`),
  );
  assert.match(renderedText, /Prerequisite coverage/);
  assert.match(renderedText, /Overview/);
  assert.doesNotMatch(renderedText, /Prerequisite coverage: foundations/i);
  assert.doesNotMatch(
    renderedText,
    /Prerequisite coverage: software, data and project work/i,
  );
  assert.match(
    renderedText,
    new RegExp(`Partially covered \\(1 of ${requirement.topics.length}\\)`),
  );
  assert.match(renderedText, /Not covered/);
  assert.match(renderedText, /Required knowledge/);
  assert.match(renderedText, /Covered by/);
  assert.match(renderedText, /Course 1/);
  assert.match(renderedText, /Additional explanation — Course 1/);
  assert.doesNotMatch(renderedText, /Prerequisite knowledge:/);
  assert.doesNotMatch(renderedText, /Relevant course 1:/);
  assert.match(renderedText, /10\. Group Project Work/);
  assert.match(
    renderedText,
    /Presenting and writing skills in group project work/,
  );
  assert.match(renderedText, new RegExp(escapeRegExp(topic)));
  assert.match(renderedText, /The course catalogue uses equivalent terminology/);
  assert.ok(studyDetailsTable);
  assert.ok(courseDetailsTable);
  assert.ok(overviewTable);
  assert.ok(knowledgeTable);
  assert.equal(knowledgeTable.table.body[1][0].text, topic);
  assert.equal(
    knowledgeTable.table.body[1][1].text[0].text,
    "Course 1",
  );
  assert.equal(
    knowledgeTable.table.body[1][1].text[1].text,
    " · 5 ECTS · grade 8.5",
  );
  assert.deepEqual(knowledgeTable.table.widths, ["*", 140]);
  assert.equal(
    overviewTable.table.body[0][1].text,
    `Partially covered (1 of ${requirement.topics.length})`,
  );
  assert.equal(
    overviewTable.layout.hLineColor(),
    courseDetailsTable.layout.hLineColor(),
  );
  assert.equal(
    knowledgeTable.layout.paddingTop(),
    courseDetailsTable.layout.paddingTop(),
  );
  assert.deepEqual(
    studyDetailsTable.table.body.map(([label]) => label.text),
    [
      "Degree programme",
      "Graduation date",
      "University",
      "Location",
      "Total degree credits",
    ],
  );
  assert.deepEqual(
    courseDetailsTable.table.body.map(([label]) => label.text),
    [
      "Degree",
      "Course credits",
      "Final grade",
      "Official course description",
    ],
  );
  assert.equal(courseDetailsTable.table.body[1][1].text, "5 / 180 ECTS");
});

test("pdfmake can generate an augmented PDF blob", async () => {
  const logo = readFileSync(new URL("../tue_logo.jpg", import.meta.url));
  const logoUrl = `data:image/jpeg;base64,${logo.toString("base64")}`;
  const blob = await createAugmentedPdfBlob(output, { logoUrl });
  const signature = Buffer.from(await blob.arrayBuffer())
    .subarray(0, 5)
    .toString("ascii");

  assert.equal(blob.type, "application/pdf");
  assert.equal(signature, "%PDF-");
});

function getFirstRequirementWithTopics(definition) {
  for (const page of definition.pages) {
    for (const panel of page.elements) {
      if (panel.type !== "panel" || !panel.name.startsWith("requirement_")) {
        continue;
      }

      const evidence = panel.elements.find(
        (element) => element.type === "paneldynamic",
      );
      const topics = evidence.templateElements.find(
        (element) => element.name === "topics_covered",
      )?.choices;

      if (topics?.length) {
        return {
          title: panel.title,
          evidenceQuestionName: evidence.name,
          topics,
        };
      }
    }
  }

  throw new Error("The form should define at least one requirement with topics.");
}

function getChoiceValue(choice) {
  return typeof choice === "object" ? choice.value : choice;
}

function collectText(value) {
  if (typeof value === "string") {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.flatMap(collectText);
  }
  if (!value || typeof value !== "object") {
    return [];
  }

  return Object.entries(value)
    .filter(([key]) => key !== "files")
    .flatMap(([, nestedValue]) => collectText(nestedValue));
}

function findTableByFirstCell(value, text) {
  if (Array.isArray(value)) {
    for (const item of value) {
      const table = findTableByFirstCell(item, text);
      if (table) return table;
    }
    return undefined;
  }
  if (!value || typeof value !== "object") {
    return undefined;
  }
  if (value.table?.body?.[0]?.[0]?.text === text) {
    return value;
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    if (key === "files") continue;
    const table = findTableByFirstCell(nestedValue, text);
    if (table) return table;
  }
  return undefined;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
