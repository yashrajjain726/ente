import { AuthShell } from "@/components/AuthShell";
import { RecoverAccountForm } from "ente-accounts/components/auth/RecoveryForm";
import { withAuthPageShell } from "ente-accounts/components/auth/withAuthPageShell";
import AccountsRecoverPage from "ente-accounts/pages/recover";
import type React from "react";

const RecoverAccountPresentation = withAuthPageShell(
    RecoverAccountForm,
    AuthShell,
    420,
);

function RecoverPage(): React.JSX.Element {
    return <AccountsRecoverPage presentation={RecoverAccountPresentation} />;
}

export default RecoverPage;
