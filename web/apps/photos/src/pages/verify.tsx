import { VerifyEmailForm } from "@/components/auth/VerifyEmailForm";
import { PhotosAuthShell } from "@/components/PhotosAuthShell";
import AccountsVerifyPage, {
    type VerifyEmailPresentationProps,
} from "ente-accounts/pages/verify";
import type React from "react";

function VerifyEmailPresentation(
    props: VerifyEmailPresentationProps,
): React.JSX.Element {
    return (
        <PhotosAuthShell>
            <VerifyEmailForm {...props} />
        </PhotosAuthShell>
    );
}

function VerifyPage(): React.JSX.Element {
    return <AccountsVerifyPage presentation={VerifyEmailPresentation} />;
}

export default VerifyPage;
