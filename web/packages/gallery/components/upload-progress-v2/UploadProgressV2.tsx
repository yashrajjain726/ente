import type { PreUploadSkippedFile } from "ente-base/types/ipc";
import type { UploadPhase } from "ente-gallery/services/upload";
import { useCallback, useMemo, useState } from "react";
import { UploadCompletionV2 } from "../UploadCompletionV2";
import type {
    InProgressUpload,
    SegregatedFinishedUploads,
    UploadCounter,
    UploadFileNames,
} from "../uploadProgressStats";
import { UploadProgressContext, type DragPosition } from "./context";
import { MinimizedUploadProgress } from "./MinimizedUploadProgress";
import { StopUploadConfirmationDialog } from "./StopUploadConfirmationDialog";
import { UploadProgressDialog } from "./UploadProgressDialog";

interface UploadProgressProps {
    open: boolean;
    onClose: () => void;
    uploadCounter: UploadCounter;
    uploadPhase: UploadPhase;
    percentComplete: number;
    retryFailed: () => void;
    inProgressUploads: InProgressUpload[];
    uploadFileNames: UploadFileNames;
    finishedUploads: SegregatedFinishedUploads;
    preUploadSkippedFiles?: PreUploadSkippedFile[];
    hasLivePhotos: boolean;
    cancelUploads: () => void;
}

const emptyPreUploadSkippedFiles: PreUploadSkippedFile[] = [];

export function UploadProgressV2(props: UploadProgressProps) {
    if (!props.open) return null;

    return props.uploadPhase == "done" ? (
        <CompletedUploadProgress {...props} />
    ) : (
        <UploadProgressView {...props} />
    );
}

function CompletedUploadProgress(props: UploadProgressProps) {
    const [reviewFailures, setReviewFailures] = useState(false);

    const handleReviewFailed = () => setReviewFailures(true);

    return reviewFailures ? (
        <UploadProgressView {...props} />
    ) : (
        <UploadCompletionV2
            open
            onClose={props.onClose}
            onReviewFailed={handleReviewFailed}
            finishedUploads={props.finishedUploads}
            preUploadSkippedFiles={props.preUploadSkippedFiles}
        />
    );
}

function UploadProgressView({
    onClose,
    uploadCounter,
    uploadPhase,
    percentComplete,
    retryFailed,
    uploadFileNames,
    hasLivePhotos,
    inProgressUploads,
    finishedUploads,
    preUploadSkippedFiles = emptyPreUploadSkippedFiles,
    cancelUploads,
}: UploadProgressProps) {
    /**
     * expanded: This variable decides whether the full upload progress
     * modal should be shown or just the compact one is fine.
     *
     * dragPosition: For facilitating the drag of the compact upload widget
     * across the screen.
     *
     * showStopConfirmation: If the user tries to close the upload, we show
     * a confirmation modal, and this variable is the decider for that.
     */
    const [expanded, setExpanded] = useState(false);
    const [dragPosition, setDragPosition] = useState<DragPosition>();
    const [showStopConfirmation, setShowStopConfirmation] = useState(false);

    const handleClose = useCallback(
        () =>
            uploadPhase == "done" ? onClose() : setShowStopConfirmation(true),
        [onClose, uploadPhase],
    );

    const handleStopConfirmationClose = useCallback(
        () => setShowStopConfirmation(false),
        [],
    );

    const handleStopConfirmationConfirm = useCallback(() => {
        setShowStopConfirmation(false);
        cancelUploads();
    }, [cancelUploads]);

    const contextValue = useMemo(
        () => ({
            onClose: handleClose,
            uploadCounter,
            uploadPhase,
            percentComplete,
            retryFailed,
            inProgressUploads,
            uploadFileNames,
            finishedUploads,
            preUploadSkippedFiles,
            hasLivePhotos,
            setExpanded,
            dragPosition,
            setDragPosition,
        }),
        [
            dragPosition,
            finishedUploads,
            handleClose,
            hasLivePhotos,
            inProgressUploads,
            percentComplete,
            retryFailed,
            preUploadSkippedFiles,
            uploadCounter,
            uploadFileNames,
            uploadPhase,
        ],
    );

    return (
        <UploadProgressContext.Provider value={contextValue}>
            {expanded ? <UploadProgressDialog /> : <MinimizedUploadProgress />}
            <StopUploadConfirmationDialog
                open={showStopConfirmation}
                onClose={handleStopConfirmationClose}
                onConfirm={handleStopConfirmationConfirm}
            />
        </UploadProgressContext.Provider>
    );
}
