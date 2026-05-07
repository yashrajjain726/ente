import React from "react";
import { ProfileScreen } from "screens/ProfileScreen";
import type { SetupProfile } from "screens/SetupProfileScreen";

interface PublicProfileScreenProps {
    profile: SetupProfile;
}

export const PublicProfileScreen: React.FC<PublicProfileScreenProps> = ({
    profile,
}) => (
    <ProfileScreen
        headerVariant="public"
        profile={profile}
        onFollow={() => {
            window.location.assign("/");
        }}
    />
);
