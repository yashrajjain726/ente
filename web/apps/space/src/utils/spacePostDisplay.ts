import type { SpaceViewerPhoto } from "components/SpaceFileViewer";
import type { ProfilePostGroup } from "screens/ProfileScreen";
import type { SpacePost } from "services/space";

export const spacePostToViewerPhoto = (post: SpacePost): SpaceViewerPhoto => ({
    alt: `${post.name} post`,
    avatarUrl: post.avatarUrl,
    caption: post.caption,
    friendID: post.friendID,
    height: post.height,
    imageUrl: post.imageUrl,
    likeCount: post.likeCount,
    name: post.name,
    postId: post.postId,
    timestampMs: post.timestampMs,
    viewerLiked: post.viewerLiked,
    width: post.width,
});

const profilePostDateLabel = (timestampMs: number) => {
    const date = new Date(timestampMs);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    if (date.toDateString() == today.toDateString()) return "Today";
    if (date.toDateString() == yesterday.toDateString()) return "Yesterday";
    return date.toLocaleDateString(
        typeof navigator == "undefined" ? "en-US" : navigator.language,
        { day: "numeric", month: "short", weekday: "short" },
    );
};

export const profilePostGroupsFromPosts = (
    posts: SpacePost[],
): ProfilePostGroup[] => {
    const groups = new Map<string, ProfilePostGroup>();
    posts.forEach((post) => {
        const label = profilePostDateLabel(post.timestampMs);
        const group = groups.get(label) ?? { items: [], label };
        group.items.push({
            avatarUrl: post.avatarUrl,
            caption: post.caption,
            friendID: post.friendID,
            height: post.height,
            id: String(post.postId),
            imageUrl: post.imageUrl,
            likeCount: post.likeCount,
            name: post.name,
            postId: post.postId,
            timestampMs: post.timestampMs,
            viewerLiked: post.viewerLiked,
            width: post.width,
        });
        groups.set(label, group);
    });
    return [...groups.values()];
};
