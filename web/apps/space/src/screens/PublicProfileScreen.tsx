import React from "react";
import { ProfileScreen, type ProfilePostGroup } from "screens/ProfileScreen";
import type { SetupProfile } from "screens/SetupProfileScreen";
import type { SpacePostAssetURLLoader } from "services/space";

interface PublicProfileScreenProps {
    friendsCount?: number;
    isPostsLoading?: boolean;
    onAddFriend?: () => void;
    onLoadPostImage?: SpacePostAssetURLLoader;
    postGroups?: ProfilePostGroup[];
    profile: SetupProfile;
}

export const PublicProfileScreen: React.FC<PublicProfileScreenProps> = ({
    friendsCount,
    isPostsLoading,
    onAddFriend,
    onLoadPostImage,
    postGroups,
    profile,
}) => (
    <ProfileScreen
        friendsCount={friendsCount}
        headerVariant="public"
        isPostsLoading={isPostsLoading}
        onAddFriend={onAddFriend}
        onLoadPostImage={onLoadPostImage}
        postGroups={postGroups}
        profile={profile}
    />
);
