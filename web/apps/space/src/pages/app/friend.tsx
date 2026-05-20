import { SpaceRouteFallback } from "components/SpaceRouteFallback";
import { useRouter } from "next/router";
import React, { useEffect } from "react";
import { friendsBackground } from "screens/FriendsScreen";
import { friendSpaceIdFromQuery, spaceRoutes } from "utils/spaceRoutes";

const Page: React.FC = () => {
    const router = useRouter();

    useEffect(() => {
        if (!router.isReady) return;
        const friendID = friendSpaceIdFromQuery(router.query.friendID);
        void router.replace(
            friendID ? spaceRoutes.friend(friendID) : spaceRoutes.friends,
        );
    }, [router]);

    return <SpaceRouteFallback background={friendsBackground} />;
};

export default Page;
