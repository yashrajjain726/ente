import { useAuthPageConfig } from "ente-accounts/components/auth/AuthPageProvider";
import { LoginForm } from "ente-accounts/components/auth/LoginForm";
import { AccountsPageContents } from "ente-accounts/components/layouts/centered-paper";
import {
    LoginContents,
    type LoginPresentationProps,
} from "ente-accounts/components/LoginContents";
import { savedPartialLocalUser } from "ente-accounts/services/accounts-db";
import { LoadingIndicator } from "ente-base/components/loaders";
import { customAPIHost } from "ente-base/origins";
import { useRouter } from "next/router";
import React, { useCallback, useEffect, useState } from "react";

export interface LoginPageProps {
    presentation?: React.ComponentType<LoginPresentationProps>;
}

const Page: React.FC<LoginPageProps> = ({ presentation }) => {
    const { Shell, LoginFrame, keepLoginLoadingOnRedirect } =
        useAuthPageConfig();
    const Presentation =
        presentation ?? (Shell ? ConfiguredLoginPresentation : undefined);
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
            if (keepLoginLoadingOnRedirect) return;
        }
        setLoading(false);
    }, [router, refreshHost, keepLoginLoadingOnRedirect]);

    const onSignUp = useCallback(() => void router.push("/signup"), [router]);

    if (loading) return <LoadingIndicator />;

    const contents = Presentation ? (
        <LoginContents {...{ host, onSignUp }} presentation={Presentation} />
    ) : (
        <AccountsPageContents>
            <LoginContents {...{ host, onSignUp }} />
        </AccountsPageContents>
    );

    return LoginFrame ? (
        <LoginFrame onHostChanged={refreshHost}>{contents}</LoginFrame>
    ) : (
        contents
    );
};

export default Page;

function ConfiguredLoginPresentation(
    props: LoginPresentationProps,
): React.JSX.Element {
    // The page selects this presentation only when a shell is configured.
    const Shell = useAuthPageConfig().Shell!;
    return (
        <Shell>
            <LoginForm {...props} />
        </Shell>
    );
}
