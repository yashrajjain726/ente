import { useMediaQuery, useTheme } from "@mui/material";
import { useCallback, useEffect, useEffectEvent, useState } from "react";

export const useIsSmallWidth = () =>
    useMediaQuery(useTheme().breakpoints.down("sm"));

// Only use this touchscreen heuristic where misclassification degrades gracefully.
export const useIsTouchscreen = () =>
    useMediaQuery("(hover: none) and (pointer: coarse)", { noSsr: true });

export const useClipboardCopy = (
    text: string,
): [copied: boolean, onCopy: () => void] => {
    const [copied, setCopied] = useState(false);

    const handleCopyLink = useCallback(() => {
        void navigator.clipboard.writeText(text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1000);
        });
    }, [text]);

    return [copied, handleCopyLink];
};

export const useInterval = (
    callback: () => void,
    delay: number | null,
): void => {
    const onTick = useEffectEvent(callback);

    useEffect(() => {
        if (delay === null) return;

        const id = setInterval(onTick, delay);
        return () => clearInterval(id);
    }, [delay]);
};
