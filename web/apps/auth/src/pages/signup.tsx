import { AuthShell } from "@/components/AuthShell";
import { SignUpForm } from "ente-accounts/components/auth/SignUpForm";
import { withAuthPageShell } from "ente-accounts/components/auth/withAuthPageShell";
import AccountsSignUpPage from "ente-accounts/pages/signup";
import type React from "react";

const SignUpPresentation = withAuthPageShell(SignUpForm, AuthShell);

function SignUpPage(): React.JSX.Element {
    return <AccountsSignUpPage presentation={SignUpPresentation} />;
}

export default SignUpPage;
