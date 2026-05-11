import React from "react";
import { ProfileScreen } from "screens/ProfileScreen";
import type { SetupProfile } from "screens/SetupProfileScreen";

interface PublicProfileScreenProps {
    onAddFriend?: () => void;
    profile: SetupProfile;
}

export const PublicProfileScreen: React.FC<PublicProfileScreenProps> = ({
    onAddFriend,
    profile,
}) => (
    <ProfileScreen
        headerVariant="public"
        onAddFriend={onAddFriend}
        profile={profile}
    />
);
