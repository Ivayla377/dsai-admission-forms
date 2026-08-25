import assert from "node:assert/strict";
import test from "node:test";

import { Model } from "survey-core";

import formDefinition from "../forms/2025-2026.json" with { type: "json" };
import { addPrerequisiteKnowledgeContent } from "../src/prerequisite-content.js";
import { addPrerequisiteCourseUsageValidation } from "../src/prerequisite-validation.js";
import fixture from "./fixtures/synthetic-application.json" with { type: "json" };

test("the 2025-2026 form loads and round-trips through SurveyJS", () => {
  const survey = new Model();
  survey.fromJSON(structuredClone(formDefinition), {
    validatePropertyValues: true,
  });

  assert.deepEqual(
    (survey.jsonErrors ?? []).map((error) => error.message),
    [],
  );
  assert.equal(survey.pages.length, 5);
  assert.deepEqual(
    survey.pages.map((page) => page.name),
    [
      "applicant_details",
      "previous_studies_page",
      "relevant_courses_page",
      "prerequisite_coverage_page",
      "application_report",
    ],
  );

  const reportPage = survey.getPageByName("application_report");
  assert.equal(reportPage.title, "Report");
  assert.equal(reportPage.navigationTitle, "Report");
  assert.equal(reportPage.elements.length, 0);

  const serialized = survey.toJSON();
  const roundTripped = new Model(serialized).toJSON();
  assert.deepEqual(roundTripped, serialized);
});

test("the form presents the approved title and introduction", () => {
  assert.equal(formDefinition.title, "Additional Admissions Form");
  assert.equal(formDefinition.showTitle, false);
  assert.equal(formDefinition.completeText, "Create report");
  assert.equal(formDefinition.showCompletePage, false);
  assert.equal(formDefinition.showQuestionNumbers, "on");
  assert.equal(formDefinition.showProgressBar, "top");
  assert.equal(formDefinition.progressBarType, "pages");
  assert.equal(
    Object.hasOwn(formDefinition, "showPreviewBeforeComplete"),
    false,
  );
  assert.equal(Object.hasOwn(formDefinition, "previewMode"), false);
  assert.equal(Object.hasOwn(formDefinition, "completedHtml"), false);
  const firstPage = formDefinition.pages[0];
  assert.equal(firstPage.title, "About this form");
  assert.equal(Object.hasOwn(firstPage, "description"), false);

  const instructions = firstPage.elements[0];
  assert.equal(instructions.type, "html");
  assert.equal(instructions.name, "form_instructions");
  assert.equal(instructions.showNumber, false);
  assert.match(
    instructions.html,
    /This additional form helps the admissions committee determine how your previous studies meet the specific admission requirements for MSc Data Science and Artificial Intelligence\./,
  );
  assert.match(instructions.html, /Complete all sections in English/i);
  assert.match(instructions.html, /official academic documents/i);
  assert.match(instructions.html, /official English translation/i);
  assert.match(instructions.html, /upload this PDF to OSIRIS/i);
  assert.deepEqual(
    [
      "Applicant details",
      "Previous studies",
      "Admission requirements",
      "Relevant courses",
      "Prerequisite coverage",
    ].map((section) => instructions.html.includes(`<strong>${section}</strong>`)),
    [true, true, true, true, true],
  );
});

test("admission requirements are collapsible above the relevant courses", () => {
  const survey = createSurvey();
  addPrerequisiteKnowledgeContent(survey);

  const relevantCoursesPage = survey.getPageByName("relevant_courses_page");
  const reference = relevantCoursesPage.elements.find(
    (element) => element.name === "admission_requirements_reference",
  );
  const overview = survey.getQuestionByName("admission_requirements_overview");
  const requirements = getRequirementPanels(survey);

  assert.equal(reference.getType(), "panel");
  assert.equal(reference.title, "Admission requirements");
  assert.equal(reference.showNumber, false);
  assert.equal(reference.state, "expanded");
  assert.match(reference.description, /before adding your relevant courses/i);
  assert.equal(relevantCoursesPage.elements[0], reference);
  assert.equal(relevantCoursesPage.elements[1].name, "relevant_courses");
  assert.equal(overview.getType(), "html");
  assert.equal(overview.parent, reference);
  assert.doesNotMatch(overview.html, /Use this overview/i);

  for (const requirement of requirements) {
    assert.match(overview.html, new RegExp(escapeRegex(requirement.title)));

    const evidence = requirement.elements.find(
      (element) => element.getType() === "paneldynamic",
    );
    const topics = evidence.templateElements.find(
      (element) => element.getValueName() === "topics_covered",
    );
    for (const topic of topics.choices) {
      assert.ok(overview.html.includes(topic.text || String(topic.value)));
    }
  }
});

