import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
    Box,
    Button,
    Dialog,
    IconButton,
    styled,
    Typography,
} from "@mui/material";
import { SpaceAvatarImage } from "components/SpaceAvatarImage";
import React from "react";

interface SpaceSharedInviteDialogProps {
    avatarUrl?: string | null;
    name: string;
    open: boolean;
    onAddFriend: () => void;
    onClose: () => void;
}

export const SpaceSharedInviteDialog: React.FC<
    SpaceSharedInviteDialogProps
> = ({ avatarUrl, name, open, onAddFriend, onClose }) => {
    const titleID = React.useId();
    const subtitleID = React.useId();

    return (
        <StyledDialog
            open={open}
            onClose={onClose}
            aria-labelledby={titleID}
            aria-describedby={subtitleID}
        >
            <DialogWrapper>
                <CloseButton aria-label="Close" onClick={onClose}>
                    <HugeiconsIcon
                        icon={Cancel01Icon}
                        size={20}
                        strokeWidth={1.8}
                    />
                </CloseButton>

                <ContentContainer>
                    <AvatarWrapper>
                        <SpaceAvatarImage
                            aria-hidden
                            borderRadius="50%"
                            src={avatarUrl}
                        />
                    </AvatarWrapper>

                    <TitleSection>
                        <Title id={titleID}>{name} invited you!</Title>
                        <Subtitle id={subtitleID}>
                            Add {name} as a friend to get their latest posts on
                            Ente Space.
                        </Subtitle>
                    </TitleSection>

                    <ButtonsSection>
                        <SignInButton
                            variant="contained"
                            fullWidth
                            onClick={onAddFriend}
                        >
                            Add friend
                        </SignInButton>
                    </ButtonsSection>
                </ContentContainer>
            </DialogWrapper>
        </StyledDialog>
    );
};

const StyledDialog = styled(Dialog)(() => ({
    "& .MuiDialog-paper": {
        width: 381,
        maxWidth: "calc(100% - 32px)",
        borderRadius: 28,
        backgroundColor: "#fff",
        padding: 0,
        margin: 16,
        overflow: "visible",
        boxShadow: "none",
        border: "1px solid #E0E0E0",
    },
    "& .MuiBackdrop-root": { backgroundColor: "rgba(0, 0, 0, 0.5)" },
}));

const DialogWrapper = styled(Box)(() => ({
    position: "relative",
    padding: "48px 16px 16px 16px",
}));

const CloseButton = styled(IconButton)(() => ({
    position: "absolute",
    top: 11,
    right: 12,
    backgroundColor: "#FAFAFA",
    color: "#000",
    padding: 10,
    "&:hover": { backgroundColor: "#F0F0F0" },
}));

const ContentContainer = styled(Box)(() => ({
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 16,
}));

const AvatarWrapper = styled(Box)(() => ({
    backgroundColor: "#FAFAFA",
    border: "1px solid #E0E0E0",
    borderRadius: "50%",
    height: 112,
    marginBottom: 8,
    overflow: "hidden",
    width: 112,
}));

const TitleSection = styled(Box)(() => ({
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 9,
    textAlign: "center",
    marginBottom: 16,
}));

const Title = styled(Typography)(() => ({
    fontWeight: 600,
    fontSize: 24,
    lineHeight: "28px",
    letterSpacing: 0,
    color: "#000",
}));

const Subtitle = styled(Typography)(() => ({
    fontWeight: 500,
    fontSize: 14,
    lineHeight: "20px",
    color: "#666666",
    maxWidth: 295,
}));

const ButtonsSection = styled(Box)(() => ({
    width: "100%",
    display: "flex",
    flexDirection: "column",
    gap: 12,
}));

const SignInButton = styled(Button)(() => ({
    display: "flex",
    padding: "20px 16px",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    flex: "1 0 0",
    borderRadius: 20,
    backgroundColor: "#08C225",
    fontSize: 16,
    fontWeight: 500,
    textTransform: "none",
    color: "#fff",
    "&:hover": { backgroundColor: "#07A820" },
}));
