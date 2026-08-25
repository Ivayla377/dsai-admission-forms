import { getQuestionValueName } from "./surveyjs-question-utils.js";

const REQUIREMENT_PREFIX = "requirement_";
const OVERVIEW_QUESTION_NAME = "admission_requirements_overview";

export function addPrerequisiteKnowledgeContent(model) {
  const requirements = getRequirementContent(model);

  for (const requirement of requirements) {
    requirement.panel.description = requirement.topics
      .map((topic) => `- ${topic}`)
      .join("\n");
  }

  const overview = model.getQuestionByName(OVERVIEW_QUESTION_NAME);
  if (!overview) {
    throw new Error(
      `The Form JSON must define the "${OVERVIEW_QUESTION_NAME}" HTML element.`,
    );
  }

  overview.html = renderRequirementsOverview(requirements);
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
      const evidence = panel.elements.find(
        (element) => element.getType() === "paneldynamic",
      );
      const topics = evidence?.templateElements.find(
        (element) => getQuestionValueName(element) === "topics_covered",
      );

      return {
        panel,
        title: panel.title,
        topics: (topics?.choices ?? []).map(
          (choice) => choice.text || String(choice.value),
        ),
      };
    });
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
