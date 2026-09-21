import { beforeEach, describe, expect, it, vi } from "vitest";
import { LlmProvider } from "../src/services/llm/provider";

const { backend, invoke } = vi.hoisted(() => ({
    backend: {
        kind: "tauri",
        initBackend: vi.fn(),
        createContext: vi.fn(),
        loadModel: vi.fn(),
        freeContext: vi.fn(),
        freeModel: vi.fn(),
        generateChatStream: vi.fn(),
    },
    invoke: vi.fn(),
}));
vi.mock("../src/services/llm/inference", () => ({
    createInferenceBackend: () => backend,
}));
vi.mock("ente-base/log", () => ({ default: { info: vi.fn(), warn: vi.fn() } }));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

describe("provider loaded-context budgets", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        backend.kind = "tauri";
        backend.createContext.mockResolvedValue(12032);
        invoke.mockImplementation((command: string) => {
            if (command === "system_info") return Promise.resolve({});
            if (command === "desktop_model_policy")
                return Promise.reject(new Error("use fallback catalog"));
            if (command === "llm_model_status")
                return Promise.resolve({
                    downloaded: true,
                    modelPath: "/synthetic/model.gguf",
                });
            return Promise.resolve(1);
        });
    });

    it("uses the rounded loaded size without reloading on every turn", async () => {
        const provider = new LlmProvider();
        expect(provider.resolveRuntimeSettings({})).toMatchObject({
            contextSize: 12000,
            maxTokens: 2048,
        });
        await provider.ensureModelReady({});
        expect(provider.resolveRuntimeSettings({})).toMatchObject({
            contextSize: 12032,
            maxTokens: 2048,
            inputBudget: 9728,
        });
        await provider.ensureModelReady({});
        expect(backend.createContext).toHaveBeenCalledOnce();
        await provider.generateChatStream({ messages: [] });
        expect(backend.generateChatStream).toHaveBeenCalledWith(
            { messages: [], maxTokens: 2048 },
            undefined,
        );
    });

    it("recomputes Auto on a smaller loaded context and rejects an oversized saved override", async () => {
        backend.createContext.mockResolvedValue(2048);
        const provider = new LlmProvider();
        await provider.ensureModelReady({});
        expect(provider.resolveRuntimeSettings({})).toMatchObject({
            contextSize: 2048,
            maxTokens: 512,
            inputBudget: 1280,
        });
        expect(
            provider.resolveRuntimeSettings({ maxTokens: 1024 }).maxTokens,
        ).toBe(1024);
        expect(() =>
            provider.resolveRuntimeSettings({ maxTokens: 6000 }),
        ).toThrow(/no room/);
        await expect(
            provider.generateChatStream({ messages: [], maxTokens: 6000 }),
        ).rejects.toThrow(/no room/);
        expect(backend.generateChatStream).not.toHaveBeenCalled();
        expect(
            provider.resolveRuntimeSettings({
                contextLength: 8192,
                maxTokens: 6000,
            }).maxTokens,
        ).toBe(6000);
    });

    it("restores capacity after no-op retrieval but forgets it when native model state changes", async () => {
        const provider = new LlmProvider();
        await provider.ensureModelReady({});
        await provider.withKnowledgeRetrieval(
            () => Promise.resolve(undefined),
            () => true,
        );
        expect(provider.resolveRuntimeSettings({}).contextSize).toBe(12032);
        invoke
            .mockResolvedValueOnce(1)
            .mockResolvedValueOnce(1)
            .mockResolvedValueOnce(2);
        await provider.withKnowledgeRetrieval(
            () => Promise.resolve(undefined),
            () => true,
        );
        expect(provider.resolveRuntimeSettings({}).contextSize).toBe(12000);
        backend.createContext.mockResolvedValue(4096);
        await provider.ensureModelReady({});
        expect(provider.resolveRuntimeSettings({}).maxTokens).toBe(1024);
    });

    it("updates capacity on reset and discards it after a failed context load", async () => {
        const provider = new LlmProvider();
        await provider.ensureModelReady({});
        backend.createContext.mockResolvedValueOnce(2048);
        await provider.resetContext(12000);
        expect(provider.resolveRuntimeSettings({}).maxTokens).toBe(512);
        backend.createContext.mockRejectedValueOnce(
            new Error("allocation failed"),
        );
        await expect(provider.resetContext(12000)).rejects.toThrow(
            "allocation failed",
        );
        expect(provider.resolveRuntimeSettings({}).contextSize).toBe(12000);
    });
});
