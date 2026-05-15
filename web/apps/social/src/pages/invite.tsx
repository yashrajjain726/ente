import { SocialPageMeta } from "components/SocialPageMeta";
import { SocialRouteFallback } from "components/SocialRouteFallback";
import { useRouter } from "next/router";
import React, { useCallback, useEffect, useState } from "react";
import {
    ShareProfileLinkScreen,
    shareProfileLinkBackground,
} from "screens/ShareProfileLinkScreen";
import { createCurrentProfileLink } from "services/socialWall";
import { useSocialAppState } from "state/socialAppState";
import { socialRoutes } from "utils/socialRoutes";

const Page: React.FC = () => {
    const router = useRouter();
    const { profile, profileLoadStatus } = useSocialAppState();
    const [profileLink, setProfileLink] = useState<string>();
    const [linkError, setLinkError] = useState<string>();
    const [isLinkLoading, setIsLinkLoading] = useState(false);

    useEffect(() => {
        if (profileLoadStatus == "ready" && !profile) {
            void router.replace(socialRoutes.setupProfile("verify"));
        }
    }, [profile, profileLoadStatus, router]);

    const loadInviteLink = useCallback(async () => {
        if (!profile?.wallId) return;

        setIsLinkLoading(true);
        setLinkError(undefined);
        try {
            setProfileLink((await createCurrentProfileLink(profile.wallId)).url);
        } catch (error) {
            console.error("Failed to create social invite link", error);
            setLinkError("Couldn't create invite link. Tap to retry.");
        } finally {
            setIsLinkLoading(false);
        }
    }, [profile?.wallId]);

    useEffect(() => {
        if (!profileLink) void loadInviteLink();
    }, [loadInviteLink, profileLink]);

    if (profileLoadStatus == "loading" || !profile) {
        return <SocialRouteFallback background={shareProfileLinkBackground} />;
    }

    return (
        <>
            <SocialPageMeta themeColor={shareProfileLinkBackground} />
            <ShareProfileLinkScreen
                errorMessage={linkError}
                isLinkLoading={isLinkLoading}
                profile={profile}
                onBack={() =>
                    void router.push(socialRoutes.setupProfile("verify"))
                }
                onDone={() => void router.push(socialRoutes.home)}
                onRetry={() => void loadInviteLink()}
                profileLink={profileLink}
            />
        </>
    );
};

export default Page;
