import { Model } from "survey-core";

import { addPrerequisiteKnowledgeContent } from "./prerequisite-content.js";
import {
  addPrerequisiteCourseUsageValidation,
  addPrerequisiteSubjectCourseChoiceAvailability,
} from "./prerequisite-validation.js";
import {
  addQuestionInfoTooltips,
  addTrustedDescriptionFormatting,
} from "./question-help.js";

const REPORT_PAGE_NAME = "application_report";
const REPORT_CONTENT_NAME = "application_report_content";
const REPORT_MOUNT_ID = "reportMount";

export function createConfiguredSurvey(
  formDefinition,
  { formVersion, theme } = {},
) {
  const survey = new Model(createRuntimeFormDefinition(formDefinition));

  if (theme) {
    survey.applyTheme(theme);
  }

  survey.focusFirstQuestionAutomatic = false;
  survey.showCompleteButton = false;
  addPrerequisiteKnowledgeContent(survey);
  addPrerequisiteCourseUsageValidation(survey);
  addQuestionInfoTooltips(survey);
  addTrustedDescriptionFormatting(survey);
  if (formVersion === "2026-2027") {
    addPrerequisiteSubjectCourseChoiceAvailability(survey);
  }

  return survey;
}

export function createRuntimeFormDefinition(source) {
  const runtimeDefinition = cloneJson(source);
  const reportPage = runtimeDefinition.pages.find(
    (page) => page.name === REPORT_PAGE_NAME,
  );

  if (!reportPage) {
    throw new Error(
      `The Form JSON must define the final "${REPORT_PAGE_NAME}" page.`,
    );
  }

  const reportContent = reportPage.elements.find(
    (element) => element.name === REPORT_CONTENT_NAME,
  );

  if (reportContent) {
    if (
      reportContent.type !== "html" ||
      !reportContent.html?.includes(`id="${REPORT_MOUNT_ID}"`)
    ) {
      throw new Error(
        `The "${REPORT_CONTENT_NAME}" element must contain #${REPORT_MOUNT_ID}.`,
      );
    }
  } else {
    reportPage.elements.push({
      type: "html",
      name: REPORT_CONTENT_NAME,
      html: `<div id="${REPORT_MOUNT_ID}"></div>`,
      showNumber: false,
    });
  }

  return runtimeDefinition;
}

function cloneJson(value) {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}