test("previous studies is a required Dynamic Panel limited to two degrees", () => {
  const survey = createSurvey();
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
    "full_time_equivalent_duration_years",
    "credit_system",
    "total_degree_credits",
    "credit_system_other",
    "grading_system",
    "grading_system_information",
    "best_grade",
    "minimum_passing_grade",
  ]);
  const applicantQuestions = previousStudies.templateElements.filter(
    (question) => question.getType() !== "expression",
  );
  const questionsByName = new Map(
    applicantQuestions.map((question) => [question.name, question]),
  );
  const graduationDate = questionsByName.get("graduation_date");
  const duration = questionsByName.get(
    "full_time_equivalent_duration_years",
  );
  const creditSystem = questionsByName.get("credit_system");
  const totalCredits = questionsByName.get("total_degree_credits");
  const gradingSystem = questionsByName.get("grading_system");
  const bestGrade = questionsByName.get("best_grade");
  const minimumPassingGrade = questionsByName.get("minimum_passing_grade");

  assert.equal(questionsByName.get("degree_programme_name").width, "100%");
  assert.equal(questionsByName.get("university_name").width, "100%");
  assert.equal(questionsByName.get("city").startWithNewLine, false);
  assert.equal(duration.startWithNewLine, false);
  assert.equal(totalCredits.startWithNewLine, false);
  assert.equal(minimumPassingGrade.startWithNewLine, false);
  assert.equal(graduationDate.inputType, "text");
  assert.equal(graduationDate.maskType, "datetime");
  assert.equal(graduationDate.maskSettings.pattern, "dd/mm/yyyy");
  assert.equal(
    graduationDate.maskSettings.getMaskedValue("2026-07-07"),
    "07/07/2026",
  );
  assert.equal(
    graduationDate.maskSettings.getUnmaskedValue("07/07/2026"),
    "2026-07-07",
  );
  assert.equal(duration.maskType, "numeric");
  assert.equal(duration.inputTextAlignment, "left");
  assert.equal(duration.maskSettings.min, 0.1);
  assert.equal(duration.maskSettings.max, 20);
  assert.equal(duration.maskSettings.precision, 1);
  assert.equal(
    duration.description,
    "Enter the normal full-time duration in years.",
  );
  assert.equal(totalCredits.maskType, "numeric");
  assert.equal(totalCredits.inputTextAlignment, "left");
  assert.equal(totalCredits.maskSettings.min, 1);
  assert.equal(totalCredits.maskSettings.max, 10000);
  assert.equal(totalCredits.maskSettings.precision, 1);
  assert.equal(
    totalCredits.description,
    "Enter the total degree credits in the selected system.",
  );
  assert.deepEqual(
    creditSystem.choices.map((choice) => choice.value),
    [
      "ects",
      "us_semester_credits",
      "us_quarter_credits",
      "uk_cats",
      "other",
    ],
  );
  assert.deepEqual(
    gradingSystem.choices.map((choice) => choice.value),
    [
      "numeric_higher_better",
      "numeric_lower_better",
      "letter_grades",
      "pass_fail",
      "other",
    ],
  );
  assert.match(bestGrade.description, /best possible grade/i);
  assert.match(minimumPassingGrade.description, /required to pass/i);
  assert.equal(bestGrade.width, "50%");
  assert.equal(minimumPassingGrade.width, "50%");

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
      ["graduation_date", "full_time_equivalent_duration_years"],
      ["credit_system", "total_degree_credits"],
      ["grading_system"],
    ],
  );
  assert.equal(
    previousStudies.templateTitle,
    "Degree {panelIndex}{panel.degree_heading_suffix}",
  );
  assert.equal(previousStudies.templateDescription, "{panel.university_name}");
  assert.equal(previousStudies.panelsState, "firstExpanded");

  const degreeReference = previousStudies.templateElements.find(
    (question) => question.name === "degree_ref",
  );
  assert.equal(degreeReference.getType(), "expression");
  assert.equal(degreeReference.visible, false);
  assert.equal(degreeReference.clearIfInvisible, "none");
  assert.equal(degreeReference.expression, "'degree-' + ({panelIndex} + 1)");
});

