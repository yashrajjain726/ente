import { useAuthPageConfig } from "ente-accounts/components/auth/AuthPageProvider";
import { LoginForm } from "ente-accounts/components/auth/LoginForm";
import {
    LoginContents,
    type LoginPresentationProps,
} from "ente-accounts/components/LoginContents";
import { savedPartialLocalUser } from "ente-accounts/services/accounts-db";
import { LoadingIndicator } from "ente-base/components/loaders";
import { customAPIHost } from "ente-base/origins";
import { useRouter } from "next/router";
import React, { useCallback, useEffect, useState } from "react";

const Page: React.FC = () => {
    const { LoginFrame, keepLoginLoadingOnRedirect } = useAuthPageConfig();
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

    const contents = (
        <LoginContents
            {...{ host, onSignUp }}
            presentation={ConfiguredLoginPresentation}
        />
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
    const { Shell } = useAuthPageConfig();
    return (
        <Shell>
            <LoginForm {...props} />
        </Shell>
    );
}
