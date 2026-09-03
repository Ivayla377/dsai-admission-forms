import {
  LocalizableString,
  PopupModel,
  Serializer,
  SvgRegistry,
} from "survey-core";

const INFO_TOOLTIP_PROPERTY = "infoTooltip";
const QUESTION_INFO_ICON = "question-info-16x16";
const OFFICIAL_COURSE_DESCRIPTION_QUESTION_NAME =
  "official_course_description";

if (!Serializer.findProperty("question", INFO_TOOLTIP_PROPERTY)) {
  Serializer.addProperty("question", {
    name: `${INFO_TOOLTIP_PROPERTY}:text`,
    category: "general",
  });
}

SvgRegistry.registerIcons({
  [QUESTION_INFO_ICON]:
    '<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" d="M8 1.25a6.75 6.75 0 1 0 0 13.5A6.75 6.75 0 0 0 8 1.25ZM2.75 8a5.25 5.25 0 1 1 10.5 0 5.25 5.25 0 0 1-10.5 0ZM8 4.25a.875.875 0 1 0 0 1.75.875.875 0 0 0 0-1.75ZM7.25 7h1.5v4.75h-1.5V7Z" clip-rule="evenodd"/></svg>',
});

export function addCourseDescriptionFormatting(survey) {
  survey.onTextMarkdown.add((_sender, options) => {
    if (
      options.element.name === OFFICIAL_COURSE_DESCRIPTION_QUESTION_NAME &&
      options.name === "description"
    ) {
      // This description is trusted, static Form JSON—not applicant input.
      options.html = options.text;
    }
  });
}

export function addQuestionInfoTooltips(survey) {
  survey.onGetQuestionTitleActions.add((_sender, options) => {
    const tooltip = options.question[INFO_TOOLTIP_PROPERTY]?.trim();
    if (!tooltip) {
      return;
    }

    const helpText = new LocalizableString(undefined, false);
    helpText.defaultValue = tooltip;
    const popup = new PopupModel(
      "sv-string-viewer",
      { model: helpText },
      {
        verticalPosition: "bottom",
        horizontalPosition: "center",
        showPointer: true,
        displayMode: "popup",
        cssClass: "question-info-tooltip-popup",
        isFocusedContent: false,
      },
    );

    options.actions.push({
      id: "question-info-tooltip",
      title: "More information",
      tooltip,
      iconName: QUESTION_INFO_ICON,
      iconSize: 18,
      showTitle: false,
      disableShrink: true,
      disableHide: true,
      css: "question-info-tooltip",
      component: "sv-action-bar-item-dropdown",
      popupModel: popup,
      action: () => popup.toggleVisibility(),
    });
  });
}
