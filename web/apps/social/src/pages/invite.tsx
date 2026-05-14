import { SocialPageMeta } from "components/SocialPageMeta";
import { SocialRouteFallback } from "components/SocialRouteFallback";
import { useRouter } from "next/router";
import React, { useEffect } from "react";
import {
    ShareProfileLinkScreen,
    shareProfileLinkBackground,
} from "screens/ShareProfileLinkScreen";
import { useSocialAppState } from "state/socialAppState";
import { socialRoutes } from "utils/socialRoutes";

const Page: React.FC = () => {
    const router = useRouter();
    const { profile, profileLoadStatus } = useSocialAppState();

    useEffect(() => {
        if (profileLoadStatus == "ready" && !profile) {
            void router.replace(socialRoutes.setupProfile("verify"));
        }
    }, [profile, profileLoadStatus, router]);

    if (profileLoadStatus == "loading" || !profile) {
        return <SocialRouteFallback background={shareProfileLinkBackground} />;
    }

    return (
        <>
            <SocialPageMeta themeColor={shareProfileLinkBackground} />
            <ShareProfileLinkScreen
                profile={profile}
                onBack={() =>
                    void router.push(socialRoutes.setupProfile("verify"))
                }
                onDone={() => void router.push(socialRoutes.home)}
            />
        </>
    );
};

export default Page;
