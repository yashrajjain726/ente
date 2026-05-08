export interface FriendProfile {
    avatarUrl: string;
    friendsCount: number;
    fullName: string;
    id: string;
    username: string;
}

export const sampleFriends: FriendProfile[] = [
    {
        avatarUrl: "/images/sample-feed-4.jpg",
        friendsCount: 12,
        fullName: "Aparna Bhatnagar",
        id: "aparna-bhatnagar",
        username: "aparnab",
    },
    {
        avatarUrl: "/images/sample-feed-3.jpg",
        friendsCount: 18,
        fullName: "Mira Sen",
        id: "mira-sen",
        username: "mirasen",
    },
    {
        avatarUrl: "/images/sample-feed-5.jpg",
        friendsCount: 9,
        fullName: "Nikhil Rao",
        id: "nikhil-rao",
        username: "nikhilrao",
    },
    {
        avatarUrl: "/images/sample-feed-6.jpg",
        friendsCount: 24,
        fullName: "Riya Kapoor",
        id: "riya-kapoor",
        username: "riyakapoor",
    },
    {
        avatarUrl: "/images/sample-feed-1.jpg",
        friendsCount: 15,
        fullName: "Dev Shah",
        id: "dev-shah",
        username: "devshah",
    },
    {
        avatarUrl: "/images/sample-feed-2.jpg",
        friendsCount: 7,
        fullName: "Isha Mehta",
        id: "isha-mehta",
        username: "ishamehta",
    },
    {
        avatarUrl: "/images/sample-avatar.jpg",
        friendsCount: 21,
        fullName: "Kabir Menon",
        id: "kabir-menon",
        username: "kabirmenon",
    },
];
