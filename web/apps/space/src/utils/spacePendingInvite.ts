import { joinSpaceInvite } from "services/space";
import {
    clearPendingSpaceInvite,
    clearPendingSpaceInviteFriend,
    saveAcceptedSpaceInviteFriend,
    savedPendingSpaceInvite,
    savedPendingSpaceInviteFriend,
} from "services/spaceInvite";

export const acceptPendingSpaceInvite = async () => {
    const pendingInvite = savedPendingSpaceInvite();
    if (!pendingInvite) return false;

    const pendingFriend = savedPendingSpaceInviteFriend() ?? {
        fullName: "",
        username: pendingInvite.spaceUsername,
    };
    await joinSpaceInvite(pendingInvite);
    clearPendingSpaceInvite();
    clearPendingSpaceInviteFriend();
    saveAcceptedSpaceInviteFriend(pendingFriend);
    return true;
};
