import { SpacePageMeta } from "components/SpacePageMeta";
import { SpaceRouteFallback } from "components/SpaceRouteFallback";
import React, { useCallback, useEffect, useState } from "react";
import {
    ShareProfileLinkScreen,
    shareProfileLinkBackground,
} from "screens/ShareProfileLinkScreen";
import { createCurrentProfileLink } from "services/space";
import { useSpaceAppState } from "state/spaceAppState";
import { spaceRoutes } from "utils/spaceRoutes";
import { useSpaceRouter } from "utils/spaceRouteTransitions";

const Page: React.FC = () => {
    const router = useSpaceRouter();
    const { profile, profileLoadError, profileLoadStatus } = useSpaceAppState();
    const [profileLink, setProfileLink] = useState<string>();
    const [linkError, setLinkError] = useState<string>();

    useEffect(() => {
        if (profileLoadStatus == "ready" && !profile) {
            void router.replace(spaceRoutes.setupProfile());
        }
    }, [profile, profileLoadStatus, router]);

    const loadInviteLink = useCallback(async () => {
        if (!profile?.spaceId) return;

        setLinkError(undefined);
        try {
            setProfileLink(
                (await createCurrentProfileLink(profile.spaceId)).url,
            );
        } catch (error) {
            console.error("Failed to create space invite link", error);
            setLinkError("Couldn't create invite link. Tap to retry.");
        }
    }, [profile?.spaceId]);

    useEffect(() => {
        if (!profileLink) void loadInviteLink();
    }, [loadInviteLink, profileLink]);

    if (profileLoadStatus != "ready" || !profile) {
        return (
            <SpaceRouteFallback
                background={shareProfileLinkBackground}
                message={profileLoadError}
            />
        );
    }

    return (
        <>
            <SpacePageMeta themeColor={shareProfileLinkBackground} />
            <ShareProfileLinkScreen
                errorMessage={linkError}
                profile={profile}
                onDone={() => void router.push(spaceRoutes.home)}
                onRetry={() => void loadInviteLink()}
                profileLink={profileLink}
            />
        </>
    );
};

export default Page;
