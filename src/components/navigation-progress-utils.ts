export type NavigationClick = {
  button: number;
  currentUrl: string;
  defaultPrevented: boolean;
  download: boolean;
  href: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  target: string | null;
};

export function shouldStartNavigation({
  button,
  currentUrl,
  defaultPrevented,
  download,
  href,
  metaKey,
  ctrlKey,
  shiftKey,
  altKey,
  target,
}: NavigationClick) {
  if (
    defaultPrevented ||
    button !== 0 ||
    download ||
    metaKey ||
    ctrlKey ||
    shiftKey ||
    altKey ||
    (target !== null && target !== "" && target !== "_self")
  ) {
    return false;
  }

  try {
    const current = new URL(currentUrl);
    const destination = new URL(href, current);

    if (
      destination.origin !== current.origin ||
      !["http:", "https:"].includes(destination.protocol)
    ) {
      return false;
    }

    return (
      destination.pathname !== current.pathname ||
      destination.search !== current.search
    );
  } catch {
    return false;
  }
}
