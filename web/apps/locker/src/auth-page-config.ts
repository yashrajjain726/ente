import { LockerAuthShell } from "@/components/auth/LockerAuthShell";
import type { AuthPageConfig } from "ente-accounts/components/auth/AuthPageProvider";

export const authPageConfig: AuthPageConfig = {
    encryptWithRecoveryKey: async (data) => {
        const { encryptWithRecoveryKey } =
            await import("./services/recovery-key");
        return encryptWithRecoveryKey(data);
    },
    Shell: LockerAuthShell,
    keepLoginLoadingOnRedirect: true,
};
