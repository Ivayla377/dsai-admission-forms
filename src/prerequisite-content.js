import { getQuestionValueName } from "./surveyjs-question-utils.js";

const REQUIREMENT_PREFIX = "requirement_";
const OVERVIEW_QUESTION_NAME = "admission_requirements_overview";

export function addPrerequisiteKnowledgeContent(model) {
  const requirements = getRequirementContent(model);

  for (const requirement of requirements) {
    if (!String(requirement.panel.description ?? "").trim()) {
      requirement.panel.description = requirement.topics
        .map((topic) => `- ${topic}`)
        .join("\n");
    }
  }

  const overview = model.getQuestionByName(OVERVIEW_QUESTION_NAME);
  if (!overview) {
    throw new Error(
      `The Form JSON must define the "${OVERVIEW_QUESTION_NAME}" HTML element.`,
    );
  }

  overview.html = renderRequirementsOverview(requirements);
}


export function getRequirementTopicDefinitions(panel) {
  const evidence = panel?.elements?.find(
    (element) => getElementType(element) === "paneldynamic",
  );
  const topicsQuestion = evidence?.templateElements?.find(
    (element) => getQuestionValueName(element) === "topics_covered",
  );

  if (topicsQuestion) {
    return (topicsQuestion.choices ?? []).map(normalizeTopicChoice);
  }

  return String(panel?.description ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .map((line) => line.match(/^(?:-|\u2022)\s+(.+)$/)?.[1]?.trim() ?? "")
    .filter(Boolean)
    .map((topic) => ({ value: topic, text: topic }));
}

function getRequirementContent(model) {
  return model.pages
    .flatMap((page) => page.elements)
    .filter(
      (element) =>
        element.getType() === "panel" &&
        element.name.startsWith(REQUIREMENT_PREFIX),
    )
    .map((panel) => {
      const topics = getRequirementTopicDefinitions(panel);

      if (!topics.length) {
        throw new Error(
          `Requirement panel "${panel.name}" must define at least one topic.`,
        );
      }

      return {
        panel,
        title: panel.title,
        topics: topics.map((topic) => topic.text),
      };
    });
}

function getElementType(element) {
  return typeof element?.getType === "function"
    ? element.getType()
    : element?.type;
}

function normalizeTopicChoice(choice) {
  if (choice && typeof choice === "object") {
    const value = String(choice.value ?? choice.text ?? "").trim();
    const text = String(choice.text ?? choice.value ?? "").trim();
    return { value, text };
  }

  const value = String(choice ?? "").trim();
  return { value, text: value };
}

function renderRequirementsOverview(requirements) {
  const sections = requirements
    .map(
      (requirement, index) => `
        <section class="requirements-overview__item">
          <h3>${index + 1}. ${escapeHtml(requirement.title)}</h3>
          <ul>
            ${requirement.topics
              .map((topic) => `<li>${escapeHtml(topic)}</li>`)
              .join("")}
          </ul>
        </section>`,
    )
    .join("");

  return `<div class="requirements-overview">
    <div class="requirements-overview__list">${sections}</div>
  </div>`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
