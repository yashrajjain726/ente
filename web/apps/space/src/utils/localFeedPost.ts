let nextLocalFeedPostID = 0;

export const createLocalFeedPostID = () =>
    `space-local-post-${Date.now()}-${nextLocalFeedPostID++}`;
