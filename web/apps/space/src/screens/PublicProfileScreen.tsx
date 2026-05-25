import React from "react";
import { ProfileScreen, type ProfilePostGroup } from "screens/ProfileScreen";
import type { SetupProfile } from "screens/SetupProfileScreen";

interface PublicProfileScreenProps {
    friendsCount?: number;
    isPostsLoading?: boolean;
    onAddFriend?: () => void;
    postGroups?: ProfilePostGroup[];
    profile: SetupProfile;
}

export const PublicProfileScreen: React.FC<PublicProfileScreenProps> = ({
    friendsCount,
    isPostsLoading,
    onAddFriend,
    postGroups,
    profile,
}) => (
    <ProfileScreen
        friendsCount={friendsCount}
        headerVariant="public"
        isPostsLoading={isPostsLoading}
        onAddFriend={onAddFriend}
        postGroups={postGroups}
        profile={profile}
    />
);
