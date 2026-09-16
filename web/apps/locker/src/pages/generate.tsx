import { LockerAuthShell } from "@/components/auth/LockerAuthShell";
import { RecoveryKeyForm } from "ente-accounts/components/auth/RecoveryKeyForm";
import { SetPasswordForm } from "ente-accounts/components/auth/SetPasswordForm";
import { withAuthPageShell } from "ente-accounts/components/auth/withAuthPageShell";
import AccountsGeneratePage from "ente-accounts/pages/generate";
import type React from "react";

const RecoveryKeyPresentation = withAuthPageShell(
    RecoveryKeyForm,
    LockerAuthShell,
);

const SetPasswordPresentation = withAuthPageShell(
    SetPasswordForm,
    LockerAuthShell,
);

function GeneratePage(): React.JSX.Element {
    return (
        <AccountsGeneratePage
            passwordPresentation={SetPasswordPresentation}
            recoveryKeyPresentation={RecoveryKeyPresentation}
        />
    );
}

export default GeneratePage;
