import { SpaceActionFeedbackIcon } from "components/ActionFeedback";
import { SpaceActionToast } from "components/ActionToast";
import React from "react";
import { useSpaceAppState } from "state/app-state";

const postedToastDurationMs = 2400;

export const SpacePostToast: React.FC = () => {
    const { dismissPostPublishToast, postPublishPhase } = useSpaceAppState();

    React.useEffect(() => {
        if (postPublishPhase != "posted") return;

        const timeoutID = window.setTimeout(
            dismissPostPublishToast,
            postedToastDurationMs,
        );
        return () => window.clearTimeout(timeoutID);
    }, [dismissPostPublishToast, postPublishPhase]);

    if (!postPublishPhase) return null;

    const isPosting = postPublishPhase == "posting";
    return (
        <SpaceActionToast
            animateEntrance={isPosting}
            closeLabel="Dismiss post status"
            icon={
                <SpaceActionFeedbackIcon
                    phase={isPosting ? "busy" : "done"}
                    size={20}
                />
            }
            message={isPosting ? "Posting..." : "Posted"}
            onClose={dismissPostPublishToast}
            zIndex={1400}
        />
    );
};