test("degree credit and grading details use declarative conditional fields", () => {
  const survey = createSurvey();
  const degree = survey.getQuestionByName("previous_studies").panels[0];
  const creditSystem = degree.getQuestionByName("credit_system");
  const otherCreditSystem = degree.getQuestionByName("credit_system_other");
  const gradingSystem = degree.getQuestionByName("grading_system");
  const gradingInformation = degree.getQuestionByName(
    "grading_system_information",
  );
  const bestGrade = degree.getQuestionByName("best_grade");
  const minimumPassingGrade = degree.getQuestionByName(
    "minimum_passing_grade",
  );

  assert.equal(otherCreditSystem.isVisible, false);
  creditSystem.value = "other";
  assert.equal(otherCreditSystem.isVisible, true);
  assert.equal(otherCreditSystem.isRequired, true);

  gradingSystem.value = "letter_grades";
  assert.equal(gradingInformation.isVisible, true);
  assert.equal(gradingInformation.isRequired, true);
  assert.equal(bestGrade.isVisible, true);
  assert.equal(bestGrade.isRequired, true);
  assert.equal(minimumPassingGrade.isVisible, true);
  assert.equal(minimumPassingGrade.isRequired, true);

  otherCreditSystem.value = "Local credits";
  gradingInformation.value = "A through F, in descending order.";
  bestGrade.value = "A";
  minimumPassingGrade.value = "D";
  creditSystem.value = "ects";
  gradingSystem.value = "pass_fail";

  assert.equal(otherCreditSystem.isVisible, false);
  assert.equal(gradingInformation.isVisible, false);
  assert.equal(bestGrade.isVisible, false);
  assert.equal(minimumPassingGrade.isVisible, false);
  assert.equal(
    Object.hasOwn(survey.data.previous_studies[0], "credit_system_other"),
    false,
  );
  assert.equal(
    Object.hasOwn(
      survey.data.previous_studies[0],
      "grading_system_information",
    ),
    false,
  );
  assert.equal(
    Object.hasOwn(survey.data.previous_studies[0], "best_grade"),
    false,
  );
  assert.equal(
    Object.hasOwn(survey.data.previous_studies[0], "minimum_passing_grade"),
    false,
  );
});

