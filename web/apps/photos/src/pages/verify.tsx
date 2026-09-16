import { PasskeyVerificationForm } from "@/components/auth/PasskeyVerificationForm";
import { PhotosAuthShell } from "@/components/PhotosAuthShell";
import { SecondFactorChoiceDialog } from "ente-accounts/components/auth/SecondFactorChoiceDialog";
import { VerifyEmailForm } from "ente-accounts/components/auth/VerifyEmailForm";
import { withAuthPageShell } from "ente-accounts/components/auth/withAuthPageShell";
import AccountsVerifyPage from "ente-accounts/pages/verify";
import type React from "react";

const VerifyEmailPresentation = withAuthPageShell(
    VerifyEmailForm,
    PhotosAuthShell,
);

const PasskeyPresentation = withAuthPageShell(
    PasskeyVerificationForm,
    PhotosAuthShell,
);

function VerifyPage(): React.JSX.Element {
    return (
        <AccountsVerifyPage
            presentation={VerifyEmailPresentation}
            passkeyPresentation={PasskeyPresentation}
            secondFactorChoicePresentation={SecondFactorChoiceDialog}
        />
    );
}

export default VerifyPage;
