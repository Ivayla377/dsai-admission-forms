import { Model } from "survey-core";
import { DefaultLight } from "survey-core/themes";
import "survey-core/survey-core.min.css";
import "survey-js-ui";

import formDefinition from "@active-form";
import tueLogoUrl from "../tue_logo.jpg";

import {
  buildOutput,
  downloadOutputJson,
  OutputValidationError,
} from "./output.js";
import {
  createAugmentedPdfBlob,
  downloadPdfBlob,
  getPdfFilename,
} from "./pdf.js";
import "./styles.scss";

const FORM_VERSION = __FORM_VERSION__;

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

const survey = new Model(cloneJson(formDefinition));
survey.applyTheme(surveyTheme);
survey.focusFirstQuestionAutomatic = false;

const surveyShell = requiredElement("surveyShell");
const reportScreen = requiredElement("reportScreen");
const completionActions = requiredElement("completionActions");
const reportTitle = requiredElement("reportTitle");
const completionStatus = requiredElement("completionStatus");
const pdfFilename = requiredElement("pdfFilename");
const downloadPdfButton = requiredElement("downloadPdf");
const downloadJsonButton = requiredElement("downloadJson");
const previousButton = requiredElement("previousButton");

let preparedOutput = null;
let preparedPdfBlob = null;
let reportGenerationId = 0;

setBranding();

survey.onCompleting.add((sender, options) => {
  try {
    preparedOutput = buildOutput({
      surveyData: sender.data,
      formVersion: FORM_VERSION,
    });
  } catch (error) {
    options.allow = false;
    showGenerationError(error);
  }
});

survey.onComplete.add(async (sender) => {
  const generationId = ++reportGenerationId;
  showReportPage("preparing");

  try {
    preparedOutput ??= buildOutput({
      surveyData: sender.data,
      formVersion: FORM_VERSION,
    });
    pdfFilename.textContent = getPdfFilename(preparedOutput);
    preparedPdfBlob = await createAugmentedPdfBlob(preparedOutput, {
      logoUrl: tueLogoUrl,
    });

    if (generationId !== reportGenerationId) {
      return;
    }

    completionActions.dataset.state = "ready";
    reportTitle.textContent = "Your application PDF is ready";
    completionStatus.textContent =
      "Download the PDF, review the information, and upload the same PDF to OSIRIS.";
    downloadPdfButton.disabled = false;
    downloadJsonButton.disabled = false;
    completionActions.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    showGenerationError(error);
  }
});

downloadPdfButton.addEventListener("click", () => {
  if (preparedPdfBlob && preparedOutput) {
    downloadPdfBlob(preparedPdfBlob, preparedOutput);
  }
});

downloadJsonButton.addEventListener("click", () => {
  if (preparedOutput) {
    downloadOutputJson(preparedOutput);
  }
});

previousButton.addEventListener("click", () => {
  reportGenerationId += 1;
  preparedOutput = null;
  preparedPdfBlob = null;

  survey.clear(false, false);
  survey.currentPageNo = Math.max(0, survey.visiblePageCount - 1);

  reportScreen.hidden = true;
  surveyShell.hidden = false;
  surveyShell.scrollIntoView({ behavior: "smooth", block: "start" });
});

survey.render(requiredElement("surveyElement"));

function showGenerationError(error) {
  reportGenerationId += 1;
  showReportPage("error");
  reportTitle.textContent = "Your application PDF could not be created";
  downloadPdfButton.disabled = true;
  downloadJsonButton.disabled = !preparedOutput;

  if (error instanceof OutputValidationError) {
    completionStatus.textContent = error.message;
  } else {
    completionStatus.textContent =
      "The application files could not be generated. Your answers remain in the form; please review them and try again.";
  }

  console.error(error);
}

function showReportPage(state) {
  surveyShell.hidden = true;
  reportScreen.hidden = false;
  completionActions.dataset.state = state;

  if (state === "preparing") {
    reportTitle.textContent = "Creating your application PDF";
    completionStatus.textContent =
      "Please wait while the PDF and embedded Output JSON are prepared.";
    pdfFilename.textContent = `DSAI-additional-admissions-${FORM_VERSION}.pdf`;
    downloadPdfButton.disabled = true;
    downloadJsonButton.disabled = true;
  }
}

function setBranding() {
  const logo = requiredElement("tueLogo");
  logo.src = tueLogoUrl;
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
