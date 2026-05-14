import { SocialPageMeta } from "components/SocialPageMeta";
import { SocialRouteFallback } from "components/SocialRouteFallback";
import { accountLogout } from "ente-accounts-rs/services/logout";
import { useRouter } from "next/router";
import React, { useEffect } from "react";
import { SettingsScreen, settingsBackground } from "screens/SettingsScreen";
import { useSocialAppState } from "state/socialAppState";
import { socialRoutes } from "utils/socialRoutes";

const Page: React.FC = () => {
    const router = useRouter();
    const { profile, profileLoadStatus, resetAfterLogout } =
        useSocialAppState();

    useEffect(() => {
        if (profileLoadStatus == "ready" && !profile) {
            void router.replace(socialRoutes.onboarding);
        }
    }, [profile, profileLoadStatus, router]);

    if (profileLoadStatus == "loading" || !profile) {
        return <SocialRouteFallback background={settingsBackground} />;
    }

    return (
        <>
            <SocialPageMeta themeColor={settingsBackground} />
            <SettingsScreen
                onBack={() => void router.push(socialRoutes.profile)}
                onLogout={() => {
                    void accountLogout().then(() => {
                        resetAfterLogout();
                        void router.push(socialRoutes.onboarding);
                    });
                }}
            />
        </>
    );
};

export default Page;
