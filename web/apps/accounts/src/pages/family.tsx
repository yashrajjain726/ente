import {
    acceptFamilyInvite,
    getFamilyInviteInfo,
    type FamilyInviteInfo,
} from "@/services/family";
import { Box, Stack, Typography } from "@mui/material";
import { AccountsPageContents } from "ente-accounts/components/layouts/centered-paper";
import { ActivityIndicator } from "ente-base/components/mui/ActivityIndicator";
import { FocusVisibleButton } from "ente-base/components/mui/FocusVisibleButton";
import { LoadingButton } from "ente-base/components/mui/LoadingButton";
import { useBaseContext } from "ente-base/context";
import { isHTTP4xxError } from "ente-base/http";
import { t } from "i18next";
import React, { useCallback, useEffect, useState } from "react";

type Phase =
    | "loading"
    | "ready"
    | "accepting"
    | "accepted"
    | "invalid"
    | "failed";

const Page: React.FC = () => {
    const { onGenericError } = useBaseContext();
    const [phase, setPhase] = useState<Phase>("loading");
    const [invite, setInvite] = useState<FamilyInviteInfo>();
    const [token, setToken] = useState<string>();

    const loadInvite = useCallback(
        async (token: string) => {
            setPhase("loading");
            try {
                setInvite(await getFamilyInviteInfo(token));
                window.history.replaceState(null, "", window.location.pathname);
                setPhase("ready");
            } catch (e) {
                setPhase(isHTTP4xxError(e) ? "invalid" : "failed");
                if (!isHTTP4xxError(e)) onGenericError(e);
            }
        },
        [onGenericError],
    );

    useEffect(() => {
        const token = new URLSearchParams(window.location.hash.slice(1)).get(
            "inviteToken",
        );
        if (!token) {
            setPhase("invalid");
            return;
        }
        setToken(token);
        void loadInvite(token);
    }, [loadInvite]);

    const accept = async () => {
        setPhase("accepting");
        try {
            setInvite(await acceptFamilyInvite(token!));
            setPhase("accepted");
        } catch (e) {
            setPhase(isHTTP4xxError(e) ? "invalid" : "ready");
            if (!isHTTP4xxError(e)) onGenericError(e);
        }
    };

    return (
        <AccountsPageContents>
            {phase == "loading" ? (
                <Stack
                    sx={{
                        flex: 1,
                        placeContent: "center",
                        alignItems: "center",
                    }}
                >
                    <ActivityIndicator />
                </Stack>
            ) : phase == "invalid" ? (
                <Stack sx={{ flex: 1, placeContent: "center" }}>
                    <Typography variant="h3" sx={{ textAlign: "center" }}>
                        {t("family_invite_invalid")}
                    </Typography>
                </Stack>
            ) : phase == "failed" ? (
                <Stack sx={{ flex: 1, placeContent: "center", gap: 3 }}>
                    <Typography variant="h3" sx={{ textAlign: "center" }}>
                        {t("generic_error_retry")}
                    </Typography>
                    <FocusVisibleButton onClick={() => void loadInvite(token!)}>
                        {t("retry")}
                    </FocusVisibleButton>
                </Stack>
            ) : phase == "accepted" ? (
                <FamilyInviteContents>
                    <Stack sx={{ gap: 1.5 }}>
                        <Typography variant="h3">
                            {t("family_invite_accepted")}
                        </Typography>
                        <Typography sx={{ color: "text.muted" }}>
                            {t("family_invite_accepted_description", {
                                email: invite?.adminEmail,
                            })}
                        </Typography>
                        <Typography sx={{ color: "text.muted" }}>
                            {t("family_invite_open_ente")}
                        </Typography>
                    </Stack>
                </FamilyInviteContents>
            ) : (
                <FamilyInviteContents>
                    <Stack sx={{ gap: 1.5 }}>
                        <Typography variant="h3">
                            {t("family_invite_title")}
                        </Typography>
                        <Typography sx={{ color: "text.muted" }}>
                            {t("family_invite_description", {
                                email: invite?.adminEmail,
                            })}
                        </Typography>
                    </Stack>
                    <LoadingButton
                        fullWidth
                        color="accent"
                        loading={phase == "accepting"}
                        onClick={() => void accept()}
                    >
                        {t("accept_family_invite")}
                    </LoadingButton>
                </FamilyInviteContents>
            )}
        </AccountsPageContents>
    );
};

const FamilyInviteContents: React.FC<React.PropsWithChildren> = ({
    children,
}) => (
    <Stack
        sx={{
            flex: 1,
            placeContent: "center",
            alignItems: "center",
            textAlign: "center",
            gap: 3,
        }}
    >
        <Box
            component="img"
            alt=""
            src="/images/family-plan-illustration.png"
            sx={{ width: 160, height: "auto" }}
        />
        {children}
    </Stack>
);

export default Page;
