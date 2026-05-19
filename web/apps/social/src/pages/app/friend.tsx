import { SocialRouteFallback } from "components/SocialRouteFallback";
import { useRouter } from "next/router";
import React, { useEffect } from "react";
import { friendsBackground } from "screens/FriendsScreen";
import { friendWallIdFromQuery, socialRoutes } from "utils/socialRoutes";

const Page: React.FC = () => {
    const router = useRouter();

    useEffect(() => {
        if (!router.isReady) return;
        const friendID = friendWallIdFromQuery(router.query.friendID);
        void router.replace(
            friendID ? socialRoutes.friend(friendID) : socialRoutes.friends,
        );
    }, [router]);

    return <SocialRouteFallback background={friendsBackground} />;
};

export default Page;
