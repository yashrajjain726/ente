import { AlertCircleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { SpaceActionFeedbackIcon } from "components/ActionFeedback";
import {
    SpaceActionToast,
    spaceToastAutoDismissDurationMs,
} from "components/ActionToast";
import React from "react";
import { useSpaceAppState } from "state/app-state";

const dangerColor = "#F63A3A";

export const SpacePostToast: React.FC = () => {
    const { dismissPostPublishToast, postPublishPhase } = useSpaceAppState();

    if (!postPublishPhase) return null;

    const isPosting = postPublishPhase == "posting";
    const isFailed = postPublishPhase == "failed";
    return (
        <SpaceActionToast
            animateEntrance={isPosting}
            autoDismissAfterMs={
                isPosting ? undefined : spaceToastAutoDismissDurationMs
            }
            closeLabel="Dismiss post status"
            icon={
                isFailed ? (
                    <HugeiconsIcon
                        color={dangerColor}
                        icon={AlertCircleIcon}
                        size={20}
                        strokeWidth={1.8}
                    />
                ) : (
                    <SpaceActionFeedbackIcon
                        phase={isPosting ? "busy" : "done"}
                        size={20}
                    />
                )
            }
            message={isPosting ? "Posting..." : isFailed ? "Failed" : "Posted"}
            onClose={dismissPostPublishToast}
            showCloseButton={false}
            zIndex={1400}
        />
    );
};
