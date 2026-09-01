import { PhotosAuthShell } from "@/components/PhotosAuthShell";
import { featureFlags } from "@/feature-flags";
import type { SignUpPresentationProps } from "ente-accounts/components/SignUpContents";
import { SignUpForm } from "ente-accounts/components/auth/SignUpForm";
import AccountsSignUpPage from "ente-accounts/pages/signup";
import type React from "react";

function SignUpPresentation(props: SignUpPresentationProps): React.JSX.Element {
    return (
        <PhotosAuthShell>
            <SignUpForm {...props} />
        </PhotosAuthShell>
    );
}

function SignUpPage(): React.JSX.Element {
    if (!featureFlags.enableNewPhotosAuthFlow) {
        return <AccountsSignUpPage />;
    }

    return <AccountsSignUpPage presentation={SignUpPresentation} />;
}

export default SignUpPage;
