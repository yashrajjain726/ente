export interface FriendProfile {
    avatarObjectID?: string;
    avatarSize?: number;
    avatarUpdatedAt?: string;
    avatarUrl?: string | null;
    coverUrl?: string | null;
    friendsCount: number;
    fullName: string;
    id: string;
    username: string;
    coverObjectID?: string;
    coverUpdatedAt?: string;
    spaceId?: string;
    spaceSlug?: string;
}
