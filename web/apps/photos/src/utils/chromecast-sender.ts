/* eslint-disable @typescript-eslint/no-namespace */
// Sender and receiver @types conflict, so declare only the sender APIs used here.

declare global {
    interface Window {
        cast: typeof cast;
        __onGCastApiAvailable(available: boolean, reason?: string): void;
    }
}

declare namespace chrome.cast {
    export enum AutoJoinPolicy {
        ORIGIN_SCOPED = "origin_scoped",
    }
}

declare namespace cast.framework {
    interface CastOptions {
        autoJoinPolicy: chrome.cast.AutoJoinPolicy;
        receiverApplicationId?: string | undefined;
    }

    class CastContext {
        static getInstance(): CastContext;
        setOptions(options: CastOptions): void;
        requestSession(): Promise<unknown>;
        getCurrentSession(): CastSession | null;
    }

    class CastSession {
        sendMessage(namespace: string, data: unknown): Promise<unknown>;
        addMessageListener(
            namespace: string,
            listener: (namespace: string, message: string) => void,
        ): void;
    }
}

export const loadCast = (() => {
    let promise: Promise<typeof cast> | undefined;

    return () => {
        if (promise === undefined) {
            promise = new Promise((resolve) => {
                const script = document.createElement("script");
                script.src =
                    "https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1";
                window.__onGCastApiAvailable = (isAvailable) => {
                    if (isAvailable) {
                        cast.framework.CastContext.getInstance().setOptions({
                            receiverApplicationId: "F5BCEC64",
                            autoJoinPolicy:
                                chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED,
                        });

                        resolve(cast);
                    }
                };
                document.body.appendChild(script);
            });
        }
        return promise;
    };
})();