test("relevant courses is a Dynamic Panel with copied degree choices", () => {
  const survey = createSurvey();
  const relevantCourses = survey.getQuestionByName("relevant_courses");

  assert.equal(relevantCourses.getType(), "paneldynamic");
  assert.match(relevantCourses.page.description, /every passed course/i);
  assert.equal(relevantCourses.minPanelCount, 1);
  assert.equal(relevantCourses.maxPanelCount, 30);
  assert.equal(relevantCourses.panelsState, "firstExpanded");
  assert.equal(relevantCourses.confirmDelete, true);
  assert.equal(relevantCourses.addPanelText, "Add another course");
  assert.equal(relevantCourses.keyName, "course_ref");

  const applicantQuestions = relevantCourses.templateElements.filter(
    (question) => question.getType() !== "expression",
  );
  assert.deepEqual(
    applicantQuestions.map((question) => question.name),
    [
      "relevant_course_degree_ref",
      "course_title",
      "course_code",
      "final_grade",
      "course_credits",
      "official_course_description",
    ],
  );

  const degree = applicantQuestions[0];
  assert.equal(degree.getValueName(), "degree_ref");
  assert.equal(degree.choicesFromQuestion, "previous_studies");
  assert.equal(degree.choiceValuesFromQuestion, "degree_ref");
  assert.equal(degree.choiceTextsFromQuestion, "degree_label");

  const courseTitle = applicantQuestions.find(
    (question) => question.name === "course_title",
  );
  const courseCode = applicantQuestions.find(
    (question) => question.name === "course_code",
  );
  assert.equal(
    courseTitle.description,
    "Enter the course title only; do not include the course code.",
  );
  assert.equal(courseCode.description, "Enter the course code only.");
  assert.equal(courseTitle.width, "65%");
  assert.equal(courseCode.width, "30%");
  assert.equal(courseCode.startWithNewLine, false);

  const finalGrade = applicantQuestions.find(
    (question) => question.name === "final_grade",
  );
  const courseCredits = applicantQuestions.find(
    (question) => question.name === "course_credits",
  );
  assert.equal(finalGrade.isRequired, true);
  assert.equal(finalGrade.requiredIf, undefined);
  assert.match(finalGrade.description, /do not convert it/i);
  assert.equal(finalGrade.width, "50%");
  assert.equal(courseCredits.width, "45%");
  assert.equal(courseCredits.startWithNewLine, false);
  assert.equal(courseCredits.inputType, "text");
  assert.equal(courseCredits.maskType, "numeric");
  assert.equal(courseCredits.inputTextAlignment, "left");
  assert.equal(courseCredits.maskSettings.min, 0.1);
  assert.equal(courseCredits.maskSettings.max, 10000);
  assert.equal(courseCredits.maskSettings.precision, 1);
  assert.match(courseCredits.description, /credit system selected for the degree/i);

  assert.deepEqual(
    relevantCourses.panels[0].rows
      .map((row) =>
        row.elements
          .filter((question) => question.isVisible)
          .map((question) => question.name),
      )
      .filter((row) => row.length > 0),
    [
      ["relevant_course_degree_ref"],
      ["course_title", "course_code"],
      ["final_grade", "course_credits"],
      ["official_course_description"],
    ],
  );

  const officialDescription = applicantQuestions.find(
    (question) => question.name === "official_course_description",
  );
  assert.equal(officialDescription.getType(), "comment");
  assert.equal(officialDescription.autoGrow, true);
  assert.match(officialDescription.description, /include the link/i);

  const courseReference = relevantCourses.templateElements.find(
    (question) => question.name === "course_ref",
  );
  const courseLabel = relevantCourses.templateElements.find(
    (question) => question.name === "course_label",
  );
  assert.equal(
    courseReference.expression,
    "{panel.degree_ref} + '::' + {panel.course_code}",
  );
  assert.equal(
    courseLabel.expression,
    "{panel.course_code} + ' ' + {panel.course_title}",
  );
});

test("requirement panels contain only declarative course evidence logic", () => {
  const survey = createSurvey();
  const requirementPanels = getRequirementPanels(survey);

  assert.ok(requirementPanels.length > 0);
  assert.deepEqual(
    requirementPanels.map((requirement) => requirement.no),
    ["1.", "2.", "3.", "4.", "5.", "6.", "7.", "8.", "9.", "10."],
  );

  for (const requirement of requirementPanels) {
    assert.equal(requirement.showNumber, true);
    assert.equal(requirement.description, "");
    const evidence = requirement.elements.find(
      (element) => element.getType() === "paneldynamic",
    );
    assert.ok(evidence, `${requirement.name} should contain an evidence panel`);
    assert.equal(evidence.panelCount, 0);
    assert.equal(evidence.minPanelCount, 0);
    assert.equal(evidence.maxPanelCount, 3);
    assert.equal(
      evidence.noEntriesText,
      "Click the button below to add an entry.",
    );
    assert.equal(evidence.panelsState, "firstExpanded");
    assert.equal(evidence.confirmDelete, true);
    assert.equal(evidence.addPanelText, "Add a relevant course");
    assert.equal(evidence.keyName, "course_ref");

    const course = evidence.templateElements.find(
      (question) => question.getValueName() === "course_ref",
    );
    assert.match(course.name, /_course_ref$/);
    assert.equal(course.choicesFromQuestion, "relevant_courses");
    assert.equal(course.choiceValuesFromQuestion, "course_ref");
    assert.equal(course.choiceTextsFromQuestion, "course_label");

    const topics = evidence.templateElements.find(
      (question) => question.getValueName() === "topics_covered",
    );
    assert.match(topics.name, /_topics_covered$/);
    assert.ok(topics, `${requirement.name} should define prerequisite topics`);
    assert.equal(topics.visibleIf, "{panel.course_ref} notempty");
    assert.equal(topics.isRequired, true);
    assert.ok(topics.choices.length > 0);

    const explanation = evidence.templateElements.find(
      (question) =>
        question.getValueName() === "additional_explanation",
    );
    assert.match(explanation.name, /_additional_explanation$/);
    assert.equal(explanation.visibleIf, "{panel.course_ref} notempty");
    assert.equal(explanation.autoGrow, true);
  }
});

