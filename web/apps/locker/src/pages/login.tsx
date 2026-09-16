import { LockerAuthShell } from "@/components/auth/LockerAuthShell";
import { LoginForm } from "ente-accounts/components/auth/LoginForm";
import { withAuthPageShell } from "ente-accounts/components/auth/withAuthPageShell";
import { LoginContents } from "ente-accounts/components/LoginContents";
import { savedPartialLocalUser } from "ente-accounts/services/accounts-db";
import { LoadingIndicator } from "ente-base/components/loaders";
import { customAPIHost } from "ente-base/origins";
import { useRouter } from "next/router";
import React, { useCallback, useEffect, useState } from "react";

const LoginPresentation = withAuthPageShell(LoginForm, LockerAuthShell);

function LoginPage(): React.JSX.Element {
    const [loading, setLoading] = useState(true);
    const [host, setHost] = useState<string | undefined>(undefined);

    const router = useRouter();

    const refreshHost = useCallback(
        () => void customAPIHost().then(setHost),
        [],
    );

    useEffect(() => {
        refreshHost();
        if (savedPartialLocalUser()?.email) {
            void router.replace("/verify");
            return;
        }
        setLoading(false);
    }, [router, refreshHost]);

    const onSignUp = useCallback(() => void router.push("/signup"), [router]);

    return loading ? (
        <LoadingIndicator />
    ) : (
        <LoginContents
            {...{ host, onSignUp }}
            presentation={LoginPresentation}
        />
    );
}

export default LoginPage;
