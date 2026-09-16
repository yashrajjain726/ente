import { LockerAuthShell } from "@/components/auth/LockerAuthShell";
import { SecondFactorChoiceDialog } from "ente-accounts/components/auth/SecondFactorChoiceDialog";
import { VerifyEmailForm } from "ente-accounts/components/auth/VerifyEmailForm";
import { withAuthPageShell } from "ente-accounts/components/auth/withAuthPageShell";
import AccountsVerifyPage from "ente-accounts/pages/verify";
import type React from "react";

const VerifyEmailPresentation = withAuthPageShell(
    VerifyEmailForm,
    LockerAuthShell,
);

function VerifyPage(): React.JSX.Element {
    return (
        <AccountsVerifyPage
            presentation={VerifyEmailPresentation}
            secondFactorChoicePresentation={SecondFactorChoiceDialog}
        />
    );
}

export default VerifyPage;
