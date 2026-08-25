import assert from "node:assert/strict";
import test from "node:test";

import { Model } from "survey-core";

import form2025 from "../forms/2025-2026.json" with { type: "json" };
import form2026 from "../forms/2026-2027.json" with { type: "json" };
import { formVersions } from "../scripts/form-versions.mjs";
import { buildOutput } from "../src/output.js";
import { addPrerequisiteKnowledgeContent } from "../src/prerequisite-content.js";
import fixture from "./fixtures/synthetic-application.json" with { type: "json" };

const forms = {
  "2025-2026": form2025,
  "2026-2027": form2026,
};

const expected2026Requirements = [
  {
    name: "requirement_calculus",
    title: "Calculus (4 EC)",
    topics: [
      "Continuity",
      "Closed, open, and bounded sets",
      "Differentiation, integration",
      "Distances, norms",
    ],
  },
  {
    name: "requirement_linear_algebra",
    title: "Linear Algebra (5 EC)",
    topics: [
      "Calculate with matrices and vectors",
      "Solve linear systems with Gauss(-Jordan) elimination",
      "Understand and apply rank, orthogonality, (in)dependency, eigenvalue decomposition and eigenvectors",
    ],
  },
  {
    name: "requirement_probability_statistics",
    title: "Probability and Statistics (5 EC)",
    topics: [
      "Introductory probability theory (single-variable & multi-variable distributions, marginalization, conditioning, independence, Bayes' rule)",
      "Knowledge of discrete and continuous random variables",
      "Descriptive statistics including the theory and practice of confidence intervals, hypothesis testing and estimation theory",
    ],
  },
  {
    name: "requirement_discrete_mathematics",
    title: "Discrete Mathematics (5 EC)",
    topics: [
      "Propositional logic and predicate logic",
      "Reason with logical formulas",
      "Standard proving techniques such as induction, case distinction, contradiction",
      "Set operations, functions, relations, orderings",
      "Knowledge of basic graph structures (graphs, trees, and their properties)",
    ],
  },
  {
    name: "requirement_data_structures_algorithms",
    title: "Data Structures and Algorithms (5 EC)",
    topics: [
      "Use of standard data structures",
      "Algorithm design techniques",
      "Reason about algorithm complexity and efficiency",
    ],
  },
  {
    name: "requirement_programming_software_development",
    title: "Programming and Software Development (5 EC)",
    topics: [
      "Write programs from scratch in imperative and object-oriented languages (not only scripts)",
      "Use general algorithmic techniques (aggregation, searching, sorting, recursion)",
      "Apply the principles of code quality and software engineering",
    ],
  },
  {
    name: "requirement_data_modeling_databases",
    title: "Data Modeling and Databases",
    topics: [
      "Design data models (E-R diagrams, UML) from natural language requirements",
      "Query relational databases (SQL) based on natural language requirements",
    ],
  },
  {
    name: "requirement_machine_learning_data_mining",
    title: "Machine Learning and Data Mining (5 EC)",
    topics: [
      "Apply feature selection and extraction",
      "Apply supervised learning (classification and regression)",
      "Apply unsupervised learning (clustering and matrix factorization)",
      "Apply evaluation methods and understand overfitting",
      "Training machine learning models and making predictions",
    ],
  },
];

test("all registered academic-year forms load through SurveyJS", () => {
  assert.deepEqual(Object.keys(formVersions), Object.keys(forms));

  for (const [year, definition] of Object.entries(forms)) {
    const survey = new Model();
    survey.fromJSON(structuredClone(definition), {
      validatePropertyValues: true,
    });

    assert.deepEqual(
      (survey.jsonErrors ?? []).map((error) => error.message),
      [],
      `${year} should not have SurveyJS JSON errors`,
    );
    assert.equal(survey.pages.length, 5);
    assert.equal(survey.pages.at(-1).name, "application_report");

    addPrerequisiteKnowledgeContent(survey);
    const overview = survey.getQuestionByName(
      "admission_requirements_overview",
    );
    assert.match(overview.html, /requirements-overview/);

    assert.deepEqual(
      collectDuplicateElementNames(definition),
      [],
      `${year} should have unique Survey Creator element names`,
    );
  }
});

test("the 2026-2027 form contains the updated prerequisite document", () => {
  const actual = getRequirementDefinitions(form2026);

  assert.deepEqual(actual, expected2026Requirements);
  assert.equal(actual.length, 8);
  assert.ok(
    actual
      .filter(({ name }) => name !== "requirement_data_modeling_databases")
      .every(({ title }) => /\(\d+ EC\)$/.test(title)),
    "every prerequisite with a specified EC value should include it in its title",
  );
  assert.doesNotMatch(
    JSON.stringify(form2026),
    /[^\x00-\x7F]/,
    "the English Form JSON should not contain mojibake or other non-ASCII characters",
  );
});

test("the 2026-2027 form produces output for its updated prerequisites", () => {
  const output = buildOutput({
    surveyData: fixture,
    formDefinition: form2026,
    formVersion: "2026-2027",
    generatedAt: "2026-08-25T10:00:00.000Z",
  });

  assert.equal(output.formVersion, "2026-2027");
  assert.deepEqual(
    output.prerequisiteCoverage.map((requirement) => ({
      reference: requirement.requirementReference,
      title: requirement.requirementTitle,
    })),
    expected2026Requirements.map((requirement) => ({
      reference: requirement.name.replace("requirement_", ""),
      title: requirement.title,
    })),
  );
});

function getRequirementDefinitions(definition) {
  const coveragePage = definition.pages.find(
    (page) => page.name === "prerequisite_coverage_page",
  );

  return coveragePage.elements.map((requirement) => {
    const evidence = requirement.elements.find(
      (element) => element.type === "paneldynamic",
    );
    const topics = evidence.templateElements.find(
      (element) => element.valueName === "topics_covered",
    );

    return {
      name: requirement.name,
      title: requirement.title,
      topics: topics.choices,
    };
  });
}

function collectDuplicateElementNames(definition) {
  const names = new Map();

  function visit(elements, parentPath = "") {
    for (const element of elements ?? []) {
      const path = `${parentPath}/${element.name || element.type}`;
      if (element.name) {
        const paths = names.get(element.name) ?? [];
        paths.push(path);
        names.set(element.name, paths);
      }
      visit(element.elements, path);
      visit(element.templateElements, `${path}[]`);
    }
  }

  for (const page of definition.pages) {
    visit(page.elements, page.name);
  }

  return [...names.entries()]
    .filter(([, paths]) => paths.length > 1)
    .map(([name]) => name);
}
