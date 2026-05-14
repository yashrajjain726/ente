import { SocialPageMeta } from "components/SocialPageMeta";
import { SocialRouteFallback } from "components/SocialRouteFallback";
import { savedPartialLocalUser } from "ente-accounts-rs/services/accounts-db";
import { isHTTPErrorWithStatus } from "ente-base/http";
import { useRouter } from "next/router";
import React, { useEffect, useState } from "react";
import {
    VerifyTwoFactorScreen,
    verifyTwoFactorBackground,
} from "screens/VerifyTwoFactorScreen";
import { completeSocialLoginSecondFactor } from "services/socialLogin";
import { socialRoutes } from "utils/socialRoutes";

const twoFactorErrorMessage = (error: unknown) => {
    if (isHTTPErrorWithStatus(error, 401)) {
        return "Incorrect code. Please try again.";
    }
    if (isHTTPErrorWithStatus(error, 404)) {
        return "Login session expired. Please sign in again.";
    }
    return error instanceof Error
        ? error.message
        : "Couldn't verify this code. Please try again.";
};

const Page: React.FC = () => {
    const router = useRouter();
    const [twoFactorSessionID, setTwoFactorSessionID] = useState("");
    const [errorMessage, setErrorMessage] = useState<string>();
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        const user = savedPartialLocalUser();
        if (!user?.email || !user.twoFactorSessionID) {
            void router.replace(socialRoutes.login);
            return;
        }

        setTwoFactorSessionID(user.twoFactorSessionID);
    }, [router]);

    const verifySecondFactor = async (code: string) => {
        if (!twoFactorSessionID) return;

        setIsSubmitting(true);
        setErrorMessage(undefined);
        try {
            await completeSocialLoginSecondFactor(code, twoFactorSessionID);
            void router.push(socialRoutes.setupProfile("login"));
        } catch (error) {
            console.error("Social 2FA verification failed", error);
            setErrorMessage(twoFactorErrorMessage(error));
            setIsSubmitting(false);
        }
    };

    if (!twoFactorSessionID) {
        return <SocialRouteFallback background={verifyTwoFactorBackground} />;
    }

    return (
        <>
            <SocialPageMeta themeColor={verifyTwoFactorBackground} />
            <VerifyTwoFactorScreen
                errorMessage={errorMessage}
                isSubmitting={isSubmitting}
                onBack={() => void router.push(socialRoutes.login)}
                onVerify={(code) => void verifySecondFactor(code)}
            />
        </>
    );
};

export default Page;
