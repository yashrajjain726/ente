import { pasteClient } from "@/services/paste";
import { useEffect, useRef, useState } from "react";
import type { PageMode } from "../types";
import { waitUntilVisible } from "../utils/browser";

const consumeErrorMessage = (error: unknown) => {
    if (!(error instanceof Error)) return "Paste is unavailable";
    switch (error.name) {
        case "missing_key":
            return "Missing key in URL";
        case "invalid_link":
        case "invalid_access_token":
        case "key_mismatch":
            return "Invalid paste link";
        case "invalid_key":
            return "Invalid key in URL";
        case "unavailable":
            return "This paste has expired or was already opened";
        case "network":
            return "Couldn't connect to Ente";
        case "request_failed":
            return "Couldn't open paste";
        case "crypto":
        case "malformed_payload":
            return "Unable to decrypt paste";
        default:
            return "Paste is unavailable";
    }
};

export const useConsumePaste = (mode: PageMode) => {
    const [consuming, setConsuming] = useState(false);
    const [consumeError, setConsumeError] = useState<string | null>(null);
    const [resolvedText, setResolvedText] = useState<string | null>(null);
    const [passwordRequired, setPasswordRequired] = useState(false);
    const [passwordError, setPasswordError] = useState<string | null>(null);
    const openStartedRef = useRef(false);
    const consumeInFlightRef = useRef(false);

    useEffect(() => {
        if (mode !== "view" || openStartedRef.current) return;
        openStartedRef.current = true;

        const open = async () => {
            setConsuming(true);
            setConsumeError(null);
            try {
                await waitUntilVisible();
                const paste = await (
                    await pasteClient()
                ).open(window.location.href);
                if (paste.passwordRequired) {
                    setPasswordRequired(true);
                } else {
                    setResolvedText(paste.text);
                }
            } catch (error) {
                setConsumeError(consumeErrorMessage(error));
            } finally {
                setConsuming(false);
            }
        };

        void open();
    }, [mode]);

    const submitPassword = async (password: string) => {
        if (!password) {
            setPasswordError("Enter the paste password");
            return;
        }
        if (consumeInFlightRef.current) return;
        consumeInFlightRef.current = true;
        setConsuming(true);
        setConsumeError(null);
        setPasswordError(null);
        try {
            setResolvedText(
                await (await pasteClient()).submitPassword(password),
            );
            setPasswordRequired(false);
        } catch (error) {
            if (error instanceof Error && error.name === "incorrect_password") {
                setPasswordError("Incorrect paste password");
            } else if (
                error instanceof Error &&
                error.name === "password_required"
            ) {
                setPasswordError("Enter the paste password");
            } else {
                setConsumeError(consumeErrorMessage(error));
            }
        } finally {
            consumeInFlightRef.current = false;
            setConsuming(false);
        }
    };

    return {
        consuming,
        consumeError,
        resolvedText,
        passwordRequired,
        passwordError,
        submitPassword,
    };
};
