const openEvent = "ente-space-open-share-link";

export const openSpaceShareLinkDialog = (profileLink: string) => {
    window.dispatchEvent(new CustomEvent(openEvent, { detail: profileLink }));
};

export const onOpenSpaceShareLinkDialog = (
    listener: (profileLink: string) => void,
) => {
    const handleOpen = (event: Event) => {
        listener((event as CustomEvent<string>).detail);
    };

    window.addEventListener(openEvent, handleOpen);
    return () => window.removeEventListener(openEvent, handleOpen);
};
