import { encryptWithRecoveryKey } from "@/services/recovery-key";
import TwoFactorSetupPage from "ente-accounts/pages/two-factor/setup";

export default function Page() {
    return (
        <TwoFactorSetupPage encryptWithRecoveryKey={encryptWithRecoveryKey} />
    );
}
