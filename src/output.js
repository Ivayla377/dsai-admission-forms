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

export function buildOutput({
  surveyData,
  formDefinition,
  formVersion,
  generatedAt = new Date(),
}) {
  if (!formDefinition) {
    throw new OutputValidationError(
      "The Form JSON is required to build prerequisite coverage output.",
    );
  }

  const warnings = [];
  const personalInformation = surveyData.personal_info ?? {};
  const previousStudies = asArray(surveyData.previous_studies).map(
    (study, index) => normalizePreviousStudy(study, index, warnings),
  );
  const courses = asArray(surveyData.relevant_courses).map((course, index) =>
    normalizeCourse(course, index, warnings),
  );
  const prerequisiteCoverage = normalizePrerequisiteCoverage({
    surveyData,
    formDefinition,
    warnings,
  });

  assertUniqueReferences(
    previousStudies,
    (study) => study.studyReference,
    "study reference",
  );
  assertUniqueReferences(
    courses,
    (course) => course.courseReference,
    "course reference",
  );
  assertCourseDegreeReferences(courses, previousStudies);
  assertCoverageReferences(prerequisiteCoverage, courses);

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
    courses,
    prerequisiteCoverage,
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
      study.degree_ref || `degree-${index + 1}`,
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

function normalizeCourse(course, index, warnings) {
  const path = `courses[${index}]`;
  const degreeReference = normalizeText(
    course.degree_ref,
    `${path}.degreeReference`,
    warnings,
  );
  const courseCode = normalizeText(
    course.course_code,
    `${path}.courseCode`,
    warnings,
  );
  const courseReference = `${degreeReference}::${courseCode}`;
  const calculatedReference = normalizeText(
    course.course_ref,
    `${path}.courseReference`,
    warnings,
  );

  if (calculatedReference && calculatedReference !== courseReference) {
    throw new OutputValidationError(
      `The calculated course reference "${calculatedReference}" does not match "${courseReference}".`,
    );
  }

  return {
    courseReference,
    degreeReference,
    courseTitle: normalizeText(
      course.course_title,
      `${path}.courseTitle`,
      warnings,
    ),
    courseCode,
    credits: Number(course.course_credits),
    finalGrade: normalizeOptionalText(
      course.final_grade,
      `${path}.finalGrade`,
      warnings,
    ),
    officialDescription: normalizeText(
      course.official_course_description,
      `${path}.officialDescription`,
      warnings,
    ),
  };
}

function normalizePrerequisiteCoverage({
  surveyData,
  formDefinition,
  warnings,
}) {
  return extractPrerequisiteRequirements(formDefinition).map(
    (requirement, requirementIndex) => {
      const path = `prerequisiteCoverage[${requirementIndex}]`;
      const courseEvidence = asArray(
        surveyData[requirement.evidenceQuestionName],
      ).map((evidence, evidenceIndex) => ({
        courseReference: normalizeText(
          evidence.course_ref,
          `${path}.courseEvidence[${evidenceIndex}].courseReference`,
          warnings,
        ),
        topicsCovered: asArray(evidence.topics_covered).map(
          (topic, topicIndex) =>
            normalizeText(
              topic,
              `${path}.courseEvidence[${evidenceIndex}].topicsCovered[${topicIndex}]`,
              warnings,
            ),
        ),
        additionalExplanation: normalizeOptionalText(
          evidence.additional_explanation,
          `${path}.courseEvidence[${evidenceIndex}].additionalExplanation`,
          warnings,
        ),
      }));

      assertUniqueReferences(
        courseEvidence,
        (evidence) => evidence.courseReference,
        `course reference for ${requirement.requirementTitle}`,
      );

      return {
        requirementReference: requirement.requirementReference,
        requirementTitle: normalizeText(
          requirement.requirementTitle,
          `${path}.requirementTitle`,
          warnings,
        ),
        topics: requirement.topics,
        courseEvidence,
      };
    },
  );
}

function extractPrerequisiteRequirements(formDefinition) {
  return asArray(formDefinition.pages).flatMap((page) =>
    asArray(page.elements)
      .filter(
        (element) =>
          element.type === "panel" && element.name?.startsWith("requirement_"),
      )
      .map(extractRequirementDefinition),
  );
}

function extractRequirementDefinition(requirementPanel) {
  const evidenceQuestion = asArray(requirementPanel.elements).find(
    (element) =>
      element.type === "paneldynamic" && element.name?.startsWith("evidence_"),
  );

  if (!evidenceQuestion) {
    throw new OutputValidationError(
      `Requirement panel "${requirementPanel.name}" must contain an evidence Dynamic Panel.`,
    );
  }

  const topicsQuestion = asArray(evidenceQuestion.templateElements).find(
    (element) => element.name === "topics_covered",
  );

  return {
    requirementReference: stripNameAffixes(
      requirementPanel.name,
      "requirement_",
    ),
    requirementTitle: requirementPanel.title,
    evidenceQuestionName: evidenceQuestion.name,
    topics: asArray(topicsQuestion?.choices).map(getChoiceValue),
  };
}

function getChoiceValue(choice) {
  if (choice && typeof choice === "object") {
    return String(choice.value ?? choice.text ?? "").trim();
  }
  return String(choice ?? "").trim();
}

function stripNameAffixes(value, prefix, suffix = "") {
  let result = String(value ?? "");

  if (prefix && result.startsWith(prefix)) {
    result = result.slice(prefix.length);
  }
  if (suffix && result.endsWith(suffix)) {
    result = result.slice(0, -suffix.length);
  }

  return result;
}

function assertUniqueReferences(items, getReference, label) {
  const seen = new Set();

  for (const item of items) {
    const reference = getReference(item);
    const normalizedReference = reference.toLocaleLowerCase("en-US");
    if (seen.has(normalizedReference)) {
      throw new OutputValidationError(
        `The ${label} "${reference}" is used more than once.`,
      );
    }
    seen.add(normalizedReference);
  }
}

function assertCourseDegreeReferences(courses, previousStudies) {
  const degreeReferences = new Set(
    previousStudies.map((study) => study.studyReference),
  );

  for (const course of courses) {
    if (!degreeReferences.has(course.degreeReference)) {
      throw new OutputValidationError(
        `Course "${course.courseReference}" refers to an unknown degree "${course.degreeReference}".`,
      );
    }
  }
}

function assertCoverageReferences(prerequisiteCoverage, courses) {
  const courseReferences = new Set(
    courses.map((course) => course.courseReference),
  );

  for (const requirement of prerequisiteCoverage) {
    const availableTopics = new Set(requirement.topics);

    for (const evidence of requirement.courseEvidence) {
      if (!courseReferences.has(evidence.courseReference)) {
        throw new OutputValidationError(
          `Requirement "${requirement.requirementTitle}" refers to an unknown course "${evidence.courseReference}".`,
        );
      }

      if (availableTopics.size > 0 && evidence.topicsCovered.length === 0) {
        throw new OutputValidationError(
          `Select at least one topic for "${requirement.requirementTitle}" and course "${evidence.courseReference}".`,
        );
      }

      for (const topic of evidence.topicsCovered) {
        if (!availableTopics.has(topic)) {
          throw new OutputValidationError(
            `Topic "${topic}" is not defined for "${requirement.requirementTitle}".`,
          );
        }
      }
    }
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

function normalizeOptionalText(value, path, warnings) {
  const normalized = normalizeText(value, path, warnings);
  return normalized || null;
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
