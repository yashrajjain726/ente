import { SocialPageMeta } from "components/SocialPageMeta";
import { useRouter } from "next/router";
import React from "react";
import {
    SetupProfileScreen,
    setupProfileBackground,
} from "screens/SetupProfileScreen";
import { useSocialAppState } from "state/socialAppState";
import { setupProfileSourceFromQuery, socialRoutes } from "utils/socialRoutes";

const Page: React.FC = () => {
    const router = useRouter();
    const { onboardingEntrySource, setProfile } = useSocialAppState();
    const backSource = setupProfileSourceFromQuery(router.query.from);
    const isAddFriendLinkOnboarding =
        onboardingEntrySource == "add-friend-link";

    return (
        <>
            <SocialPageMeta themeColor={setupProfileBackground} />
            <SetupProfileScreen
                ctaLabel={isAddFriendLinkOnboarding ? "Done" : "Next"}
                onBack={() =>
                    void router.push(
                        backSource == "login"
                            ? socialRoutes.login
                            : socialRoutes.verify,
                    )
                }
                onContinue={(nextProfile) => {
                    setProfile(nextProfile);
                    void router.push(
                        isAddFriendLinkOnboarding
                            ? socialRoutes.home
                            : socialRoutes.invite,
                    );
                }}
            />
        </>
    );
};

export default Page;
