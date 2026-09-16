import { PasskeyVerificationForm } from "@/components/auth/PasskeyVerificationForm";
import { PhotosAuthShell } from "@/components/PhotosAuthShell";
import {
    CredentialsForm,
    PasswordForm,
} from "ente-accounts/components/auth/CredentialsForm";
import { SecondFactorChoiceDialog } from "ente-accounts/components/auth/SecondFactorChoiceDialog";
import { withAuthPageShell } from "ente-accounts/components/auth/withAuthPageShell";
import AccountsCredentialsPage from "ente-accounts/pages/credentials";
import type React from "react";

const CredentialsPresentation = withAuthPageShell(
    CredentialsForm,
    PhotosAuthShell,
);

const PasskeyPresentation = withAuthPageShell(
    PasskeyVerificationForm,
    PhotosAuthShell,
);

function CredentialsPage(): React.JSX.Element {
    return (
        <AccountsCredentialsPage
            presentation={CredentialsPresentation}
            passwordPresentation={PasswordForm}
            passkeyPresentation={PasskeyPresentation}
            secondFactorChoicePresentation={SecondFactorChoiceDialog}
        />
    );
}

export default CredentialsPage;
