import { SocialPageMeta } from "components/SocialPageMeta";
import { SocialRouteFallback } from "components/SocialRouteFallback";
import { isHTTPErrorWithStatus } from "ente-base/http";
import { useRouter } from "next/router";
import React, { useEffect, useState } from "react";
import {
    VerifyEmailScreen,
    verifyEmailBackground,
} from "screens/VerifyEmailScreen";
import {
    completeSocialLoginEmailVerification,
    resendSocialLoginCode,
    savedPendingSocialLoginCredentials,
    type SocialLoginInput,
    type SocialLoginResult,
} from "services/socialLogin";
import { savePendingSocialPasskeyVerification } from "services/socialPasskeyVerification";
import {
    completeSocialSignup,
    resendSocialSignupCode,
} from "services/socialSignup";
import { useSocialAppState } from "state/socialAppState";
import { socialRoutes, verifyFlowFromQuery } from "utils/socialRoutes";

const verificationErrorMessage = (error: unknown) => {
    if (isHTTPErrorWithStatus(error, 401)) {
        return "Incorrect code. Please try again.";
    }
    if (isHTTPErrorWithStatus(error, 410)) {
        return "This code has expired. Please request a new one.";
    }
    return error instanceof Error
        ? error.message
        : "Couldn't verify this code. Please try again.";
};

const Page: React.FC = () => {
    const router = useRouter();
    const {
        isLiveSignupVerification,
        pendingLoginCredentials,
        setIsLiveSignupVerification,
        setPendingLoginCredentials,
        setPendingPasskeyVerification,
        signupEmail,
    } = useSocialAppState();
    const [verificationError, setVerificationError] = useState<string>();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isResending, setIsResending] = useState(false);
    const [loginCredentials, setLoginCredentials] = useState<
        SocialLoginInput | null
    >(null);
    const verifyFlow = verifyFlowFromQuery(router.query.flow);
    const isLoginVerification = router.isReady && verifyFlow == "login";
    const email = isLoginVerification ? loginCredentials?.email : signupEmail;

    useEffect(() => {
        if (!router.isReady) return undefined;

        if (isLoginVerification) {
            if (pendingLoginCredentials) {
                setLoginCredentials(pendingLoginCredentials);
                return undefined;
            }

            let cancelled = false;
            void savedPendingSocialLoginCredentials().then((credentials) => {
                if (cancelled) return;
                if (!credentials) {
                    void router.replace(socialRoutes.login);
                    return;
                }
                setLoginCredentials(credentials);
                setPendingLoginCredentials(credentials);
            });

            return () => {
                cancelled = true;
            };
        }

        if (!signupEmail) {
            void router.replace(socialRoutes.signup);
        }
        return undefined;
    }, [
        isLoginVerification,
        pendingLoginCredentials,
        router,
        router.isReady,
        setPendingLoginCredentials,
        signupEmail,
    ]);

    const handleLoginResult = (result: SocialLoginResult) => {
        switch (result.status) {
            case "complete":
                setLoginCredentials(null);
                setPendingLoginCredentials(null);
                void router.push(socialRoutes.setupProfile("login"));
                break;
            case "totp":
                setLoginCredentials(null);
                setPendingLoginCredentials(null);
                void router.push(socialRoutes.twoFactorVerify);
                break;
            case "passkey":
                setLoginCredentials(null);
                setPendingLoginCredentials(null);
                setPendingPasskeyVerification({
                    hasTwoFactorFallback: result.hasTwoFactorFallback,
                    passkeySessionID: result.passkeySessionID,
                    url: result.url,
                });
                savePendingSocialPasskeyVerification({
                    hasTwoFactorFallback: result.hasTwoFactorFallback,
                    passkeySessionID: result.passkeySessionID,
                    url: result.url,
                });
                void router.push(socialRoutes.passkeysVerify);
                break;
            case "email-otp":
                setVerificationError("Please enter the latest code we sent.");
                setIsSubmitting(false);
                break;
        }
    };

    const verifySignupEmail = async (code: string) => {
        if (!isLiveSignupVerification) {
            void router.push(socialRoutes.setupProfile("verify"));
            return;
        }

        try {
            await completeSocialSignup(signupEmail, code);
            setIsLiveSignupVerification(false);
            void router.push(socialRoutes.setupProfile("verify"));
        } catch (error) {
            console.error("Social signup verification failed", error);
            setVerificationError(verificationErrorMessage(error));
            setIsSubmitting(false);
        }
    };

    const verifyLoginEmail = async (code: string) => {
        if (!loginCredentials) {
            void router.replace(socialRoutes.login);
            return;
        }

        try {
            handleLoginResult(
                await completeSocialLoginEmailVerification({
                    ...loginCredentials,
                    code,
                }),
            );
        } catch (error) {
            console.error("Social login email verification failed", error);
            setVerificationError(verificationErrorMessage(error));
            setIsSubmitting(false);
        }
    };

    const verifyEmail = (code: string) => {
        setIsSubmitting(true);
        setVerificationError(undefined);
        if (isLoginVerification) void verifyLoginEmail(code);
        else void verifySignupEmail(code);
    };

    const resendVerificationCode = async () => {
        if (!email || isResending) return;

        setIsResending(true);
        setVerificationError(undefined);
        try {
            if (isLoginVerification) await resendSocialLoginCode(email);
            else await resendSocialSignupCode(email);
        } catch (error) {
            console.error("Social verification resend failed", error);
            setVerificationError(
                error instanceof Error
                    ? error.message
                    : "Couldn't resend the code. Please try again.",
            );
        } finally {
            setIsResending(false);
        }
    };

    if (!router.isReady || !email) {
        return <SocialRouteFallback background={verifyEmailBackground} />;
    }

    return (
        <>
            <SocialPageMeta themeColor={verifyEmailBackground} />
            <VerifyEmailScreen
                email={email}
                errorMessage={verificationError}
                initialCode={
                    isLoginVerification || isLiveSignupVerification
                        ? ""
                        : undefined
                }
                isSubmitting={isSubmitting}
                onBack={() =>
                    void router.push(
                        isLoginVerification
                            ? socialRoutes.login
                            : socialRoutes.signup,
                    )
                }
                onChangeEmail={() =>
                    void router.push(
                        isLoginVerification
                            ? socialRoutes.login
                            : socialRoutes.signup,
                    )
                }
                onResendCode={
                    isLoginVerification || isLiveSignupVerification
                        ? () => void resendVerificationCode()
                        : undefined
                }
                onVerify={verifyEmail}
            />
        </>
    );
};

export default Page;
