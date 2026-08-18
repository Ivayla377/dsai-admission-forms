import assert from "node:assert/strict";
import test from "node:test";

import { Model } from "survey-core";

import formDefinition from "../forms/2025-2026.json" with { type: "json" };

test("the 2025-2026 form loads and round-trips through SurveyJS", () => {
  const survey = new Model();
  survey.fromJSON(formDefinition, { validatePropertyValues: true });

  assert.deepEqual(
    (survey.jsonErrors ?? []).map((error) => error.message),
    [],
  );
  assert.equal(survey.pages.length, 2);
  assert.deepEqual(
    survey.pages.map((page) => page.name),
    ["applicant_details", "previous_studies_page"],
  );

  const serialized = survey.toJSON();
  const roundTripped = new Model(serialized).toJSON();
  assert.deepEqual(roundTripped, serialized);
});

test("the form presents the approved title and introduction", () => {
  assert.equal(formDefinition.title, "Additional Admissions Form");
  assert.equal(formDefinition.showTitle, false);
  assert.equal(formDefinition.completeText, "Create report");
  assert.equal(formDefinition.showCompletePage, false);
  assert.equal(Object.hasOwn(formDefinition, "completedHtml"), false);
  assert.equal(
    formDefinition.pages[0].description,
    "This form will help you create an additional documentation for your DSAI application documentation. You need to fill in the form, use it to generate a PDF, and upload this PDF in Osiris.",
  );
});

test("previous studies is a required Dynamic Panel limited to two degrees", () => {
  const survey = new Model(formDefinition);
  const previousStudies = survey.getQuestionByName("previous_studies");

  assert.ok(previousStudies);
  assert.equal(previousStudies.getType(), "paneldynamic");
  assert.equal(previousStudies.isRequired, true);
  assert.equal(previousStudies.minPanelCount, 1);
  assert.equal(previousStudies.maxPanelCount, 2);

  const applicantQuestionNames = previousStudies.templateElements
    .filter((question) => question.getType() !== "expression")
    .map((question) => question.name);
  assert.deepEqual(applicantQuestionNames, [
    "degree_programme_name",
    "university_name",
    "country",
    "city",
    "graduation_date",
    "total_degree_credits",
  ]);
  const applicantQuestions = previousStudies.templateElements.filter(
    (question) => question.getType() !== "expression",
  );
  assert.equal(applicantQuestions[0].width, "100%");
  assert.equal(applicantQuestions[1].width, "100%");
  assert.deepEqual(
    applicantQuestions.slice(2).map((question) => question.width),
    ["50%", "50%", "50%", "50%"],
  );
  assert.equal(applicantQuestions[3].startWithNewLine, false);
  assert.equal(applicantQuestions[5].startWithNewLine, false);
  assert.equal(applicantQuestions[5].inputType, "number");

  const degreePanel = previousStudies.panels[0];
  assert.deepEqual(
    degreePanel.rows
      .map((row) =>
        row.elements
          .filter((question) => question.isVisible)
          .map((question) => question.name),
      )
      .filter((row) => row.length > 0),
    [
      ["degree_programme_name"],
      ["university_name"],
      ["country", "city"],
      ["graduation_date", "total_degree_credits"],
    ],
  );
  assert.equal(
    previousStudies.templateTitle,
    "Degree {panelIndex}{panel.degree_heading_suffix}",
  );
  assert.equal(previousStudies.templateDescription, "{panel.university_name}");
  assert.equal(previousStudies.panelsState, "firstExpanded");
});

test("personal information matches the shared TU/e form structure", () => {
  const survey = new Model(formDefinition);
  const personalInformation = survey.getQuestionByName("personal_info");

  assert.ok(personalInformation);
  assert.equal(personalInformation.getType(), "multipletext");
  assert.equal(personalInformation.isRequired, true);
  assert.equal(
    personalInformation.description,
    "Enter the details exactly as they appear in your application.",
  );
  assert.deepEqual(
    personalInformation.items.map((item) => item.name),
    ["name", "id"],
  );

  const [name, studentId] = personalInformation.items;
  assert.equal(name.title, "Name");
  assert.equal(name.placeholder, "Surname, Given name(s)");
  assert.equal(studentId.title, "Student ID");
  assert.equal(studentId.maskSettings.pattern, "9999999");
  assert.equal(studentId.maxLength, 7);
});

test("degree panels use entered values in collapsible headings", () => {
  const emptySurvey = new Model(formDefinition);
  const emptyDegree = emptySurvey.getQuestionByName("previous_studies").panels[0];

  assert.equal(
    emptyDegree.getProcessedText(emptyDegree.title),
    "Degree 1",
  );

  const survey = new Model(formDefinition);
  survey.data = {
    previous_studies: [
      {
        degree_programme_name: "Bachelor of Computer Science",
        university_name: "Sofia University",
      },
      {
        degree_programme_name: "Master of Data Science",
        university_name: "Example University",
      },
    ],
  };
  const previousStudies = survey.getQuestionByName("previous_studies");

  assert.equal(
    previousStudies.panels[0].locTitle.renderedHtml,
    "Degree 1: Bachelor of Computer Science",
  );
  assert.equal(
    previousStudies.panels[1].locTitle.renderedHtml,
    "Degree 2: Master of Data Science",
  );
  assert.equal(
    previousStudies.panels[0].locDescription.renderedHtml,
    "Sofia University",
  );
  assert.equal(previousStudies.panels[0].state, "expanded");
  assert.equal(previousStudies.panels[1].state, "collapsed");
});

test("the Form JSON contains no parallel custom requirements structure", () => {
  assert.equal(Object.hasOwn(formDefinition, "requirements"), false);
});
