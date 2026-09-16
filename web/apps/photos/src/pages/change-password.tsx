import { PhotosAuthShell } from "@/components/PhotosAuthShell";
import { SetPasswordForm } from "ente-accounts/components/auth/SetPasswordForm";
import { withAuthPageShell } from "ente-accounts/components/auth/withAuthPageShell";
import AccountsChangePasswordPage from "ente-accounts/pages/change-password";
import type React from "react";

const ResetPasswordPresentation = withAuthPageShell(
    SetPasswordForm,
    PhotosAuthShell,
);

function ChangePasswordPage(): React.JSX.Element {
    return (
        <AccountsChangePasswordPage
            resetPresentation={ResetPasswordPresentation}
        />
    );
}

export default ChangePasswordPage;
