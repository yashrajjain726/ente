import { AuthShell } from "@/components/AuthShell";
import { featureFlags } from "@/feature-flags";
import { SignUpForm } from "ente-accounts/components/auth/SignUpForm";
import type { SignUpPresentationProps } from "ente-accounts/components/SignUpContents";
import AccountsSignUpPage from "ente-accounts/pages/signup";
import type React from "react";

function SignUpPresentation(props: SignUpPresentationProps): React.JSX.Element {
    return (
        <AuthShell>
            <SignUpForm {...props} />
        </AuthShell>
    );
}

function SignUpPage(): React.JSX.Element {
    if (!featureFlags.enableNewAuthFlow) {
        return <AccountsSignUpPage />;
    }

    return <AccountsSignUpPage presentation={SignUpPresentation} />;
}

export default SignUpPage;
