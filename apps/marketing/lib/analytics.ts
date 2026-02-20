export const analyticsEvents = {
  CTA_START_OSS_CLICK: "cta_start_oss_click",
  CTA_START_CLOUD_CLICK: "cta_start_cloud_click",
  CTA_TALK_TO_SALES_CLICK: "cta_talk_to_sales_click",
  CTA_OPEN_PLAYGROUND_CLICK: "cta_open_playground_click",
  QUICKSTART_COMPLETE: "quickstart_complete",
  PLAYGROUND_RUN_CLICK: "playground_run_click",
  CONTACT_SUBMIT: "contact_submit",
  OSS_TO_CLOUD_INTENT: "oss_to_cloud_intent",
  DOCS_OPEN_CLICK: "docs_open_click",
  CHANGELOG_OPEN_CLICK: "changelog_open_click",
} as const;

export type AnalyticsEventName = (typeof analyticsEvents)[keyof typeof analyticsEvents];
