"use client";

import { ReactNode, useEffect } from "react";
import { analyticsEvents } from "@/lib/analytics";

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    dataLayer?: Array<Record<string, unknown>>;
  }
}

function emitAnalyticsEvent(eventName: string, payload: Record<string, unknown>) {
  if (typeof window.gtag === "function") {
    window.gtag("event", eventName, payload);
  }
  if (Array.isArray(window.dataLayer)) {
    window.dataLayer.push({ event: eventName, ...payload });
  }
}

function inferAnalyticsEvent(element: HTMLElement): string | null {
  const href = element instanceof HTMLAnchorElement ? element.getAttribute("href") ?? "" : "";
  const label = element.textContent?.toLowerCase() ?? "";
  const currentPath = window.location.pathname;

  if (href.includes("/product/personal") || label.includes("start oss")) {
    return analyticsEvents.CTA_START_OSS_CLICK;
  }
  if (href.includes("/product/enterprise") || label.includes("see cloud")) {
    return analyticsEvents.CTA_START_CLOUD_CLICK;
  }
  if (href.includes("/playground") || label.includes("open playground")) {
    return analyticsEvents.CTA_OPEN_PLAYGROUND_CLICK;
  }
  if (href.includes("/contact") || label.includes("talk to sales")) {
    return analyticsEvents.CTA_TALK_TO_SALES_CLICK;
  }
  if (href.includes("ONBOARDING_5MIN") || label.includes("5-minute onboarding")) {
    return analyticsEvents.QUICKSTART_COMPLETE;
  }
  if (href.includes("/pricing") && (currentPath.includes("/product/personal") || currentPath.includes("/open-core"))) {
    return analyticsEvents.OSS_TO_CLOUD_INTENT;
  }
  return null;
}

export function Providers({ children }: { children: ReactNode }) {
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target as Element | null;
      const element = target?.closest<HTMLElement>("[data-analytics-event], .btn");
      if (!element) return;
      const eventName = element.dataset.analyticsEvent ?? inferAnalyticsEvent(element);
      if (!eventName) return;

      const payload: Record<string, unknown> = {
        path: window.location.pathname,
        href: element instanceof HTMLAnchorElement ? element.href : undefined,
        label: element.textContent?.trim(),
      };
      emitAnalyticsEvent(eventName, payload);
    };

    const onSubmit = (event: Event) => {
      const form = event.target as HTMLFormElement | null;
      const eventName = form?.dataset.analyticsSubmit;
      if (!eventName) return;
      emitAnalyticsEvent(eventName, {
        path: window.location.pathname,
        form: form.getAttribute("name") ?? "anonymous_form",
      });
    };

    document.addEventListener("click", onClick);
    document.addEventListener("submit", onSubmit);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("submit", onSubmit);
    };
  }, []);

  return <>{children}</>;
}
