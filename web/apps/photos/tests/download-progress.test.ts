import { downloadProgressState } from "ente-gallery/components/viewer/download-progress";
import { describe, expect, test } from "vitest";

const loading = { isContentLoading: true };

describe("downloadProgressState", () => {
    test("keeps decrypting during the live-photo conversion tail", () => {
        const downloaded = downloadProgressState(
            loading,
            { loaded: 100, total: 100 },
            undefined,
        );
        expect(downloaded).toEqual({
            phase: "decrypting",
            pct: 100,
            loaded: 100,
            total: 100,
        });
        const tail = downloadProgressState(loading, undefined, downloaded);
        expect(tail).toEqual({ phase: "decrypting", pct: 100 });
        expect(downloadProgressState(loading, undefined, tail)).toEqual(tail);
    });

    test("prepares HLS auto video without a download entry, then hides", () => {
        const preparing = downloadProgressState(loading, undefined, undefined);
        expect(preparing).toEqual({ phase: "preparing", pct: 0 });
        expect(downloadProgressState({}, undefined, preparing)).toBeUndefined();
    });

    test("hides cached content regardless of previous progress or an entry", () => {
        expect(
            downloadProgressState(
                {},
                { loaded: 30, total: 100 },
                { phase: "downloading", pct: 30 },
            ),
        ).toBeUndefined();
        expect(
            downloadProgressState({}, undefined, { phase: "failed", pct: 70 }),
        ).toBeUndefined();
    });

    test("clamps ciphertext exceeding the plaintext size fallback", () => {
        expect(
            downloadProgressState(
                loading,
                { loaded: 117, total: 100 },
                undefined,
            ),
        ).toEqual({ phase: "decrypting", pct: 100, loaded: 117, total: 100 });
    });

    test("shows unknown totals as indeterminate and retains the download tail", () => {
        const state = downloadProgressState(
            loading,
            { loaded: 30, total: undefined },
            undefined,
        );
        expect(state).toEqual({
            phase: "downloading",
            pct: undefined,
            loaded: 30,
        });
        expect(downloadProgressState(loading, undefined, state)).toEqual({
            phase: "decrypting",
            pct: 100,
        });
    });

    test("failure takes precedence and keeps the previous percentage", () => {
        expect(
            downloadProgressState({ fetchFailed: true }, undefined, {
                phase: "downloading",
                pct: 42,
            }),
        ).toEqual({ phase: "failed", pct: 42 });
        expect(
            downloadProgressState(
                { ...loading, fetchFailed: true },
                { loaded: 100, total: 100 },
                undefined,
            ),
        ).toEqual({ phase: "failed", pct: 0 });
    });

    test("retry ignores the previous failed percentage", () => {
        expect(
            downloadProgressState(loading, undefined, {
                phase: "failed",
                pct: 42,
            }),
        ).toEqual({ phase: "preparing", pct: 0 });
    });

    test("opens on an in-flight download without previous state", () => {
        expect(
            downloadProgressState(
                loading,
                { loaded: 30, total: 100 },
                undefined,
            ),
        ).toEqual({ phase: "downloading", pct: 30, loaded: 30, total: 100 });
    });

    test("prepares a known total with no bytes and floors partial percentages", () => {
        expect(
            downloadProgressState(
                loading,
                { loaded: 0, total: 100 },
                undefined,
            ),
        ).toEqual({ phase: "preparing", pct: 0 });
        expect(
            downloadProgressState(
                loading,
                { loaded: 9999, total: 10000 },
                undefined,
            )?.pct,
        ).toBe(99);
    });
});
