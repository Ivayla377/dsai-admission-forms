export const formVersions = {
  "2025-2026": {
    id: "2025-2026",
    definition: "forms/2025-2026.json",
    output: "dist/dsai-admission-2025-2026.html",
  },
  "2026-2027": {
    id: "2026-2027",
    definition: "forms/2026-2027.json",
    output: "dist/dsai-admission-2026-2027.html",
  },
};

export function getFormVersion(id) {
  const formVersion = formVersions[id];

  if (!formVersion) {
    throw new Error(
      `Unknown form version "${id}". Available versions: ${Object.keys(formVersions).join(", ")}.`,
    );
  }

  return formVersion;
}