test("all requirements share one prerequisite coverage page", () => {
  const survey = createSurvey();
  const coveragePage = survey.getPageByName("prerequisite_coverage_page");

  assert.ok(coveragePage);
  assert.equal(coveragePage.title, "Prerequisite coverage");
  assert.ok(
    coveragePage.description.includes("If you have no relevant course"),
  );
  assert.equal(
    coveragePage.elements.filter((element) =>
      element.name.startsWith("requirement_"),
    ).length,
    10,
  );
});

test("degree and course dropdowns copy calculated values from earlier pages", () => {
  const survey = createSurvey();
  const previousStudy = survey.getQuestionByName("previous_studies").panels[0];
  previousStudy.getQuestionByName("degree_programme_name").value =
    "Computer Science";
  previousStudy.getQuestionByName("university_name").value =
    "Example University";

  const relevantCourse = survey.getQuestionByName("relevant_courses").panels[0];
  const degree = relevantCourse.getQuestionByValueName("degree_ref");
  assert.deepEqual(
    degree.visibleChoices.map((choice) => ({
      value: choice.value,
      text: choice.text,
    })),
    [
      {
        value: "degree-1",
        text: "Degree 1: Computer Science (Example University)",
      },
    ],
  );

  degree.value = "degree-1";
  relevantCourse.getQuestionByName("course_code").value = "COURSE101";
  relevantCourse.getQuestionByName("course_title").value = "Example Course";

  const evidence = getRequirementPanels(survey)
    .map((requirement) =>
      requirement.elements.find(
        (element) => element.getType() === "paneldynamic",
      ),
    )
    .find((question) =>
      question.templateElements.some(
        (element) => element.getValueName() === "topics_covered",
      ),
    );
  evidence.addPanel();
  const evidencePanel = evidence.panels[0];
  const course = evidencePanel.getQuestionByValueName("course_ref");
  const topics = evidencePanel.getQuestionByValueName("topics_covered");

  assert.deepEqual(
    course.visibleChoices.map((choice) => ({
      value: choice.value,
      text: choice.text,
    })),
    [{ value: "degree-1::COURSE101", text: "COURSE101 Example Course" }],
  );
  assert.equal(topics.isVisible, false);

  course.value = "degree-1::COURSE101";
  assert.equal(topics.isVisible, true);
});

test("unique Creator names preserve the existing answer-data field names", () => {
  const survey = createSurvey();
  const relevantCourse = survey.getQuestionByName("relevant_courses").panels[0];
  relevantCourse.getQuestionByName("relevant_course_degree_ref").value =
    "degree-1";
  relevantCourse.getQuestionByName("course_code").value = "COURSE101";
  relevantCourse.getQuestionByName("course_title").value = "Example Course";

  const evidence = survey.getQuestionByName("evidence_linear_algebra");
  evidence.addPanel();
  const evidencePanel = evidence.panels[0];
  evidencePanel.getQuestionByValueName("course_ref").value =
    "degree-1::COURSE101";
  evidencePanel.getQuestionByValueName("topics_covered").value = [
    "Calculate with matrices and vectors",
  ];
  evidencePanel.getQuestionByValueName("additional_explanation").value =
    "Equivalent terminology is used.";

  assert.equal(survey.data.relevant_courses[0].degree_ref, "degree-1");
  assert.equal(
    Object.hasOwn(
      survey.data.relevant_courses[0],
      "relevant_course_degree_ref",
    ),
    false,
  );
  assert.deepEqual(survey.data.evidence_linear_algebra[0], {
    course_ref: "degree-1::COURSE101",
    topics_covered: ["Calculate with matrices and vectors"],
    additional_explanation: "Equivalent terminology is used.",
  });
});

