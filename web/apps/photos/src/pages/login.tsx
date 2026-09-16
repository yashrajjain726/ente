import { PhotosAuthShell } from "@/components/PhotosAuthShell";
import { LoginForm } from "ente-accounts/components/auth/LoginForm";
import { withAuthPageShell } from "ente-accounts/components/auth/withAuthPageShell";
import AccountsLoginPage from "ente-accounts/pages/login";
import type React from "react";

const LoginPresentation = withAuthPageShell(LoginForm, PhotosAuthShell);

function LoginPage(): React.JSX.Element {
    return <AccountsLoginPage presentation={LoginPresentation} />;
}

export default LoginPage;
