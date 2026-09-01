import { PhotosAuthShell } from "@/components/PhotosAuthShell";
import { featureFlags } from "@/feature-flags";
import type { NewPasswordPresentationProps } from "ente-accounts/components/NewPasswordForm";
import { SetPasswordForm } from "ente-accounts/components/auth/SetPasswordForm";
import AccountsChangePasswordPage from "ente-accounts/pages/change-password";
import type React from "react";

function ResetPasswordPresentation(
    props: NewPasswordPresentationProps,
): React.JSX.Element {
    return (
        <PhotosAuthShell>
            <SetPasswordForm {...props} />
        </PhotosAuthShell>
    );
}

function ChangePasswordPage(): React.JSX.Element {
    if (!featureFlags.enableNewPhotosAuthFlow) {
        return <AccountsChangePasswordPage />;
    }

    return (
        <AccountsChangePasswordPage
            resetPresentation={ResetPasswordPresentation}
        />
    );
}

export default ChangePasswordPage;
