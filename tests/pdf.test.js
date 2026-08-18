import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import fixture from "./fixtures/synthetic-application.json" with { type: "json" };
import { buildOutput, serializeOutputJson } from "../src/output.js";
import {
  buildPdfDefinition,
  createAugmentedPdfBlob,
  getPdfFilename,
} from "../src/pdf.js";

const output = buildOutput({
  surveyData: fixture,
  formVersion: "2025-2026",
  generatedAt: "2026-08-18T10:00:00.000Z",
});

test("the PDF definition embeds the exact Output JSON", () => {
  const definition = buildPdfDefinition(output);
  const attachment = definition.files.outputJson;
  const encodedContent = attachment.src.split(",", 2)[1];
  const embeddedJson = Buffer.from(encodedContent, "base64").toString("utf8");

  assert.equal(attachment.name, "dsai-admission-2025-2026.json");
  assert.equal(embeddedJson, serializeOutputJson(output));
});

test("the application PDF has the user-facing admissions filename", () => {
  assert.equal(
    getPdfFilename(output),
    "DSAI-additional-admissions-2025-2026.pdf",
  );
});

test("pdfmake can generate an augmented PDF blob", async () => {
  const logo = readFileSync(new URL("../tue_logo.jpg", import.meta.url));
  const logoUrl = `data:image/jpeg;base64,${logo.toString("base64")}`;
  const blob = await createAugmentedPdfBlob(output, { logoUrl });
  const signature = Buffer.from(await blob.arrayBuffer())
    .subarray(0, 5)
    .toString("ascii");

  assert.equal(blob.type, "application/pdf");
  assert.equal(signature, "%PDF-");
});
