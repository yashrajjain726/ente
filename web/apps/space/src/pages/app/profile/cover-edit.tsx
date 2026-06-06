import { SpacePageMeta } from "components/SpacePageMeta";
import { SpaceRouteFallback } from "components/SpaceRouteFallback";
import React, { useEffect } from "react";
import { EditProfileCoverScreen } from "screens/EditProfilePhotoScreen";
import { profileBackground } from "screens/ProfileScreen";
import {
    saveSpaceProfile,
    spaceProfileErrorMessage,
} from "services/spaceProfile";
import { useSpaceAppState } from "state/spaceAppState";
import {
    profileImageFlowSourceFromQuery,
    spaceRoutes,
} from "utils/spaceRoutes";
import { useSpaceRouter } from "utils/spaceRouteTransitions";

const Page: React.FC = () => {
    const router = useSpaceRouter();
    const {
        pendingProfileCoverFile,
        profile,
        profileLoadError,
        profileLoadStatus,
        setPendingProfileCoverFile,
        setProfile,
    } = useSpaceAppState();
    const imageFlowSource = profileImageFlowSourceFromQuery(router.query.from);
    const profileCoverRoute = spaceRoutes.profileCoverFrom(imageFlowSource);
    const savedRoute =
        imageFlowSource == "settings"
            ? spaceRoutes.settingsProfile
            : spaceRoutes.profile;

    useEffect(() => {
        if (profileLoadStatus == "ready" && !profile) {
            void router.replace(spaceRoutes.onboarding);
        }
    }, [profile, profileLoadStatus, router]);

    useEffect(() => {
        if (
            profileLoadStatus == "ready" &&
            profile &&
            !pendingProfileCoverFile
        ) {
            void router.replace(profileCoverRoute);
        }
    }, [
        pendingProfileCoverFile,
        profile,
        profileCoverRoute,
        profileLoadStatus,
        router,
    ]);

    if (profileLoadStatus != "ready" || !profile || !pendingProfileCoverFile) {
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
            <EditProfileCoverScreen
                coverFile={pendingProfileCoverFile}
                onBack={() => {
                    setPendingProfileCoverFile(null);
                    void router.push(profileCoverRoute);
                }}
                onSave={async (coverFile) => {
                    try {
                        const savedProfile = await saveSpaceProfile({
                            ...profile,
                            coverFile,
                        });
                        setProfile(savedProfile);
                        await router.push(savedRoute);
                        setPendingProfileCoverFile(null);
                    } catch (error) {
                        console.error("Space cover update failed", error);
                        throw new Error(spaceProfileErrorMessage(error));
                    }
                }}
            />
        </>
    );
};

export default Page;
