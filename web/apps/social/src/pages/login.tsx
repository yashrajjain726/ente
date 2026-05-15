import { SocialPageMeta } from "components/SocialPageMeta";
import { useRouter } from "next/router";
import React, { useState } from "react";
import {
    LoginScreen,
    loginBackground,
    type SocialLoginCredentials,
} from "screens/LoginScreen";
import { beginSocialLogin, type SocialLoginResult } from "services/socialLogin";
import { savePendingSocialPasskeyVerification } from "services/socialPasskeyVerification";
import { useSocialAppState } from "state/socialAppState";
import { socialRoutes } from "utils/socialRoutes";

const Page: React.FC = () => {
    const router = useRouter();
    const { setPendingLoginCredentials, setPendingPasskeyVerification } =
        useSocialAppState();
    const [loginError, setLoginError] = useState<string>();
    const [isSubmitting, setIsSubmitting] = useState(false);

    const loginErrorMessage = (error: unknown) =>
        error instanceof Error
            ? error.message
            : "Couldn't sign in. Please try again.";

    const handleLoginResult = (
        result: SocialLoginResult,
        credentials: SocialLoginCredentials,
    ) => {
        switch (result.status) {
            case "complete":
                setPendingLoginCredentials(null);
                void router.push(socialRoutes.setupProfile("login"));
                break;
            case "email-otp":
                setPendingLoginCredentials({
                    email: result.email,
                    password: credentials.password,
                });
                void router.push(socialRoutes.verifyLogin);
                break;
            case "totp":
                setPendingLoginCredentials(null);
                void router.push(socialRoutes.twoFactorVerify);
                break;
            case "passkey":
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
        }
    };

    return (
        <>
            <SocialPageMeta themeColor={loginBackground} />
            <LoginScreen
                errorMessage={loginError}
                isSubmitting={isSubmitting}
                onBack={() => void router.push(socialRoutes.onboarding)}
                onContinue={async (credentials) => {
                    setIsSubmitting(true);
                    setLoginError(undefined);
                    try {
                        handleLoginResult(
                            await beginSocialLogin(credentials),
                            credentials,
                        );
                    } catch (error) {
                        setLoginError(loginErrorMessage(error));
                        setIsSubmitting(false);
                    }
                }}
            />
        </>
    );
};

export default Page;
