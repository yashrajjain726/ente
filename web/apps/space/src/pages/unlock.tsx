import { SpacePageMeta } from "components/SpacePageMeta";
import { SpaceRouteFallback } from "components/SpaceRouteFallback";
import { accountLogout } from "ente-accounts-rs/services/logout";
import { useRouter } from "next/router";
import React, { useEffect, useState } from "react";
import {
    LoginScreen,
    loginBackground,
    type SpaceLoginCredentials,
} from "screens/LoginScreen";
import { beginSpaceLogin, type SpaceLoginResult } from "services/spaceLogin";
import { savePendingSpacePasskeyVerification } from "services/spacePasskeyVerification";
import { savedSpaceUnlockEmail } from "services/spaceSession";
import { useSpaceAppState } from "state/spaceAppState";
import { routeAfterCompletedLogin } from "utils/spaceLoginNavigation";
import { spaceRoutes } from "utils/spaceRoutes";

const Page: React.FC = () => {
    const router = useRouter();
    const {
        refreshProfile,
        resetAfterLogout,
        setPendingLoginCredentials,
        setPendingPasskeyVerification,
    } = useSpaceAppState();
    const [email, setEmail] = useState<string>();
    const [unlockError, setUnlockError] = useState<string>();
    const [isSubmitting, setIsSubmitting] = useState(false);

    const unlockErrorMessage = (error: unknown) =>
        error instanceof Error
            ? error.message
            : "Couldn't unlock Space. Please try again.";

    const changeEmail = () => {
        void accountLogout().then(() => {
            resetAfterLogout();
            void router.replace(spaceRoutes.onboarding);
        });
    };

    const handleLoginResult = async (
        result: SpaceLoginResult,
        credentials: SpaceLoginCredentials,
    ) => {
        switch (result.status) {
            case "complete":
                setPendingLoginCredentials(null);
                await routeAfterCompletedLogin(router, refreshProfile);
                break;
            case "email-otp":
                setPendingLoginCredentials({
                    email: result.email,
                    password: credentials.password,
                });
                void router.push(spaceRoutes.verifyLogin);
                break;
            case "totp":
                setPendingLoginCredentials(null);
                void router.push(spaceRoutes.twoFactorVerify);
                break;
            case "passkey":
                setPendingLoginCredentials(null);
                setPendingPasskeyVerification({
                    hasTwoFactorFallback: result.hasTwoFactorFallback,
                    passkeySessionID: result.passkeySessionID,
                    url: result.url,
                });
                savePendingSpacePasskeyVerification({
                    hasTwoFactorFallback: result.hasTwoFactorFallback,
                    passkeySessionID: result.passkeySessionID,
                    url: result.url,
                });
                void router.push(spaceRoutes.passkeysVerify);
                break;
        }
    };

    useEffect(() => {
        if (!router.isReady) return undefined;

        let cancelled = false;
        void savedSpaceUnlockEmail().then((unlockEmail) => {
            if (cancelled) return;
            if (!unlockEmail) {
                void router.replace(spaceRoutes.login);
                return;
            }
            setEmail(unlockEmail);
        });

        return () => {
            cancelled = true;
        };
    }, [router, router.isReady]);

    if (!email) return <SpaceRouteFallback background={loginBackground} />;

    return (
        <>
            <SpacePageMeta themeColor={loginBackground} />
            <LoginScreen
                errorMessage={unlockError}
                initialEmail={email}
                isSubmitting={isSubmitting}
                onBack={changeEmail}
                onChangeEmail={changeEmail}
                onContinue={async (credentials) => {
                    setIsSubmitting(true);
                    setUnlockError(undefined);
                    try {
                        await handleLoginResult(
                            await beginSpaceLogin(credentials),
                            credentials,
                        );
                    } catch (error) {
                        setUnlockError(unlockErrorMessage(error));
                        setIsSubmitting(false);
                    }
                }}
                readOnlyEmail
                title="Unlock Space"
            />
        </>
    );
};

export default Page;
