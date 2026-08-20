import { RecoveryKeyForm } from "@/components/auth/RecoveryKeyForm";
import { PhotosAuthShell } from "@/components/PhotosAuthShell";
import type { RecoveryKeyPresentationProps } from "ente-accounts/components/RecoveryKey";
import AccountsGeneratePage from "ente-accounts/pages/generate";
import type React from "react";

function RecoveryKeyPresentation(
    props: RecoveryKeyPresentationProps,
): React.JSX.Element {
    return (
        <PhotosAuthShell>
            <RecoveryKeyForm {...props} />
        </PhotosAuthShell>
    );
}

function GeneratePage(): React.JSX.Element {
    return (
        <AccountsGeneratePage
            recoveryKeyPresentation={RecoveryKeyPresentation}
        />
    );
}

export default GeneratePage;
