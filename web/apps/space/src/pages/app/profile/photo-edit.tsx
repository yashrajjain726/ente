import { SpacePageMeta } from "components/SpacePageMeta";
import { SpaceRouteFallback } from "components/SpaceRouteFallback";
import React, { useEffect } from "react";
import { EditProfilePhotoScreen } from "screens/EditProfilePhotoScreen";
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
        pendingProfileAvatarFile,
        profile,
        profileLoadError,
        profileLoadStatus,
        setPendingProfileAvatarFile,
        setProfile,
    } = useSpaceAppState();
    const imageFlowSource = profileImageFlowSourceFromQuery(router.query.from);
    const profilePhotoRoute = spaceRoutes.profilePhotoFrom(imageFlowSource);
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
            !pendingProfileAvatarFile
        ) {
            void router.replace(profilePhotoRoute);
        }
    }, [
        pendingProfileAvatarFile,
        profile,
        profileLoadStatus,
        profilePhotoRoute,
        router,
    ]);

    if (profileLoadStatus != "ready" || !profile || !pendingProfileAvatarFile) {
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
            <EditProfilePhotoScreen
                avatarFile={pendingProfileAvatarFile}
                onBack={() => {
                    setPendingProfileAvatarFile(null);
                    void router.push(profilePhotoRoute);
                }}
                onSave={async (avatarFile) => {
                    try {
                        const savedProfile = await saveSpaceProfile({
                            ...profile,
                            avatarFile,
                        });
                        setProfile(savedProfile);
                        await router.push(savedRoute);
                        setPendingProfileAvatarFile(null);
                    } catch (error) {
                        console.error("Space avatar update failed", error);
                        throw new Error(spaceProfileErrorMessage(error), {
                            cause: error,
                        });
                    }
                }}
            />
        </>
    );
};

export default Page;
