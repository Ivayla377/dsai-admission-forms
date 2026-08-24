export const MAX_PREREQUISITE_USES_PER_COURSE = 3;

const COURSE_USAGE_ERROR =
  "A course can be used for at most three prerequisites.";

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
    if (
      options.name === "course_ref" &&
      isPrerequisiteEvidenceQuestion(options.question)
    ) {
      revalidateSelectedPrerequisiteCourses(sender);
    }
  });

  survey.onPanelRemoved.add((sender) => {
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

function getPrerequisiteCourseQuestions(survey) {
  return getPrerequisiteEvidenceQuestions(survey).flatMap((evidence) =>
    evidence.panels
      .map((panel) => panel.getQuestionByName("course_ref"))
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
    question.name === "course_ref" &&
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
