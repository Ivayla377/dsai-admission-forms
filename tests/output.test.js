import assert from "node:assert/strict";
import test from "node:test";

import formDefinition from "../forms/2025-2026.json" with { type: "json" };
import fixture from "./fixtures/synthetic-application.json" with { type: "json" };
import {
  buildOutput,
  serializeOutputJson,
} from "../src/output.js";

const generatedAt = "2026-08-18T10:00:00.000Z";

test("SurveyJS data is normalized into the versioned Output JSON", () => {
  const output = buildOutput({
    surveyData: fixture,
    formDefinition,
    formVersion: "2025-2026",
    generatedAt,
  });

  assert.equal(output.outputSchemaVersion, "1");
  assert.equal(output.formVersion, "2025-2026");
  assert.equal(output.generatedAt, generatedAt);
  assert.deepEqual(output.applicant, {
    fullName: "Ada Example",
    tueStudentNumber: "1234567",
  });
  assert.equal(output.previousStudies[0].studyReference, "degree-1");
  assert.equal(output.previousStudies[0].totalDegreeCredits, 180);
  assert.equal(output.previousStudies[0].creditSystem, "ects");
  assert.equal(output.previousStudies[0].creditSystemOther, null);
  assert.equal(output.courses[0].courseReference, "degree-1::MATH101");
  assert.equal(output.courses[0].degreeReference, "degree-1");
  assert.equal(output.courses[0].finalGrade, "8.5");

  const expectedRequirements = getRequirements(formDefinition);
  assert.deepEqual(
    output.prerequisiteCoverage.map(
      (requirement) => requirement.requirementTitle,
    ),
    expectedRequirements.map((requirement) => requirement.title),
  );
  assert.ok(
    output.prerequisiteCoverage.every(
      (requirement) => requirement.courseEvidence.length === 0,
    ),
  );
  assert.equal(output.prerequisiteCoverage.length, 10);
  assert.ok(
    output.prerequisiteCoverage.every(
      (requirement) =>
        !Object.hasOwn(requirement, "sectionReference") &&
        !Object.hasOwn(requirement, "sectionTitle") &&
        !Object.hasOwn(requirement, "requirements"),
    ),
  );
  assert.deepEqual(output.generationWarnings, []);
  assert.doesNotThrow(() => JSON.parse(serializeOutputJson(output)));
});

test("course evidence is normalized from the requirement panels in Form JSON", () => {
  const requirement = getRequirements(formDefinition).find(
    (candidate) => candidate.topics.length > 0,
  );
  const selectedTopic = getChoiceValue(requirement.topics[0]);
  const explanation =
    "The official description uses a different term for this topic.";
  const evidenceData = {
    ...fixture,
    [requirement.evidenceQuestionName]: [
      {
        course_ref: fixture.relevant_courses[0].course_ref,
        topics_covered: [selectedTopic],
        additional_explanation: explanation,
      },
    ],
  };

  const output = buildOutput({
    surveyData: evidenceData,
    formDefinition,
    formVersion: "2025-2026",
    generatedAt,
  });
  const normalizedRequirement = output.prerequisiteCoverage.find(
    (candidate) =>
      candidate.requirementReference === requirement.requirementReference,
  );

  assert.deepEqual(normalizedRequirement.courseEvidence, [
    {
      courseReference: "degree-1::MATH101",
      topicsCovered: [selectedTopic],
      additionalExplanation: explanation,
    },
  ]);
});

test("study references are generated from the degree order", () => {
  const twoDegreeData = {
    ...fixture,
    previous_studies: [
      fixture.previous_studies[0],
      {
        ...fixture.previous_studies[0],
        degree_programme_name: "Master of Data Science",
      },
    ],
  };

  const output = buildOutput({
    surveyData: twoDegreeData,
    formDefinition,
    formVersion: "2025-2026",
    generatedAt,
  });

  assert.deepEqual(
    output.previousStudies.map((study) => study.studyReference),
    ["degree-1", "degree-2"],
  );
});

test("output generation rejects courses without a final grade", () => {
  const missingGradeData = {
    ...fixture,
    relevant_courses: [
      {
        ...fixture.relevant_courses[0],
        final_grade: "",
      },
    ],
  };

  assert.throws(
    () =>
      buildOutput({
        surveyData: missingGradeData,
        formDefinition,
        formVersion: "2025-2026",
        generatedAt,
      }),
    /\/courses\/0\/finalGrade.*fewer than 1 character/i,
  );
});

test("removed URL and completion fields cannot invalidate Output JSON", () => {
  const dataWithStaleAnswers = {
    ...fixture,
    relevant_courses: [
      {
        ...fixture.relevant_courses[0],
        completion_status: "completed",
        official_course_url: "not a valid URI",
      },
    ],
  };

  const output = buildOutput({
    surveyData: dataWithStaleAnswers,
    formDefinition,
    formVersion: "2025-2026",
    generatedAt,
  });

  assert.equal(Object.hasOwn(output.courses[0], "completionStatus"), false);
  assert.equal(Object.hasOwn(output.courses[0], "officialUrl"), false);
});

test("course references must be unique across the catalogue", () => {
  const duplicateCourseData = {
    ...fixture,
    relevant_courses: [
      fixture.relevant_courses[0],
      {
        ...fixture.relevant_courses[0],
        course_title: "A duplicate catalogue entry",
      },
    ],
  };

  assert.throws(
    () =>
      buildOutput({
        surveyData: duplicateCourseData,
        formDefinition,
        formVersion: "2025-2026",
        generatedAt,
      }),
    /course reference .* is used more than once/i,
  );
});

test("prerequisite evidence must refer to a course in the catalogue", () => {
  const requirement = getRequirements(formDefinition).find(
    (candidate) => candidate.topics.length > 0,
  );
  const unknownCourseData = {
    ...fixture,
    [requirement.evidenceQuestionName]: [
      {
        course_ref: "degree-1::UNKNOWN",
        topics_covered: [getChoiceValue(requirement.topics[0])],
      },
    ],
  };

  assert.throws(
    () =>
      buildOutput({
        surveyData: unknownCourseData,
        formDefinition,
        formVersion: "2025-2026",
        generatedAt,
      }),
    /refers to an unknown course "degree-1::UNKNOWN"/,
  );
});

test("invalid Unicode code units are replaced and reported", () => {
  const invalidCodeUnit = String.fromCharCode(0xd800);
  const unicodeData = {
    ...fixture,
    personal_info: {
      ...fixture.personal_info,
      name: `Ada ${invalidCodeUnit} Example`,
    },
  };

  const output = buildOutput({
    surveyData: unicodeData,
    formDefinition,
    formVersion: "2025-2026",
    generatedAt,
  });

  assert.equal(output.applicant.fullName, "Ada � Example");
  assert.equal(output.generationWarnings.length, 1);
  assert.equal(output.generationWarnings[0].path, "applicant.fullName");
});

function getRequirements(definition) {
  return definition.pages.flatMap((page) =>
    page.elements
      .filter(
        (element) =>
          element.type === "panel" && element.name.startsWith("requirement_"),
      )
      .map((panel) => {
        const evidenceQuestion = panel.elements.find(
          (element) => element.type === "paneldynamic",
        );
        const topicsQuestion = evidenceQuestion.templateElements.find(
          (element) => element.name === "topics_covered",
        );

        return {
          requirementReference: panel.name.slice("requirement_".length),
          title: panel.title,
          evidenceQuestionName: evidenceQuestion.name,
          topics: topicsQuestion?.choices ?? [],
        };
      }),
  );
}

function getChoiceValue(choice) {
  return typeof choice === "object" ? choice.value : choice;
}
