// Form JSON defines reference values. This adapter keeps selections attached
// to the same records when those values change (eg. course codes changed, degrees deleted).
export function addCourseLinkMaintenance(survey) {
  const studies = survey.getQuestionByName("previous_studies");
  const courses = survey.getQuestionByName("relevant_courses");
  let degreeRemoval = null;

  function evidenceQuestions() {
    return survey.getAllQuestions().filter(
      (question) => question.getType() === "paneldynamic" &&
        question !== courses && question.keyName === "course_ref",
    ).flatMap((question) => question.panels.map(
      (panel) => panel.getQuestionByValueName("course_ref"),
    )).filter(Boolean);
  }

  survey.onDynamicPanelRemoving.add((_sender, options) => {
    if (options.question !== studies || !options.allow) return;
    degreeRemoval = {
      courses: courses.panels.map((panel) => ({
        panel,
        reference: panel.getQuestionByValueName("course_ref").value,
        study: studies.panels.find((study) =>
          study.getQuestionByValueName("degree_ref").value ===
            panel.getQuestionByValueName("degree_ref").value,
        ),
      })),
      evidence: evidenceQuestions().map((question) => ({ question, value: question.value })),
    };
  });

  survey.onDynamicPanelRemoved.add((_sender, options) => {
    if (options.question !== studies || !degreeRemoval) return;
    const snapshot = degreeRemoval;
    try {
      const replacements = new Map();
      for (const course of snapshot.courses) {
        const survives = course.study && studies.panels.includes(course.study);
        course.panel.getQuestionByValueName("degree_ref").value = survives
          ? course.study.getQuestionByValueName("degree_ref").value
          : undefined;
        replacements.set(course.reference, survives
          ? course.panel.getQuestionByValueName("course_ref").value
          : undefined);
      }
      // Apply from the snapshot, so renumbering cannot cascade between records.
      for (const { question, value } of snapshot.evidence) {
        if (value && replacements.has(value)) question.value = replacements.get(value);
      }
    } finally {
      degreeRemoval = null;
    }
  });

  survey.onDynamicPanelItemValueChanged.add((_sender, options) => {
    if (degreeRemoval || options.question !== courses ||
        options.name !== "course_ref" || !options.oldValue ||
        options.oldValue === options.value) return;

    // An invalid duplicate reference does not uniquely identify an old course.
    if (courses.panels.some((panel) => panel !== options.panel &&
        panel.getQuestionByValueName("course_ref").value === options.oldValue)) return;

    const hasDegree = options.panel.getQuestionByValueName("degree_ref").value;
    const hasCode = options.panel.getQuestionByName("course_code").value;
    for (const question of evidenceQuestions()) {
      if (question.value === options.oldValue) {
        question.value = hasDegree && hasCode ? options.value : undefined;
      }
    }
  });
}
