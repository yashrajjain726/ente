import React from "react";

export const useProfileStickyHeader = (
    enabled: boolean,
    identityRef: React.RefObject<HTMLDivElement | null>,
    compactHeight: number,
) => {
    const [isSticky, setIsSticky] = React.useState(false);
    const syncScroll = React.useCallback(() => {
        const identity = identityRef.current;
        if (!enabled || !identity) return;
        setIsSticky(identity.getBoundingClientRect().bottom < compactHeight);
    }, [compactHeight, enabled, identityRef]);

    React.useLayoutEffect(() => {
        const identity = identityRef.current;
        if (!enabled || !identity) return;
        syncScroll();
        const observer = new IntersectionObserver(
            ([entry]) =>
                setIsSticky(entry!.boundingClientRect.bottom < compactHeight),
            { rootMargin: `-${compactHeight}px 0px 0px`, threshold: 0 },
        );
        observer.observe(identity);
        return () => observer.disconnect();
    }, [compactHeight, enabled, identityRef, syncScroll]);

    return { isSticky, syncScroll };
};
