import { PasskeyVerificationForm } from "@/components/auth/PasskeyVerificationForm";
import { PhotosAuthShell } from "@/components/PhotosAuthShell";
import type { AuthPageConfig } from "ente-accounts/components/auth/AuthPageProvider";
import { withAuthPageShell } from "ente-accounts/components/auth/withAuthPageShell";

export const authPageConfig: AuthPageConfig = {
    Shell: PhotosAuthShell,
    passkeyPresentation: withAuthPageShell(
        PasskeyVerificationForm,
        PhotosAuthShell,
    ),
};
