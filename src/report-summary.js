import { convertCourseCreditsToEC } from "./credit-conversion.js";

const CREDIT_SYSTEM_LABELS = Object.freeze({
  ects: "ECTS",
  us_semester_credits: "US semester credits",
  us_quarter_credits: "US quarter credits",
  uk_cats: "UK credits (CATS)",
  other: "Other",
});

const GRADING_SYSTEM_LABELS = Object.freeze({
  numeric_higher_better: "Numeric - higher grades are better",
  numeric_lower_better: "Numeric - lower grades are better",
  letter_grades: "Letter grades",
  pass_fail: "Pass / Fail",
  other: "Other",
});

const OFFICIAL_DESCRIPTION_PREVIEW_CHARACTERS = 240;
const ADDITIONAL_EXPLANATION_PREVIEW_CHARACTERS = 180;

export function buildReportReviewSummary(output) {
  const studiesByReference = new Map(
    output.previousStudies.map((study) => [study.studyReference, study]),
  );
  const coursesByReference = new Map(
    output.courses.map((course) => [course.courseReference, course]),
  );
  const requirementsByCourse = new Map();

  const subjects = output.prerequisiteCoverage.map((requirement) => {
    const courses = requirement.courseEvidence.map((evidence) => {
      const uses = requirementsByCourse.get(evidence.courseReference) ?? [];
      uses.push(requirement.requirementTitle);
      requirementsByCourse.set(evidence.courseReference, uses);
      const course = coursesByReference.get(evidence.courseReference);

      return {
        courseReference: evidence.courseReference,
        label: course ? formatCourseLabel(course) : evidence.courseReference,
        additionalExplanation: evidence.additionalExplanation ?? "",
        topicsCovered: Array.isArray(evidence.topicsCovered)
          ? evidence.topicsCovered
          : [],
      };
    });

    return {
      requirementReference: requirement.requirementReference,
      title: requirement.requirementTitle,
      courses,
      hasNoCourses: courses.length === 0,
    };
  });

  const relevantCourses = output.courses.map((course) => {
    const study = studiesByReference.get(course.degreeReference);
    const usedFor = requirementsByCourse.get(course.courseReference) ?? [];

    return {
      courseReference: course.courseReference,
      courseCode: course.courseCode,
      courseTitle: course.courseTitle,
      label: formatCourseLabel(course),
      degreeProgrammeName:
        study?.degreeProgrammeName ?? course.degreeReference,
      credits: formatOriginalCourseCredits(course, study),
      courseEC: formatCourseCredits(course, study),
      grade: formatCourseGrade(course),
      officialDescription: course.officialDescription,
      usedFor,
      isUnused: usedFor.length === 0,
    };
  });
  const unusedCourses = relevantCourses.filter((course) => course.isUnused);

  return {
    applicant: {
      fullName: output.applicant.fullName,
      tueStudentNumber: output.applicant.tueStudentNumber,
    },
    previousStudies: output.previousStudies.map((study) => ({
      studyReference: study.studyReference,
      degreeProgrammeName: study.degreeProgrammeName,
      universityName: study.universityName,
      city: study.city,
      country: study.country,
      graduationDate: formatDate(study.graduationDate),
      fullTimeEquivalentDuration: formatStudyDuration(
        study.fullTimeEquivalentDurationYears,
      ),
      creditSystem: getCreditSystemLabel(study),
      totalDegreeCredits: formatNumber(study.totalDegreeCredits),
      gradingSystem:
        GRADING_SYSTEM_LABELS[study.gradingSystem] ?? study.gradingSystem,
      gradingSystemInformation: study.gradingSystemInformation ?? "",
      bestGrade: study.bestGrade ?? "",
      minimumPassingGrade: study.minimumPassingGrade ?? "",
    })),
    relevantCourses,
    subjects,
    unusedCourses,
    hasWarnings:
      subjects.some((subject) => subject.hasNoCourses) ||
      unusedCourses.length > 0,
  };
}

export function renderReportReviewSummary(container, output) {
  const summary = buildReportReviewSummary(output);
  const document = container.ownerDocument;

  if (!document) {
    throw new Error("The report summary container must belong to a document.");
  }

  const content = [
    createSection(document, "1. Applicant details", [
      createKeyValueTable(document, [
        ["Name", summary.applicant.fullName],
        ["Student ID", summary.applicant.tueStudentNumber],
      ]),
    ]),
    createPreviousStudiesSection(document, summary.previousStudies),
    createSection(document, "3. Relevant courses", [
      createCoursesTable(document, summary.relevantCourses),
    ]),
    createSection(document, "4. Prerequisite coverage", [
      createCoverageTable(document, summary),
    ]),
  ];

  if (!summary.hasWarnings) {
    content.push(
      createTextElement(
        document,
        "p",
        "No obvious omissions found.",
        "report-review__success",
      ),
    );
  }

  container.replaceChildren(...content);
  return summary;
}

