import { SocialRouteFallback } from "components/SocialRouteFallback";
import { useRouter } from "next/router";
import React, { useEffect } from "react";
import { verifyEmailBackground } from "screens/VerifyEmailScreen";
import { completeSocialLoginPasskey } from "services/socialLogin";
import { clearPendingSocialPasskeyVerification } from "services/socialPasskeyVerification";
import { useSocialAppState } from "state/socialAppState";
import { socialRoutes } from "utils/socialRoutes";

const Page: React.FC = () => {
    const router = useRouter();
    const { setPendingPasskeyVerification } = useSocialAppState();

    useEffect(() => {
        const searchParams = new URLSearchParams(window.location.search);
        const passkeySessionID = searchParams.get("passkeySessionID");
        const response = searchParams.get("response");

        if (!passkeySessionID || !response) {
            void router.replace(socialRoutes.login);
            return;
        }

        void (async () => {
            try {
                await completeSocialLoginPasskey(passkeySessionID, response);
                clearPendingSocialPasskeyVerification();
                setPendingPasskeyVerification(null);
                void router.replace(socialRoutes.setupProfile("login"));
            } catch (error) {
                console.error("Social passkey verification failed", error);
                void router.replace(socialRoutes.login);
            }
        })();
    }, [router, setPendingPasskeyVerification]);

    return <SocialRouteFallback background={verifyEmailBackground} />;
};

export default Page;
