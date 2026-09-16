import { LockerAuthShell } from "@/components/auth/LockerAuthShell";
import { RecoverAccountForm } from "ente-accounts/components/auth/RecoveryForm";
import { withAuthPageShell } from "ente-accounts/components/auth/withAuthPageShell";
import AccountsRecoverPage from "ente-accounts/pages/recover";
import type React from "react";

const RecoverAccountPresentation = withAuthPageShell(
    RecoverAccountForm,
    LockerAuthShell,
    420,
);

function RecoverPage(): React.JSX.Element {
    return <AccountsRecoverPage presentation={RecoverAccountPresentation} />;
}

export default RecoverPage;
