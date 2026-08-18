import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

import outputSchema from "../schemas/output-v1.schema.json" with { type: "json" };

export const OUTPUT_SCHEMA_VERSION = "1";
const ASSUMED_CREDIT_SYSTEM = "ects";

const ajv = new Ajv2020({ allErrors: true });
addFormats(ajv);
const validateOutput = ajv.compile(outputSchema);

export class OutputValidationError extends Error {
  constructor(message, validationErrors = []) {
    super(message);
    this.name = "OutputValidationError";
    this.validationErrors = validationErrors;
  }
}

export function buildOutput({ surveyData, formVersion, generatedAt = new Date() }) {
  const warnings = [];
  const personalInformation = surveyData.personal_info ?? {};
  const previousStudies = asArray(surveyData.previous_studies).map(
    (study, index) => normalizePreviousStudy(study, index, warnings),
  );

  assertUniqueStudyReferences(previousStudies);

  const output = {
    outputSchemaVersion: OUTPUT_SCHEMA_VERSION,
    formVersion,
    generatedAt: new Date(generatedAt).toISOString(),
    applicant: {
      fullName: normalizeText(
        personalInformation.name,
        "applicant.fullName",
        warnings,
      ),
      tueStudentNumber: normalizeText(
        personalInformation.id,
        "applicant.tueStudentNumber",
        warnings,
      ),
    },
    previousStudies,
    generationWarnings: warnings,
  };

  if (!validateOutput(output)) {
    const validationErrors = validateOutput.errors ?? [];
    throw new OutputValidationError(
      `The Output JSON does not match its schema: ${formatValidationErrors(validationErrors)}`,
      validationErrors,
    );
  }

  return output;
}

export function serializeOutputJson(output) {
  return `${JSON.stringify(output, null, 2)}\n`;
}

export function downloadOutputJson(output) {
  const blob = new Blob([serializeOutputJson(output)], {
    type: "application/json;charset=utf-8",
  });
  downloadBlob(blob, `dsai-admission-${output.formVersion}.json`);
}

function normalizePreviousStudy(study, index, warnings) {
  const path = `previousStudies[${index}]`;

  return {
    studyReference: normalizeText(
      `degree-${index + 1}`,
      `${path}.studyReference`,
      warnings,
    ),
    degreeProgrammeName: normalizeText(
      study.degree_programme_name,
      `${path}.degreeProgrammeName`,
      warnings,
    ),
    graduationDate: normalizeText(
      study.graduation_date,
      `${path}.graduationDate`,
      warnings,
    ),
    universityName: normalizeText(
      study.university_name,
      `${path}.universityName`,
      warnings,
    ),
    city: normalizeText(study.city, `${path}.city`, warnings),
    country: normalizeText(study.country, `${path}.country`, warnings),
    totalDegreeCredits: Number(study.total_degree_credits),
    creditSystem: ASSUMED_CREDIT_SYSTEM,
    creditSystemOther: null,
  };
}

function assertUniqueStudyReferences(previousStudies) {
  const seen = new Set();

  for (const study of previousStudies) {
    const normalizedReference = study.studyReference.toLocaleLowerCase("en-US");
    if (seen.has(normalizedReference)) {
      throw new OutputValidationError(
        `The study reference "${study.studyReference}" is used more than once.`,
      );
    }
    seen.add(normalizedReference);
  }
}

function normalizeText(value, path, warnings) {
  const original = value == null ? "" : String(value);
  const wellFormed = toWellFormedString(original);

  if (wellFormed !== original) {
    warnings.push({
      path,
      message:
        "An invalid Unicode code unit was replaced with the Unicode replacement character.",
    });
  }

  return wellFormed.trim();
}

function toWellFormedString(value) {
  let result = "";

  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);

    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const nextCodeUnit = value.charCodeAt(index + 1);
      if (nextCodeUnit >= 0xdc00 && nextCodeUnit <= 0xdfff) {
        result += value[index] + value[index + 1];
        index += 1;
      } else {
        result += "\uFFFD";
      }
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      result += "\uFFFD";
    } else {
      result += value[index];
    }
  }

  return result;
}

function formatValidationErrors(errors) {
  return errors
    .map((error) => `${error.instancePath || "/"} ${error.message}`)
    .join("; ");
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
