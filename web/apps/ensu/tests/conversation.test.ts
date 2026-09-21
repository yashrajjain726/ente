import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GroundedSource } from "../src/services/knowledge";
import { prepareDesktopConversation } from "../src/services/llm/conversation";
import type { LlmProvider } from "../src/services/llm/provider";

const { invoke, listen, unlisten, addPreparedAnswer } = vi.hoisted(() => ({
    invoke: vi.fn(),
    listen: vi.fn(),
    unlisten: vi.fn(),
    addPreparedAnswer: vi.fn(),
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("@tauri-apps/api/event", () => ({ listen }));
vi.mock("../src/services/chat/store", () => ({ addPreparedAnswer }));

const generateChatStream = vi.fn();
const provider = { generateChatStream } as unknown as LlmProvider;

const input = {
    sessionUuid: "session",
    path: ["user"],
    system: "system",
    current: "question",
    maxTokens: 1024,
};
const ready = {
    preparationToken: "token",
    messages: [{ role: "user", content: "question" }],
};
const callbacks = () => ({ isCurrent: vi.fn(() => true), onProgress: vi.fn() });

describe("desktop conversation preparation", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        listen.mockResolvedValue(unlisten);
    });

    it("binds a grounded preparation to generation and saves a stopped answer once", async () => {
        const sources: GroundedSource[] = [
            {
                type: "localNote",
                reference: {
                    collectionId: "collection",
                    documentId: "trip.md",
                    indexedRevision: "revision",
                    title: "Trip",
                },
            },
        ];
        invoke
            .mockResolvedValueOnce(7)
            .mockResolvedValueOnce({
                ...ready,
                groundedContext: { text: "Selected passage", sources },
            });
        const handlers = callbacks();
        const groundedInput = {
            ...input,
            current: "Fresh source text\n\nquestion",
            historyQuery: "question",
            groundingCandidates: { searched: [], maxUtf8Bytes: 6000 },
        };
        const prepared = await prepareDesktopConversation(
            groundedInput,
            provider,
            handlers,
        );
        await prepared!.generateChatStream({ messages: [], maxTokens: 100 });
        expect(generateChatStream).toHaveBeenCalledExactlyOnceWith(
            {
                messages: ready.messages,
                preparationToken: ready.preparationToken,
                maxTokens: 100,
            },
            undefined,
        );
        const first = invoke.mock.calls[1]![1] as { input: object };
        expect(first).toMatchObject({
            input: {
                ...groundedInput,
                expectedUserText: groundedInput.current,
                cancellationEpoch: 7,
            },
        });
        expect(invoke).toHaveBeenCalledTimes(2);
        expect(unlisten).toHaveBeenCalledOnce();
        handlers.isCurrent.mockReturnValue(false);
        const answer = { messageUuid: "answer" };
        addPreparedAnswer.mockResolvedValueOnce(answer);
        const stopped = prepared!.saveAnswer("Partial answer");
        expect(prepared!.saveAnswer("Completed answer")).toBe(stopped);
        expect(await stopped).toBe(answer);
        expect(addPreparedAnswer).toHaveBeenCalledExactlyOnceWith(
            {
                token: ready.preparationToken,
                sessionUuid: input.sessionUuid,
                parentMessageUuid: input.path[0],
                sources,
            },
            "Partial answer",
        );
    });
});
