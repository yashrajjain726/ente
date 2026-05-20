import { SpaceRouteFallback } from "components/SpaceRouteFallback";
import { useRouter } from "next/router";
import React, { useEffect } from "react";
import { verifyEmailBackground } from "screens/VerifyEmailScreen";
import { completeSpaceLoginPasskey } from "services/spaceLogin";
import { clearPendingSpacePasskeyVerification } from "services/spacePasskeyVerification";
import { useSpaceAppState } from "state/spaceAppState";
import { spaceRoutes } from "utils/spaceRoutes";

const Page: React.FC = () => {
    const router = useRouter();
    const { setPendingPasskeyVerification } = useSpaceAppState();

    useEffect(() => {
        const searchParams = new URLSearchParams(window.location.search);
        const passkeySessionID = searchParams.get("passkeySessionID");
        const response = searchParams.get("response");

        if (!passkeySessionID || !response) {
            void router.replace(spaceRoutes.login);
            return;
        }

        void (async () => {
            try {
                await completeSpaceLoginPasskey(passkeySessionID, response);
                clearPendingSpacePasskeyVerification();
                setPendingPasskeyVerification(null);
                void router.replace(spaceRoutes.setupProfile("login"));
            } catch (error) {
                console.error("Space passkey verification failed", error);
                void router.replace(spaceRoutes.login);
            }
        })();
    }, [router, setPendingPasskeyVerification]);

    return <SpaceRouteFallback background={verifyEmailBackground} />;
};

export default Page;
