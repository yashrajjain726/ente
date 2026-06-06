import { SpacePageMeta } from "components/SpacePageMeta";
import { SpaceRouteFallback } from "components/SpaceRouteFallback";
import React, { useEffect } from "react";
import { ProfileImageViewerScreen } from "screens/ProfileImageViewerScreen";
import { profileBackground } from "screens/ProfileScreen";
import { useSpaceAppState } from "state/spaceAppState";
import {
    profileImageFlowSourceFromQuery,
    spaceRoutes,
} from "utils/spaceRoutes";
import { useSpaceRouter } from "utils/spaceRouteTransitions";

const Page: React.FC = () => {
    const router = useSpaceRouter();
    const {
        profile,
        profileLoadError,
        profileLoadStatus,
        setPendingProfileCoverFile,
    } = useSpaceAppState();
    const imageFlowSource = profileImageFlowSourceFromQuery(router.query.from);
    const backRoute =
        imageFlowSource == "settings"
            ? spaceRoutes.settingsProfile
            : spaceRoutes.profile;

    useEffect(() => {
        if (profileLoadStatus == "ready" && !profile) {
            void router.replace(spaceRoutes.onboarding);
        }
    }, [profile, profileLoadStatus, router]);

    if (profileLoadStatus != "ready" || !profile) {
        return (
            <SpaceRouteFallback
                background={profileBackground}
                message={profileLoadError}
            />
        );
    }

    return (
        <>
            <SpacePageMeta themeColor={profileBackground} />
            <ProfileImageViewerScreen
                profile={profile}
                variant="cover"
                onBack={() => void router.push(backRoute)}
                onSelectFile={(file) => {
                    setPendingProfileCoverFile(file);
                    void router.push(
                        spaceRoutes.editProfileCoverFrom(imageFlowSource),
                    );
                }}
            />
        </>
    );
};

export default Page;
