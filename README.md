# TU/e DS&AI Additional Admissions Form

An offline, single-file admissions form for the TU/e master's programme Data Science and Artificial Intelligence. The form uses SurveyJS for the
questionnaire, JSON Schema for its machine-readable output contract, pdfmake
for the applicant/DAB report and Vite for the standalone HTML build.

## Development

Requirements:

- Node.js 20.19 or newer
- npm

Install dependencies and start the development server:

```bash
npm install
npm run dev
```

Run the tests and build the standalone form:

```bash
npm test
npm run build
```

The generated form is written to:

```text
dist/dsai-admission-2025-2026.html
```

It contains SurveyJS, pdfmake, fonts, styles, the active Form JSON, the Output JSON Schema and the TU/e logo. It requires no internet connection at runtime.

## Project structure

- `forms/2025-2026.json` is the source of truth for the questionnaire: pages,
  wording, question order, SurveyJS logic and constraints.
- `schemas/output-v1.schema.json` is the source of truth for the normalized,
  machine-readable Output JSON format.
- `index.html` defines the application shell and the final browser Report page.
- `src/main.js` initializes SurveyJS and controls report generation, downloads
  and returning to the form.
- `src/styles.scss` contains the shared form and Report page styling.
- `src/output.js` converts SurveyJS answers into validated Output JSON.
- `src/pdf.js` defines and generates the human-readable PDF report, including
  its embedded Output JSON attachment.
- `scripts/build-form.mjs` and `vite.config.js` create the standalone offline
  HTML file.
- `tests/` verifies the Form JSON, Output JSON and augmented PDF generation.

The Form JSON uses standard SurveyJS properties so it can be imported into,
edited in and exported from the online SurveyJS Creator. The Report page and
file-generation logic are application code and are maintained outside Creator.
