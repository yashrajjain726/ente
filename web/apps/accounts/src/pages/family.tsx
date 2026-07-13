import {
    acceptFamilyInvite,
    getFamilyInviteInfo,
    type FamilyInviteInfo,
} from "@/services/family";
import { Stack, Typography } from "@mui/material";
import {
    AccountsPageContents,
    AccountsPageTitle,
} from "ente-accounts/components/layouts/centered-paper";
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
        window.history.replaceState(null, "", window.location.pathname);
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
                <AccountsPageTitle>
                    {t("family_invite_invalid")}
                </AccountsPageTitle>
            ) : phase == "failed" ? (
                <>
                    <AccountsPageTitle>
                        {t("generic_error_retry")}
                    </AccountsPageTitle>
                    <FocusVisibleButton onClick={() => void loadInvite(token!)}>
                        {t("retry")}
                    </FocusVisibleButton>
                </>
            ) : phase == "accepted" ? (
                <>
                    <AccountsPageTitle>
                        {t("family_invite_accepted")}
                    </AccountsPageTitle>
                    <Typography sx={{ color: "text.muted" }}>
                        {t("family_invite_accepted_description", {
                            email: invite?.adminEmail,
                        })}
                    </Typography>
                    <Typography sx={{ color: "text.muted" }}>
                        {t("family_invite_open_ente")}
                    </Typography>
                </>
            ) : (
                <>
                    <AccountsPageTitle>
                        {t("family_invite_title")}
                    </AccountsPageTitle>
                    <Typography sx={{ color: "text.muted" }}>
                        {t("family_invite_description", {
                            email: invite?.adminEmail,
                        })}
                    </Typography>
                    <LoadingButton
                        color="accent"
                        loading={phase == "accepting"}
                        onClick={() => void accept()}
                    >
                        {t("accept_family_invite")}
                    </LoadingButton>
                </>
            )}
        </AccountsPageContents>
    );
};

export default Page;
