import { AuthShell } from "@/components/AuthShell";
import { RecoveryKeyForm } from "ente-accounts/components/auth/RecoveryKeyForm";
import { SetPasswordForm } from "ente-accounts/components/auth/SetPasswordForm";
import { withAuthPageShell } from "ente-accounts/components/auth/withAuthPageShell";
import AccountsGeneratePage from "ente-accounts/pages/generate";
import type React from "react";

const RecoveryKeyPresentation = withAuthPageShell(RecoveryKeyForm, AuthShell);

const SetPasswordPresentation = withAuthPageShell(SetPasswordForm, AuthShell);

function GeneratePage(): React.JSX.Element {
    return (
        <AccountsGeneratePage
            passwordPresentation={SetPasswordPresentation}
            recoveryKeyPresentation={RecoveryKeyPresentation}
        />
    );
}

export default GeneratePage;
