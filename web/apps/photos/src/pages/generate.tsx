import { PhotosAuthShell } from "@/components/PhotosAuthShell";
import { RecoveryKeyForm } from "ente-accounts/components/auth/RecoveryKeyForm";
import { SetPasswordForm } from "ente-accounts/components/auth/SetPasswordForm";
import { withAuthPageShell } from "ente-accounts/components/auth/withAuthPageShell";
import AccountsGeneratePage from "ente-accounts/pages/generate";
import { useRouter } from "next/router";
import type React from "react";

const RecoveryKeyPresentation = withAuthPageShell(
    RecoveryKeyForm,
    PhotosAuthShell,
);

const SetPasswordPresentation = withAuthPageShell(
    SetPasswordForm,
    PhotosAuthShell,
);

function GeneratePage(): React.JSX.Element {
    const router = useRouter();

    function handleRecoveryKeyClose() {
        void router.push("/plan");
    }

    return (
        <AccountsGeneratePage
            passwordPresentation={SetPasswordPresentation}
            recoveryKeyPresentation={RecoveryKeyPresentation}
            onRecoveryKeyClose={handleRecoveryKeyClose}
        />
    );
}

export default GeneratePage;