function createSection(document, title, children) {
  const section = document.createElement("section");
  section.className = "report-review__section";
  section.appendChild(createSectionTitle(document, title));

  for (const child of children) {
    section.appendChild(child);
  }

  return section;
}

function createPreviousStudiesSection(document, studies) {
  const content = studies.map((study, index) => {
    const studyContainer = document.createElement("div");
    studyContainer.className = "report-review__study";
    studyContainer.appendChild(
      createTextElement(
        document,
        "h5",
        `Degree ${index + 1}: ${study.degreeProgrammeName}`,
        "report-review__subsection-title",
      ),
    );

    const rows = [
      ["Degree programme", study.degreeProgrammeName],
      ["University", study.universityName],
      ["Country", study.country],
      ["City", study.city],
      ["Graduation date", study.graduationDate],
      ["Full-time equivalent duration", study.fullTimeEquivalentDuration],
      ["Credit system", study.creditSystem],
      ["Total degree credits", study.totalDegreeCredits],
      ["Grading system", study.gradingSystem],
    ];

    if (study.gradingSystemInformation) {
      rows.push(["Grading system information", study.gradingSystemInformation]);
    }
    if (study.bestGrade) {
      rows.push(["Best possible grade", study.bestGrade]);
    }
    if (study.minimumPassingGrade) {
      rows.push(["Minimum passing grade", study.minimumPassingGrade]);
    }

    studyContainer.appendChild(createKeyValueTable(document, rows));
    return studyContainer;
  });

  return createSection(document, "2. Previous studies", content);
}

function createSectionTitle(document, title) {
  return createTextElement(
    document,
    "h4",
    title,
    "report-review__section-title",
  );
}

function createKeyValueTable(document, rows) {
  const table = document.createElement("table");
  table.className =
    "report-review__table report-review__table--key-value";
  const tableBody = document.createElement("tbody");

  for (const [label, value] of rows) {
    const row = document.createElement("tr");
    const header = createTextElement(document, "th", label);
    header.scope = "row";
    row.appendChild(header);
    row.appendChild(createTextElement(document, "td", value));
    tableBody.appendChild(row);
  }

  table.appendChild(tableBody);
  return wrapTable(document, table);
}

function createCoursesTable(document, courses) {
  const table = document.createElement("table");
  table.className =
    "report-review__table report-review__table--courses";
  const tableHead = document.createElement("thead");
  const headerRow = document.createElement("tr");

  for (const headerText of [
    "Course code",
    "Course title",
    "Degree",
    "Credits",
    "Grade",
    "Used for",
  ]) {
    const header = createTextElement(document, "th", headerText);
    header.scope = "col";
    headerRow.appendChild(header);
  }
  tableHead.appendChild(headerRow);
  table.appendChild(tableHead);

  const tableBody = document.createElement("tbody");
  for (const [courseIndex, course] of courses.entries()) {
    const courseRow = document.createElement("tr");
    courseRow.className = [
      "report-review__course-row",
      courseIndex > 0 ? "report-review__course-row--separated" : "",
      course.isUnused ? "report-review__course-row--unused" : "",
    ]
      .filter(Boolean)
      .join(" ");
    const courseCode = createTextElement(document, "th", course.courseCode);
    courseCode.scope = "row";
    courseRow.appendChild(courseCode);
    courseRow.appendChild(createTextElement(document, "td", course.courseTitle));
    courseRow.appendChild(
      createTextElement(document, "td", course.degreeProgrammeName),
    );
    courseRow.appendChild(createTextElement(document, "td", course.credits));
    courseRow.appendChild(createTextElement(document, "td", course.grade));

    const useCell = document.createElement("td");
    if (course.isUnused) {
      useCell.appendChild(
        createTextElement(
          document,
          "span",
          "Not used",
          "report-review__unused-status",
        ),
      );
    } else {
      useCell.appendChild(createCourseList(document, course.usedFor));
    }
    courseRow.appendChild(useCell);
    tableBody.appendChild(courseRow);

    const descriptionRow = document.createElement("tr");
    descriptionRow.className = course.isUnused
      ? "report-review__course-detail-row report-review__course-detail-row--unused"
      : "report-review__course-detail-row";
    const descriptionLabel = createTextElement(
      document,
      "th",
      "Official course description",
    );
    descriptionLabel.scope = "row";
    const description = createTextElement(
      document,
      "td",
      createTextPreview(
        course.officialDescription,
        OFFICIAL_DESCRIPTION_PREVIEW_CHARACTERS,
      ),
      "report-review__text-preview",
    );
    description.colSpan = 5;
    descriptionRow.appendChild(descriptionLabel);
    descriptionRow.appendChild(description);
    tableBody.appendChild(descriptionRow);
  }
  table.appendChild(tableBody);
  return wrapTable(document, table);
}

