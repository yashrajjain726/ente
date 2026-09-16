import { AuthShell } from "@/components/AuthShell";
import { TwoFactorForm } from "ente-accounts/components/auth/TwoFactorForm";
import { withAuthPageShell } from "ente-accounts/components/auth/withAuthPageShell";
import AccountsTwoFactorVerifyPage from "ente-accounts/pages/two-factor/verify";
import type React from "react";

const TwoFactorPresentation = withAuthPageShell(TwoFactorForm, AuthShell);

function TwoFactorVerifyPage(): React.JSX.Element {
    return <AccountsTwoFactorVerifyPage presentation={TwoFactorPresentation} />;
}

export default TwoFactorVerifyPage;
