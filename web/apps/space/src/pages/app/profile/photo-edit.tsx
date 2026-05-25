import { SpacePageMeta } from "components/SpacePageMeta";
import { SpaceRouteFallback } from "components/SpaceRouteFallback";
import { useRouter } from "next/router";
import React, { useEffect } from "react";
import { EditProfilePhotoScreen } from "screens/EditProfilePhotoScreen";
import { profileBackground } from "screens/ProfileScreen";
import {
    saveSpaceProfile,
    spaceProfileErrorMessage,
} from "services/spaceProfile";
import { useSpaceAppState } from "state/spaceAppState";
import { spaceRoutes } from "utils/spaceRoutes";

const Page: React.FC = () => {
    const router = useRouter();
    const {
        pendingProfileAvatarFile,
        profile,
        profileLoadError,
        profileLoadStatus,
        setPendingProfileAvatarFile,
        setProfile,
    } = useSpaceAppState();

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
            void router.replace(spaceRoutes.profilePhoto);
        }
    }, [pendingProfileAvatarFile, profile, profileLoadStatus, router]);

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
                    void router.push(spaceRoutes.profilePhoto);
                }}
                onSave={async (avatarFile) => {
                    try {
                        const savedProfile = await saveSpaceProfile({
                            ...profile,
                            avatarFile,
                        });
                        setProfile(savedProfile);
                        await router.push(spaceRoutes.profile);
                        setPendingProfileAvatarFile(null);
                    } catch (error) {
                        console.error("Space avatar update failed", error);
                        throw new Error(spaceProfileErrorMessage(error));
                    }
                }}
            />
        </>
    );
};

export default Page;
