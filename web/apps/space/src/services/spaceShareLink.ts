const openEvent = "ente-space-open-share-link";

export const openSpaceShareLinkDialog = () => {
    window.dispatchEvent(new Event(openEvent));
};

export const onOpenSpaceShareLinkDialog = (listener: () => void) => {
    window.addEventListener(openEvent, listener);
    return () => window.removeEventListener(openEvent, listener);
};
