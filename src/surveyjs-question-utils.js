export function getQuestionValueName(question) {
  if (typeof question?.getValueName === "function") {
    return question.getValueName();
  }

  return question?.valueName || question?.name;
}
