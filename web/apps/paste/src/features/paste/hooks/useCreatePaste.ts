import { pasteClient } from "@/services/paste";
import { useState } from "react";

// Duplicate the constant to avoid loading the entire WASM.
export const MAX_PASTE_CHARS = 4000;

const createErrorMessage = (error: unknown) => {
    if (!(error instanceof Error)) return "Failed to create paste";
    switch (error.name) {
        case "empty_text":
            return "Enter some text first";
        case "text_too_long":
            return `Paste is limited to ${MAX_PASTE_CHARS} characters`;
        case "network":
            return "Couldn't connect to Ente";
        default:
            return "Failed to create paste";
    }
};

export const useCreatePaste = () => {
    const [inputText, setInputText] = useState("");
    const [creating, setCreating] = useState(false);
    const [createError, setCreateError] = useState<string | null>(null);
    const [createdLink, setCreatedLink] = useState<string | null>(null);
    const [createdLinkPasswordProtected, setCreatedLinkPasswordProtected] =
        useState(false);

    const createSecureLink = async (password?: string) => {
        setCreating(true);
        setCreateError(null);
        try {
            const paste = await (
                await pasteClient()
            ).create(window.location.origin, inputText, password);
            setCreatedLink(paste.url);
            setCreatedLinkPasswordProtected(paste.passwordRequired);
        } catch (error) {
            setCreateError(createErrorMessage(error));
        } finally {
            setCreating(false);
        }
    };

    return {
        inputText,
        setInputText,
        creating,
        createError,
        createdLink,
        createdLinkPasswordProtected,
        createSecureLink,
    };
};
