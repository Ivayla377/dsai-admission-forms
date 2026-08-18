import assert from "node:assert/strict";
import test from "node:test";

import fixture from "./fixtures/synthetic-application.json" with { type: "json" };
import {
  buildOutput,
  serializeOutputJson,
} from "../src/output.js";

const generatedAt = "2026-08-18T10:00:00.000Z";

test("SurveyJS data is normalized into the versioned Output JSON", () => {
  const output = buildOutput({
    surveyData: fixture,
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
  assert.deepEqual(output.generationWarnings, []);
  assert.doesNotThrow(() => JSON.parse(serializeOutputJson(output)));
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
    formVersion: "2025-2026",
    generatedAt,
  });

  assert.deepEqual(
    output.previousStudies.map((study) => study.studyReference),
    ["degree-1", "degree-2"],
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
    formVersion: "2025-2026",
    generatedAt,
  });

  assert.equal(output.applicant.fullName, "Ada � Example");
  assert.equal(output.generationWarnings.length, 1);
  assert.equal(output.generationWarnings[0].path, "applicant.fullName");
});