function createCoverageTable(document, summary) {
  const table = document.createElement("table");
  table.className =
    "report-review__table report-review__table--coverage";
  const tableHead = document.createElement("thead");
  const headerRow = document.createElement("tr");

  for (const headerText of [
    "Prerequisite subject",
    "Selected evidence course(s)",
  ]) {
    const header = createTextElement(document, "th", headerText);
    header.scope = "col";
    headerRow.appendChild(header);
  }
  tableHead.appendChild(headerRow);
  table.appendChild(tableHead);

  const tableBody = document.createElement("tbody");
  for (const subject of summary.subjects) {
    const subjectRow = document.createElement("tr");
    subjectRow.className = subject.hasNoCourses
      ? "report-review__row report-review__row--warning"
      : "report-review__row";
    const subjectCell = createTextElement(document, "th", subject.title);
    subjectCell.scope = "row";
    const coursesCell = document.createElement("td");

    if (subject.hasNoCourses) {
      coursesCell.appendChild(
        createTextElement(
          document,
          "span",
          "No course selected.",
          "report-review__warning-text",
        ),
      );
    } else {
      coursesCell.appendChild(createEvidenceList(document, subject.courses));
    }

    subjectRow.appendChild(subjectCell);
    subjectRow.appendChild(coursesCell);
    tableBody.appendChild(subjectRow);
  }

  table.appendChild(tableBody);
  return wrapTable(document, table);
}

function createEvidenceList(document, courses) {
  const list = document.createElement("ul");
  list.className = "report-review__courses report-review__evidence-list";

  for (const course of courses) {
    const item = document.createElement("li");
    item.appendChild(
      createTextElement(
        document,
        "span",
        course.label,
        "report-review__evidence-course",
      ),
    );

    if (course.topicsCovered.length) {
      item.appendChild(
        createTextElement(
          document,
          "p",
          `Topics covered: ${course.topicsCovered.join(", ")}`,
          "report-review__evidence-detail",
        ),
      );
    }
    if (course.additionalExplanation) {
      item.appendChild(
        createTextElement(
          document,
          "p",
          `Additional explanation: ${createTextPreview(
            course.additionalExplanation,
            ADDITIONAL_EXPLANATION_PREVIEW_CHARACTERS,
          )}`,
          "report-review__evidence-detail report-review__text-preview",
        ),
      );
    }
    list.appendChild(item);
  }

  return list;
}

function createCourseList(document, courses) {
  const list = document.createElement("ul");
  list.className = "report-review__courses";
  for (const course of courses) {
    list.appendChild(
      createTextElement(
        document,
        "li",
        typeof course === "string" ? course : course.label,
      ),
    );
  }
  return list;
}

function wrapTable(document, table) {
  const wrapper = document.createElement("div");
  wrapper.className = "report-review__table-wrapper";
  wrapper.appendChild(table);
  return wrapper;
}

function formatCourseLabel(course) {
  return `${course.courseCode} ${course.courseTitle}`.trim();
}

function formatCourseCredits(course, study) {
  const courseEC = Number.isFinite(course.courseEC)
    ? course.courseEC
    : convertCourseCreditsToEC({
        creditSystem: study.creditSystem,
        courseCredits: course.credits,
        totalDegreeCredits: study.totalDegreeCredits,
        fullTimeEquivalentDurationYears:
          study.fullTimeEquivalentDurationYears,
      });

  return `${formatNumber(courseEC)} EC`;
}

function formatOriginalCourseCredits(course, study) {
  return `${formatNumber(course.credits)} ${getCreditSystemLabel(study)}`;
}

function formatCourseGrade(course) {
  return course.isPassFail ? "Pass" : course.finalGrade;
}

function getCreditSystemLabel(study) {
  if (!study) return "Unknown credit system";
  const label = CREDIT_SYSTEM_LABELS[study.creditSystem] ?? study.creditSystem;

  if (study.creditSystem === "other" && study.creditSystemOther) {
    return `${label} (${study.creditSystemOther})`;
  }

  return label;
}

function formatStudyDuration(years) {
  return `${formatNumber(years)} ${years === 1 ? "year" : "years"}`;
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-GB", {
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

function createTextPreview(value, maximumCharacters) {
  const text = String(value ?? "").trim();
  const characters = Array.from(text);

  if (characters.length <= maximumCharacters) return text;

  const candidate = characters.slice(0, maximumCharacters).join("");
  const lastWordBreak = Math.max(
    candidate.lastIndexOf(" "),
    candidate.lastIndexOf("\n"),
    candidate.lastIndexOf("\t"),
  );
  const minimumWordBreak = Math.floor(maximumCharacters * 0.65);
  const end =
    lastWordBreak >= minimumWordBreak ? lastWordBreak : candidate.length;

  return `${Array.from(candidate).slice(0, end).join("").trimEnd()}…`;
}

function createTextElement(document, tagName, text, className = "") {
  const element = document.createElement(tagName);
  element.className = className;
  element.textContent =
    text === undefined || text === null || text === "" ? "-" : text;
  return element;
}
