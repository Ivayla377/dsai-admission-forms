import { getQuestionValueName } from "./surveyjs-question-utils.js";

export const MAX_PREREQUISITE_USES_PER_COURSE = 3;

const COURSE_USAGE_ERROR =
  "A course can be used for at most three prerequisites.";

// SurveyJS shares the source items used by choicesFromQuestion between dynamic
// panel templates. Apply availability to each row's copied visible choices so
// disabling an item in one row cannot affect the same item in another row.
export function addPrerequisiteSubjectCourseChoiceAvailability(survey) {
  survey.onDynamicPanelItemValueChanged.add((sender, options) => {
    const changedQuestion = options.panel?.getQuestionByName(options.name);
    if (
      getQuestionValueName(changedQuestion) === "course_ref" &&
      isPrerequisiteEvidenceQuestion(options.question)
    ) {
      refreshEvidenceCourseChoices(options.question);
    } else {
      refreshAllEvidenceCourseChoices(sender);
    }
  });

  survey.onDynamicPanelAdded.add((sender, options) => {
    refreshAffectedEvidenceCourseChoices(sender, options.question);
  });

  survey.onDynamicPanelRemoved.add((sender, options) => {
    refreshAffectedEvidenceCourseChoices(sender, options.question);
  });

  refreshAllEvidenceCourseChoices(survey);
}

export function addPrerequisiteCourseUsageValidation(survey) {
  survey.onValidateQuestion.add((sender, options) => {
    if (!isPrerequisiteCourseQuestion(options.question) || !options.value) {
      return;
    }

    const matchingQuestions = getPrerequisiteCourseQuestions(sender).filter(
      (question) => question.value === options.value,
    );
    const usageIndex = matchingQuestions.indexOf(options.question);

    if (usageIndex >= MAX_PREREQUISITE_USES_PER_COURSE) {
      options.error = COURSE_USAGE_ERROR;
    }
  });

  survey.onDynamicPanelItemValueChanged.add((sender, options) => {
    const changedQuestion = options.panel?.getQuestionByName(options.name);
    if (
      getQuestionValueName(changedQuestion) === "course_ref" &&
      isPrerequisiteEvidenceQuestion(options.question)
    ) {
      revalidateSelectedPrerequisiteCourses(sender);
    }
  });

  survey.onDynamicPanelRemoved.add((sender) => {
    revalidateSelectedPrerequisiteCourses(sender);
  });
}

function revalidateSelectedPrerequisiteCourses(survey) {
  for (const question of getPrerequisiteCourseQuestions(survey)) {
    if (!question.isEmpty()) {
      question.validate(true, false, true);
    }
  }
}

function refreshEvidenceCourseChoices(evidenceQuestion) {
  if (!isPrerequisiteEvidenceQuestion(evidenceQuestion)) {
    return;
  }

  const courseQuestions = evidenceQuestion.panels
    .map((panel) => panel.getQuestionByValueName("course_ref"))
    .filter(Boolean);

  for (const question of courseQuestions) {
    question.surveyChoiceItemVisibilityChange();

    for (const choice of question.visibleChoices) {
      const selectedInAnotherRow = courseQuestions.some(
        (sibling) =>
          sibling !== question && sibling.value === choice.value,
      );

      // Keep every course listed for context, but prevent selecting a course
      // already used by another row for this subject. A row's current selection
      // remains enabled.
      choice.setIsEnabled(
        !selectedInAnotherRow || question.value === choice.value,
      );
    }
  }
}

function refreshAffectedEvidenceCourseChoices(survey, question) {
  if (isPrerequisiteEvidenceQuestion(question)) {
    refreshEvidenceCourseChoices(question);
  } else {
    refreshAllEvidenceCourseChoices(survey);
  }
}

function refreshAllEvidenceCourseChoices(survey) {
  for (const evidenceQuestion of getPrerequisiteEvidenceQuestions(survey)) {
    refreshEvidenceCourseChoices(evidenceQuestion);
  }
}

function getPrerequisiteCourseQuestions(survey) {
  return getPrerequisiteEvidenceQuestions(survey).flatMap((evidence) =>
    evidence.panels
      .map((panel) => panel.getQuestionByValueName("course_ref"))
      .filter(Boolean),
  );
}

function getPrerequisiteEvidenceQuestions(survey) {
  return survey.pages
    .flatMap((page) => page.elements)
    .filter(
      (element) =>
        element.getType() === "panel" &&
        element.name.startsWith("requirement_"),
    )
    .flatMap((requirement) => requirement.elements)
    .filter(isPrerequisiteEvidenceQuestion);
}

function isPrerequisiteCourseQuestion(question) {
  return (
    getQuestionValueName(question) === "course_ref" &&
    isPrerequisiteEvidenceQuestion(question.parentQuestion)
  );
}

function isPrerequisiteEvidenceQuestion(question) {
  return (
    question?.getType() === "paneldynamic" &&
    question.name.startsWith("evidence_") &&
    question.keyName === "course_ref"
  );
}
