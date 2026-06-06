import { SpacePageMeta } from "components/SpacePageMeta";
import { SpaceRouteFallback } from "components/SpaceRouteFallback";
import { useRouter } from "next/router";
import React, { useEffect } from "react";
import { SettingsScreen, settingsBackground } from "screens/SettingsScreen";
import { spaceLogout } from "services/spaceLogout";
import { useSpaceAppState } from "state/spaceAppState";
import { spaceRoutes } from "utils/spaceRoutes";

const Page: React.FC = () => {
    const router = useRouter();
    const { profile, profileLoadError, profileLoadStatus, resetAfterLogout } =
        useSpaceAppState();

    useEffect(() => {
        if (profileLoadStatus == "ready" && !profile) {
            void router.replace(spaceRoutes.onboarding);
        }
    }, [profile, profileLoadStatus, router]);

    if (profileLoadStatus != "ready" || !profile) {
        return (
            <SpaceRouteFallback
                background={settingsBackground}
                message={profileLoadError}
            />
        );
    }

    return (
        <>
            <SpacePageMeta themeColor={settingsBackground} />
            <SettingsScreen
                onBack={() => void router.push(spaceRoutes.profile)}
                onOpenProfile={() =>
                    void router.push(spaceRoutes.settingsProfile)
                }
                onLogout={() => {
                    void spaceLogout().then(() => {
                        resetAfterLogout();
                        void router.push(spaceRoutes.onboarding);
                    });
                }}
            />
        </>
    );
};

export default Page;
