import { SpacePageMeta } from "components/SpacePageMeta";
import { SpaceRouteFallback } from "components/SpaceRouteFallback";
import { useRouter } from "next/router";
import React, { useEffect } from "react";
import { ProfileImageViewerScreen } from "screens/ProfileImageViewerScreen";
import { profileBackground } from "screens/ProfileScreen";
import { useSpaceAppState } from "state/spaceAppState";
import { spaceRoutes } from "utils/spaceRoutes";

const Page: React.FC = () => {
    const router = useRouter();
    const {
        profile,
        profileLoadError,
        profileLoadStatus,
        setPendingProfileCoverFile,
    } = useSpaceAppState();

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
                onBack={() => void router.push(spaceRoutes.profile)}
                onSelectFile={(file) => {
                    setPendingProfileCoverFile(file);
                    void router.push(spaceRoutes.editProfileCover);
                }}
            />
        </>
    );
};

export default Page;
