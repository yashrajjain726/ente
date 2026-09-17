import { useAuthPageConfig } from "ente-accounts/components/auth/AuthPageProvider";
import { SignUpForm } from "ente-accounts/components/auth/SignUpForm";
import {
    SignUpContents,
    type SignUpPresentationProps,
} from "ente-accounts/components/SignUpContents";
import { savedPartialLocalUser } from "ente-accounts/services/accounts-db";
import { LoadingIndicator } from "ente-base/components/loaders";
import { customAPIHost } from "ente-base/origins";
import { useRouter } from "next/router";
import React, { useCallback, useEffect, useState } from "react";

const Page: React.FC = () => {
    const [loading, setLoading] = useState(true);
    const [host, setHost] = useState<string | undefined>(undefined);

    const router = useRouter();

    useEffect(() => {
        void customAPIHost().then(setHost);
        if (savedPartialLocalUser()?.email) void router.replace("/verify");
        setLoading(false);
    }, [router]);

    const onLogin = useCallback(() => void router.push("/login"), [router]);

    return loading ? (
        <LoadingIndicator />
    ) : (
        <SignUpContents
            {...{ router, host, onLogin }}
            presentation={ConfiguredSignUpPresentation}
        />
    );
};

export default Page;

function ConfiguredSignUpPresentation(
    props: SignUpPresentationProps,
): React.JSX.Element {
    const { Shell } = useAuthPageConfig();
    return (
        <Shell>
            <SignUpForm {...props} />
        </Shell>
    );
}
