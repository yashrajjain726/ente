import { SocialPageMeta } from "components/SocialPageMeta";
import { SocialRouteFallback } from "components/SocialRouteFallback";
import { savedPartialLocalUser } from "ente-accounts-rs/services/accounts-db";
import { openPasskeyVerificationURL } from "ente-accounts-rs/services/passkey";
import { useRouter } from "next/router";
import React, { useEffect, useState } from "react";
import {
    PasskeyVerificationScreen,
    passkeyVerificationBackground,
    type PasskeyVerificationStatus,
} from "screens/PasskeyVerificationScreen";
import {
    checkSocialLoginPasskeyStatus,
    socialLoginPasskeySessionExpiredErrorMessage,
    useSocialLoginTwoFactorInstead,
} from "services/socialLogin";
import {
    clearPendingSocialPasskeyVerification,
    hasAutoOpenedSocialPasskeyVerification,
    markAutoOpenedSocialPasskeyVerification,
    savedPendingSocialPasskeyVerification,
    type PendingSocialPasskeyVerification,
} from "services/socialPasskeyVerification";
import { useSocialAppState } from "state/socialAppState";
import { socialRoutes } from "utils/socialRoutes";

const passkeyErrorMessage = (error: unknown) => {
    if (
        error instanceof Error &&
        error.message == socialLoginPasskeySessionExpiredErrorMessage
    ) {
        return "Passkey session expired. Please sign in again.";
    }
    return error instanceof Error
        ? error.message
        : "Couldn't check passkey status. Please try again.";
};

const Page: React.FC = () => {
    const router = useRouter();
    const { pendingPasskeyVerification, setPendingPasskeyVerification } =
        useSocialAppState();
    const [verification, setVerification] =
        useState<PendingSocialPasskeyVerification>();
    const [status, setStatus] = useState<PasskeyVerificationStatus>("waiting");
    const [errorMessage, setErrorMessage] = useState<string>();

    useEffect(() => {
        const nextVerification =
            pendingPasskeyVerification ??
            savedPendingSocialPasskeyVerification();
        const user = savedPartialLocalUser();

        if (
            !nextVerification ||
            !user?.email ||
            user.passkeySessionID != nextVerification.passkeySessionID
        ) {
            void router.replace(socialRoutes.login);
            return;
        }

        setVerification(nextVerification);
        setPendingPasskeyVerification(nextVerification);

        if (
            !hasAutoOpenedSocialPasskeyVerification(
                nextVerification.passkeySessionID,
            )
        ) {
            markAutoOpenedSocialPasskeyVerification(
                nextVerification.passkeySessionID,
            );
            openPasskeyVerificationURL(nextVerification);
        }
    }, [pendingPasskeyVerification, router, setPendingPasskeyVerification]);

    const clearPasskeyVerification = () => {
        clearPendingSocialPasskeyVerification();
        setPendingPasskeyVerification(null);
    };

    const tryAgain = () => {
        if (!verification) return;
        setStatus("waiting");
        setErrorMessage(undefined);
        openPasskeyVerificationURL(verification);
    };

    const checkStatus = async () => {
        if (!verification || status == "checking") return;

        setStatus("checking");
        setErrorMessage(undefined);
        try {
            const result = await checkSocialLoginPasskeyStatus(
                verification.passkeySessionID,
            );
            if (result.status == "pending") {
                setStatus("pending");
                return;
            }

            clearPasskeyVerification();
            void router.push(socialRoutes.setupProfile("login"));
        } catch (error) {
            console.error("Social passkey status check failed", error);
            setErrorMessage(passkeyErrorMessage(error));
            setStatus("waiting");
        }
    };

    const useTwoFactor = () => {
        useSocialLoginTwoFactorInstead();
        clearPasskeyVerification();
        void router.push(socialRoutes.twoFactorVerify);
    };

    if (!verification) {
        return (
            <SocialRouteFallback background={passkeyVerificationBackground} />
        );
    }

    return (
        <>
            <SocialPageMeta themeColor={passkeyVerificationBackground} />
            <PasskeyVerificationScreen
                canUseTwoFactor={verification.hasTwoFactorFallback}
                errorMessage={errorMessage}
                onBack={() => void router.push(socialRoutes.login)}
                onCheckStatus={() => void checkStatus()}
                onTryAgain={tryAgain}
                onUseTwoFactor={useTwoFactor}
                status={status}
            />
        </>
    );
};

export default Page;
