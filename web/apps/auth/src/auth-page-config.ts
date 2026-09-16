import { AuthShell } from "@/components/AuthShell";
import type { AuthPageConfig } from "ente-accounts/components/auth/AuthPageProvider";
import { LoginFrame } from "./components/auth/LoginFrame";

export const authPageConfig: AuthPageConfig = {
    encryptWithRecoveryKey: async (data) => {
        const { encryptWithRecoveryKey } =
            await import("./services/recovery-key");
        return encryptWithRecoveryKey(data);
    },
    Shell: AuthShell,
    LoginFrame,
};
