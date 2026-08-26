import { Model } from "survey-core";
import { DefaultLight } from "survey-core/themes";
import "survey-core/survey-core.min.css";
import "survey-js-ui";

import formDefinition from "@active-form";
import tueLogoUrl from "../tue_logo.jpg";

import {
  buildOutput,
  // Debug-only standalone JSON download. Uncomment this import and the other
  // downloadJson sections below together with the button in index.html.
  // downloadOutputJson,
  OutputValidationError,
} from "./output.js";
import {
  createAugmentedPdfBlob,
  downloadPdfBlob,
  getPdfFilename,
} from "./pdf.js";
import { addPrerequisiteKnowledgeContent } from "./prerequisite-content.js";
import {
  addPrerequisiteCourseUsageValidation,
  addPrerequisiteSubjectCourseChoiceAvailability,
} from "./prerequisite-validation.js";
import "./styles.scss";

const FORM_VERSION = __FORM_VERSION__;
const REPORT_PAGE_NAME = "application_report";
const REPORT_MOUNT_ID = "reportMount";

const surveyTheme = {
  ...DefaultLight,
  cssVariables: {
    ...DefaultLight.cssVariables,
    "--sjs-primary-backcolor": "#18b394",
    "--sjs-primary-backcolor-dark": "#119a7f",
    "--sjs-primary-backcolor-light": "rgba(24, 179, 148, 0.12)",
    "--sjs-special-red": "#c81919",
    "--sjs-special-red-light": "rgba(200, 25, 25, 0.1)",
    "--sjs-font-family": "Noto Sans, Open Sans, Segoe UI, Arial, sans-serif",
  },
};

const survey = new Model(createRuntimeFormDefinition(formDefinition));
survey.applyTheme(surveyTheme);
survey.focusFirstQuestionAutomatic = false;
survey.showCompleteButton = false;
addPrerequisiteKnowledgeContent(survey);
addPrerequisiteCourseUsageValidation(survey);
if (FORM_VERSION === "2026-2027") {
  addPrerequisiteSubjectCourseChoiceAvailability(survey);
}

const reportTemplate = requiredElement("reportPageTemplate");

let preparedOutput = null;
let preparedPdfBlob = null;
let reportGenerationId = 0;

setBranding();
updateNextButtonText(survey);

survey.onCurrentPageChanged.add((sender) => {
  updateNextButtonText(sender);

  if (sender.currentPage?.name === REPORT_PAGE_NAME) {
    scheduleReportGeneration(sender);
  } else {
    invalidatePreparedReport();
  }
});

document.addEventListener("click", (event) => {
  if (!(event.target instanceof Element)) {
    return;
  }

  if (event.target.closest("#downloadPdf") && preparedPdfBlob && preparedOutput) {
    downloadPdfBlob(preparedPdfBlob, preparedOutput);
  }

  // Debug-only standalone JSON download.
  // if (event.target.closest("#downloadJson") && preparedOutput) {
  //   downloadOutputJson(preparedOutput);
  // }
});

survey.render(requiredElement("surveyElement"));

function createRuntimeFormDefinition(source) {
  const runtimeDefinition = cloneJson(source);
  const reportPage = runtimeDefinition.pages.find(
    (page) => page.name === REPORT_PAGE_NAME,
  );

  if (!reportPage) {
    throw new Error(
      `The Form JSON must define the final "${REPORT_PAGE_NAME}" page.`,
    );
  }

  reportPage.elements = [
    {
      type: "html",
      name: "application_report_content",
      html: `<div id="${REPORT_MOUNT_ID}"></div>`,
      showNumber: false,
    },
  ];

  return runtimeDefinition;
}

function scheduleReportGeneration(model) {
  const generationId = ++reportGenerationId;
  preparedOutput = null;
  preparedPdfBlob = null;

  // SurveyJS changes the current page before its UI renderer has mounted the
  // new page. Deferring once lets the report placeholder enter the DOM first.
  queueMicrotask(() => generateReport(model, generationId));
}

