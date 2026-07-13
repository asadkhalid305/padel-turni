"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { MainPaneLoadingOverlay } from "@/components/main-pane-loading-overlay";
import { shouldStartNavigation } from "@/components/navigation-progress-utils";

const navigationCompleteEvent = "padeltour:navigation-complete";

export function NavigationProgress() {
  const pathname = usePathname();

  return <NavigationProgressController key={pathname} />;
}

function NavigationProgressController() {
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const pendingAnchorRef = useRef<HTMLAnchorElement | null>(null);

  const finishNavigation = useCallback(() => {
    const pendingAnchor = pendingAnchorRef.current;
    if (pendingAnchor) {
      pendingAnchor.removeAttribute("aria-busy");
      pendingAnchor.removeAttribute("aria-disabled");
    }
    pendingAnchorRef.current = null;
    pendingRef.current = false;
    document.body.removeAttribute("aria-busy");
    setPending(false);
  }, []);

  useEffect(() => {
    const originalPushState = window.history.pushState;
    const originalReplaceState = window.history.replaceState;
    const notifyNavigationComplete = () => {
      queueMicrotask(() => {
        window.dispatchEvent(new Event(navigationCompleteEvent));
      });
    };

    window.history.pushState = function (...args) {
      originalPushState.apply(this, args);
      notifyNavigationComplete();
    };
    window.history.replaceState = function (...args) {
      originalReplaceState.apply(this, args);
      notifyNavigationComplete();
    };

    window.addEventListener(navigationCompleteEvent, finishNavigation);
    window.addEventListener("popstate", finishNavigation);

    return () => {
      window.history.pushState = originalPushState;
      window.history.replaceState = originalReplaceState;
      window.removeEventListener(navigationCompleteEvent, finishNavigation);
      window.removeEventListener("popstate", finishNavigation);
    };
  }, [finishNavigation]);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      const target = event.target;
      const element = target instanceof Element ? target : null;
      const anchor = element?.closest<HTMLAnchorElement>("a[href]");
      if (!anchor) return;

      const startsNavigation = shouldStartNavigation({
        button: event.button,
        currentUrl: window.location.href,
        defaultPrevented: event.defaultPrevented,
        download: anchor.hasAttribute("download"),
        href: anchor.href,
        metaKey: event.metaKey,
        ctrlKey: event.ctrlKey,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
        target: anchor.getAttribute("target"),
      });
      if (!startsNavigation) return;

      if (pendingRef.current) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      pendingRef.current = true;
      pendingAnchorRef.current = anchor;
      anchor.setAttribute("aria-busy", "true");
      anchor.setAttribute("aria-disabled", "true");
      document.body.setAttribute("aria-busy", "true");
      setPending(true);
    }

    document.addEventListener("click", handleClick, true);
    return () => {
      document.removeEventListener("click", handleClick, true);
      pendingAnchorRef.current?.removeAttribute("aria-busy");
      pendingAnchorRef.current?.removeAttribute("aria-disabled");
      document.body.removeAttribute("aria-busy");
    };
  }, []);

  if (!pending) return null;

  return <MainPaneLoadingOverlay label="Loading page" />;
}
