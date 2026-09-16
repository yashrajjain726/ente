import { LockerAuthShell } from "@/components/auth/LockerAuthShell";
import { RecoverTwoFactorForm } from "ente-accounts/components/auth/RecoveryForm";
import { withAuthPageShell } from "ente-accounts/components/auth/withAuthPageShell";
import AccountsTwoFactorRecoverPage from "ente-accounts/pages/two-factor/recover";
import type React from "react";

const RecoverTwoFactorPresentation = withAuthPageShell(
    RecoverTwoFactorForm,
    LockerAuthShell,
    420,
);

function PasskeyRecoverPage(): React.JSX.Element {
    return (
        <AccountsTwoFactorRecoverPage
            twoFactorType="passkey"
            presentation={RecoverTwoFactorPresentation}
        />
    );
}

export default PasskeyRecoverPage;