async function generateReport(model, generationId) {
  if (
    generationId !== reportGenerationId ||
    model.currentPage?.name !== REPORT_PAGE_NAME
  ) {
    return;
  }

  const reportView = mountReportView();
  showPreparingState(reportView);

  try {
    preparedOutput = buildOutput({
      surveyData: model.data,
      formDefinition,
      formVersion: FORM_VERSION,
    });
    reportView.pdfFilename.textContent = getPdfFilename(preparedOutput);
    preparedPdfBlob = await createAugmentedPdfBlob(preparedOutput, {
      logoUrl: tueLogoUrl,
    });

    if (
      generationId !== reportGenerationId ||
      model.currentPage?.name !== REPORT_PAGE_NAME
    ) {
      return;
    }

    reportView.completionActions.dataset.state = "ready";
    reportView.reportTitle.textContent = "Your application PDF is ready";
    reportView.completionStatus.textContent =
      "Download the PDF, review the information, and upload the same PDF to OSIRIS.";
    reportView.downloadPdfButton.disabled = false;
    // Debug-only standalone JSON download.
    // reportView.downloadJsonButton.disabled = false;
    reportView.completionActions.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  } catch (error) {
    showGenerationError(reportView, error);
  }
}

function mountReportView() {
  const mount = requiredElement(REPORT_MOUNT_ID);
  mount.replaceChildren(reportTemplate.content.cloneNode(true));

  return {
    completionActions: requiredElement("completionActions"),
    reportTitle: requiredElement("reportTitle"),
    completionStatus: requiredElement("completionStatus"),
    pdfFilename: requiredElement("pdfFilename"),
    downloadPdfButton: requiredElement("downloadPdf"),
    // Debug-only standalone JSON download.
    // downloadJsonButton: requiredElement("downloadJson"),
  };
}

function showPreparingState(reportView) {
  reportView.completionActions.dataset.state = "preparing";
  reportView.reportTitle.textContent = "Creating your application PDF";
  reportView.completionStatus.textContent =
    "Please wait while the PDF and embedded Output JSON are prepared.";
  reportView.pdfFilename.textContent =
    `DSAI-additional-admissions-${FORM_VERSION}.pdf`;
  reportView.downloadPdfButton.disabled = true;
  // Debug-only standalone JSON download.
  // reportView.downloadJsonButton.disabled = true;
}

function showGenerationError(reportView, error) {
  reportView.completionActions.dataset.state = "error";
  reportView.reportTitle.textContent =
    "Your application PDF could not be created";
  reportView.downloadPdfButton.disabled = true;
  // Debug-only standalone JSON download.
  // reportView.downloadJsonButton.disabled = !preparedOutput;

  if (error instanceof OutputValidationError) {
    reportView.completionStatus.textContent = error.message;
  } else {
    reportView.completionStatus.textContent =
      "The application files could not be generated. Your answers remain in the form; please go back, review them and try again.";
  }

  console.error(error);
}

function invalidatePreparedReport() {
  reportGenerationId += 1;
  preparedOutput = null;
  preparedPdfBlob = null;
}

function updateNextButtonText(model) {
  const reportPageIndex = model.pages.findIndex(
    (page) => page.name === REPORT_PAGE_NAME,
  );
  const isBeforeReport = model.currentPageNo === reportPageIndex - 1;

  model.pageNextText = isBeforeReport
    ? formDefinition.completeText
    : (formDefinition.pageNextText ?? "Next");
}

function setBranding() {
  const logo = requiredElement("tueLogo");
  logo.src = tueLogoUrl;

  const favicon =
    document.querySelector('link[rel~="icon"]') ??
    document.head.appendChild(document.createElement("link"));
  favicon.setAttribute("rel", "icon");
  favicon.setAttribute("type", "image/jpeg");
  favicon.setAttribute("href", tueLogoUrl);

  requiredElement("appTitle").textContent = formDefinition.title;
  requiredElement("appYear").textContent = FORM_VERSION;
}

function requiredElement(id) {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Required page element was not found: #${id}`);
  }
  return element;
}

function cloneJson(value) {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}
