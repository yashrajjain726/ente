import { useEffect, useState } from "react";
import type { PageMode } from "../types";

export const usePasteRoute = () => {
    const [mode, setMode] = useState<PageMode>("create");

    useEffect(() => {
        const cleanPath = window.location.pathname.replace(/^\/+|\/+$/g, "");
        if (!cleanPath) {
            setMode("create");
            return;
        }

        setMode("view");
    }, []);

    return mode;
};