test("a course can support at most three prerequisites", () => {
  const survey = createSurvey();
  addPrerequisiteCourseUsageValidation(survey);
  survey.data = {
    relevant_courses: [
      { course_ref: "degree-1::COURSE-X", course_label: "COURSE-X Course X" },
      { course_ref: "degree-1::COURSE-Y", course_label: "COURSE-Y Course Y" },
    ],
  };

  const courseQuestions = getRequirementPanels(survey)
    .slice(0, 4)
    .map((requirement) => {
      const evidence = requirement.elements.find(
        (element) => element.getType() === "paneldynamic",
      );
      evidence.addPanel();
      return evidence.panels[0].getQuestionByValueName("course_ref");
    });

  for (const question of courseQuestions) {
    question.value = "degree-1::COURSE-X";
    question.validate(true);
  }

  assert.ok(
    courseQuestions.slice(0, 3).every((question) => question.errors.length === 0),
  );
  assert.deepEqual(
    courseQuestions[3].errors.map((error) => error.text),
    ["A course can be used for at most three prerequisites."],
  );

  courseQuestions[0].value = "degree-1::COURSE-Y";

  assert.equal(courseQuestions[3].errors.length, 0);
});

test("personal information matches the shared TU/e form structure", () => {
  const survey = createSurvey();
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
  assert.equal(studentId.maskType, "none");
  assert.equal(studentId.maxLength, 7);
  assert.equal(studentId.getMaxLength(), 7);
  assert.equal(studentId.validators.length, 1);
  assert.equal(studentId.validators[0].regex, "\\d{7}");
});

test("masked fields do not combine mask placeholders with native maxLength", () => {
  const survey = createSurvey();
  const previousStudies = survey.getQuestionByName("previous_studies");
  const relevantCourses = survey.getQuestionByName("relevant_courses");
  const maskedFields = [
    previousStudies.templateElements.find(
      (question) => question.name === "graduation_date",
    ),
    previousStudies.templateElements.find(
      (question) =>
        question.name === "full_time_equivalent_duration_years",
    ),
    previousStudies.templateElements.find(
      (question) => question.name === "total_degree_credits",
    ),
    relevantCourses.templateElements.find(
      (question) => question.name === "course_credits",
    ),
  ];

  assert.deepEqual(
    maskedFields.map((field) => [field.name, field.maskType]),
    [
      ["graduation_date", "datetime"],
      ["full_time_equivalent_duration_years", "numeric"],
      ["total_degree_credits", "numeric"],
      ["course_credits", "numeric"],
    ],
  );
  assert.ok(maskedFields.every((field) => field.getMaxLength() === null));
});

test("degree panels use entered values in collapsible headings", () => {
  const emptySurvey = createSurvey();
  const emptyDegree = emptySurvey.getQuestionByName("previous_studies").panels[0];

  assert.equal(
    emptyDegree.getProcessedText(emptyDegree.title),
    "Degree 1",
  );

  const survey = createSurvey();
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

test("all SurveyJS element names are unique for Survey Creator", () => {
  const names = collectElementNames(formDefinition.pages);
  const duplicateNames = [...names.entries()]
    .filter(([, paths]) => paths.length > 1)
    .map(([name]) => name);

  assert.deepEqual(duplicateNames, []);
});

function getRequirementPanels(survey) {
  return survey.pages.flatMap((page) =>
    page.elements.filter(
      (element) =>
        element.getType() === "panel" &&
        element.name.startsWith("requirement_"),
    ),
  );
}

function createSurvey() {
  return new Model(structuredClone(formDefinition));
}

function collectElementNames(elements, parentPath = "") {
  const names = new Map();

  function visit(items, path) {
    for (const element of items ?? []) {
      const elementPath = `${path}/${element.name || element.type}`;
      if (element.name) {
        const paths = names.get(element.name) ?? [];
        paths.push(elementPath);
        names.set(element.name, paths);
      }
      visit(element.elements, elementPath);
      visit(element.templateElements, `${elementPath}[]`);
    }
  }

  visit(elements, parentPath);
  return names;
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
