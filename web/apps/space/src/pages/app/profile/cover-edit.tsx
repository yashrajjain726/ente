import { SpacePageMeta } from "components/SpacePageMeta";
import { SpaceRouteFallback } from "components/SpaceRouteFallback";
import { useRouter } from "next/router";
import React, { useEffect } from "react";
import { EditProfileCoverScreen } from "screens/EditProfilePhotoScreen";
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
        pendingProfileCoverFile,
        profile,
        profileLoadError,
        profileLoadStatus,
        setPendingProfileCoverFile,
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
            !pendingProfileCoverFile
        ) {
            void router.replace(spaceRoutes.profileCover);
        }
    }, [pendingProfileCoverFile, profile, profileLoadStatus, router]);

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
                    void router.push(spaceRoutes.profileCover);
                }}
                onSave={async (coverFile) => {
                    try {
                        const savedProfile = await saveSpaceProfile({
                            ...profile,
                            coverFile,
                        });
                        setProfile(savedProfile);
                        await router.push(spaceRoutes.profile);
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
