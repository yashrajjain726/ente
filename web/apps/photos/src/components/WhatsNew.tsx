import { didShowWhatsNew } from "@/services/changelog";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import {
    Box,
    Dialog,
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
    Stack,
    Typography,
    styled,
} from "@mui/material";
import { FocusVisibleButton } from "ente-base/components/mui/FocusVisibleButton";
import { useIsSmallWidth } from "ente-base/components/utils/hooks";
import { ensureElectron } from "ente-base/electron";
import { SlideUpTransition } from "ente-new/photos/components/mui/SlideUpTransition";
import { t } from "i18next";
import React, { useEffect } from "react";

interface WhatsNewProps {
    open: boolean;
    onClose: () => void;
}

export const WhatsNew: React.FC<WhatsNewProps> = ({ open, onClose }) => {
    const fullScreen = useIsSmallWidth();

    useEffect(() => {
        if (open) void didShowWhatsNew(ensureElectron());
    }, [open]);

    return (
        <Dialog
            {...{ open, fullScreen }}
            slots={{ transition: SlideUpTransition }}
            maxWidth="xs"
            fullWidth
        >
            <Box sx={{ m: 1 }}>
                <DialogTitle sx={{ mt: 2, mb: 0 }}>
                    <Typography
                        variant="body"
                        sx={{ color: "text.faint", fontWeight: "regular" }}
                    >
                        {t("whats_new")}
                    </Typography>
                </DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        <ChangelogContent />
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <FocusVisibleButton
                        onClick={onClose}
                        color="accent"
                        fullWidth
                        endIcon={<ArrowForwardIcon />}
                    >
                        <ButtonContents>{t("continue")}</ButtonContents>
                    </FocusVisibleButton>
                </DialogActions>
            </Box>
        </Dialog>
    );
};

const ChangelogContent: React.FC = () => {
    // Update changelogVersion whenever the English release notes change.

    return (
        <Stack sx={{ gap: 2, mb: 1 }}>
            <Typography variant="h6">{t("whats_new_headline")}</Typography>
            <Typography sx={{ color: "text.muted" }}>
                {t("whats_new_description")}
            </Typography>
        </Stack>
    );
};

const ButtonContents = styled("div")`
    width: 100%;
    text-align: left;
`;
