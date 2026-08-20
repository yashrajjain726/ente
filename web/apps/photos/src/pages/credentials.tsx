import { CredentialsForm } from "@/components/auth/CredentialsForm";
import { PasskeyVerificationForm } from "@/components/auth/PasskeyVerificationForm";
import { PasswordForm } from "@/components/auth/PasswordForm";
import { PhotosAuthShell } from "@/components/PhotosAuthShell";
import { featureFlags } from "@/featureFlags";
import type { VerifyingPasskeyPresentationProps } from "ente-accounts/components/LoginComponents";
import AccountsCredentialsPage, {
    type CredentialsPresentationProps,
} from "ente-accounts/pages/credentials";
import type React from "react";

function CredentialsPresentation(
    props: CredentialsPresentationProps,
): React.JSX.Element {
    return (
        <PhotosAuthShell>
            <CredentialsForm {...props} />
        </PhotosAuthShell>
    );
}

function PasskeyPresentation(
    props: VerifyingPasskeyPresentationProps,
): React.JSX.Element {
    return (
        <PhotosAuthShell>
            <PasskeyVerificationForm {...props} />
        </PhotosAuthShell>
    );
}

function CredentialsPage(): React.JSX.Element {
    if (!featureFlags.enableNewPhotosAuthFlow) {
        return <AccountsCredentialsPage />;
    }

    return (
        <AccountsCredentialsPage
            presentation={CredentialsPresentation}
            passwordPresentation={PasswordForm}
            passkeyPresentation={PasskeyPresentation}
        />
    );
}

export default CredentialsPage;
