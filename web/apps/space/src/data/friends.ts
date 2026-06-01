export interface FriendProfile {
    avatarObjectKey?: string;
    avatarSize?: number;
    avatarUpdatedAt?: string;
    avatarUrl?: string | null;
    coverUrl?: string | null;
    friendsCount: number;
    fullName: string;
    id: string;
    username: string;
    coverObjectKey?: string;
    coverUpdatedAt?: string;
    spaceId?: string;
    spaceSlug?: string;
}
