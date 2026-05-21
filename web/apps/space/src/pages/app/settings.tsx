import { SpacePageMeta } from "components/SpacePageMeta";
import { SpaceRouteFallback } from "components/SpaceRouteFallback";
import { accountLogout } from "ente-accounts-rs/services/logout";
import { useRouter } from "next/router";
import React, { useEffect } from "react";
import { SettingsScreen, settingsBackground } from "screens/SettingsScreen";
import { useSpaceAppState } from "state/spaceAppState";
import { spaceRoutes } from "utils/spaceRoutes";

const Page: React.FC = () => {
    const router = useRouter();
    const {
        profile,
        profileLoadError,
        profileLoadStatus,
        refreshProfile,
        resetAfterLogout,
    } = useSpaceAppState();

    useEffect(() => {
        if (profileLoadStatus == "ready" && !profile) {
            void router.replace(spaceRoutes.onboarding);
        }
    }, [profile, profileLoadStatus, router]);

    if (profileLoadStatus != "ready" || !profile) {
        return (
            <SpaceRouteFallback
                actionLabel={profileLoadStatus == "error" ? "Retry" : undefined}
                background={settingsBackground}
                message={profileLoadError}
                onAction={() => void refreshProfile()}
            />
        );
    }

    return (
        <>
            <SpacePageMeta themeColor={settingsBackground} />
            <SettingsScreen
                onBack={() => void router.push(spaceRoutes.profile)}
                onLogout={() => {
                    void accountLogout().then(() => {
                        resetAfterLogout();
                        void router.push(spaceRoutes.onboarding);
                    });
                }}
            />
        </>
    );
};

export default Page;
