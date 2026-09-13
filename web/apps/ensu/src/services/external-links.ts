import { isTauriRuntime } from "@/services/tauri-runtime";
import type { MouseEvent } from "react";

export const safeExternalUrl = (href: string | undefined) => {
    if (!href) return undefined;
    try {
        const url = new URL(href);
        return ["http:", "https:", "mailto:"].includes(url.protocol)
            ? url.toString()
            : undefined;
    } catch {
        return undefined;
    }
};

export const handleExternalLinkClick = (
    event: MouseEvent<HTMLAnchorElement>,
) => {
    if (!isTauriRuntime() || event.button !== 0) return;
    const href = safeExternalUrl(event.currentTarget.href);
    if (!href) return;
    event.preventDefault();
    void import("@tauri-apps/plugin-opener")
        .then(({ openUrl }) => openUrl(href))
        .catch(() => window.open(href, "_blank", "noopener,noreferrer"));
};
