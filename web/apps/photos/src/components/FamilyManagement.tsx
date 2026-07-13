import {
    createFamily,
    inviteFamilyMember,
    modifyFamilyMemberStorage,
    removeFamilyMember,
    revokeFamilyInvite,
} from "@/services/family";
import {
    AddOutlined,
    DeleteOutlined,
    EditOutlined,
    RefreshOutlined,
} from "@mui/icons-material";
import {
    Box,
    Dialog,
    DialogContent,
    Divider,
    IconButton,
    LinearProgress,
    Stack,
    TextField,
    Tooltip,
    Typography,
} from "@mui/material";
import { ActivityIndicator } from "ente-base/components/mui/ActivityIndicator";
import { DialogCloseIconButton } from "ente-base/components/mui/DialogCloseIconButton";
import { FocusVisibleButton } from "ente-base/components/mui/FocusVisibleButton";
import { LoadingButton } from "ente-base/components/mui/LoadingButton";
import { useIsSmallWidth } from "ente-base/components/utils/hooks";
import type { ModalVisibilityProps } from "ente-base/components/utils/modal";
import { useBaseContext } from "ente-base/context";
import { isHTTPErrorWithStatus } from "ente-base/http";
import { formattedStorageByteSize } from "ente-gallery/utils/units";
import { useUserDetailsSnapshot } from "ente-new/photos/components/utils/use-snapshot";
import {
    familyUsage,
    isSubscriptionActivePaid,
    leaveFamily,
    pullUserDetails,
    type FamilyMember,
    type UserDetails,
} from "ente-new/photos/services/user-details";
import { t } from "i18next";
import React, { useEffect, useMemo, useState } from "react";

type FamilyManagementProps = ModalVisibilityProps & {
    onShowPlanSelector: () => void;
};

export const FamilyManagement: React.FC<FamilyManagementProps> = ({
    open,
    onClose,
    onShowPlanSelector,
}) => {
    const { onGenericError, showMiniDialog } = useBaseContext();
    const userDetails = useUserDetailsSnapshot();
    const fullScreen = useIsSmallWidth();
    const [loading, setLoading] = useState(false);
    const [inviteOpen, setInviteOpen] = useState(false);
    const [editingMember, setEditingMember] = useState<FamilyMember>();
    const [resendingID, setResendingID] = useState<string>();

    useEffect(() => {
        if (!open) return;
        setLoading(true);
        void pullUserDetails()
            .catch(onGenericError)
            .finally(() => setLoading(false));
    }, [onGenericError, open]);

    const members = useMemo(() => {
        const currentEmail = userDetails?.email.toLowerCase();
        return [...(userDetails?.familyData?.members ?? [])].sort((a, b) => {
            if (a.email.toLowerCase() == currentEmail) return -1;
            if (b.email.toLowerCase() == currentEmail) return 1;
            if (a.status == "INVITED" && b.status != "INVITED") return 1;
            if (b.status == "INVITED" && a.status != "INVITED") return -1;
            return a.email.localeCompare(b.email);
        });
    }, [userDetails]);

    const isAdmin = members.some(
        (member) => member.isAdmin && member.email == userDetails?.email,
    );

    const confirmRemove = (member: FamilyMember) => {
        const invited = member.status == "INVITED";
        showMiniDialog({
            title: t(invited ? "revoke_family_invite" : "remove_family_member"),
            message: t(
                invited
                    ? "revoke_family_invite_confirm"
                    : "remove_family_member_confirm",
                { email: member.email },
            ),
            continue: {
                text: t(invited ? "revoke" : "remove"),
                color: "critical",
                action: () =>
                    invited
                        ? revokeFamilyInvite(member.id!)
                        : removeFamilyMember(member.id!),
            },
        });
    };

    const resendInvite = async (member: FamilyMember) => {
        setResendingID(member.id);
        try {
            await inviteFamilyMember(member.email);
        } catch (e) {
            onGenericError(e);
        } finally {
            setResendingID(undefined);
        }
    };

    const confirmLeave = () =>
        showMiniDialog({
            title: t("leave_family_plan"),
            message: t("leave_family_plan_confirm"),
            continue: {
                text: t("leave"),
                color: "critical",
                action: async () => {
                    await leaveFamily();
                    onClose();
                },
            },
        });

    const showPlans = () => {
        onClose();
        onShowPlanSelector();
    };

    return (
        <>
            <Dialog {...{ open, onClose, fullScreen }} maxWidth="sm" fullWidth>
                <Stack
                    direction="row"
                    sx={{ p: "20px 16px 12px 24px", alignItems: "center" }}
                >
                    <Typography variant="h3" sx={{ flex: 1 }}>
                        {t("family")}
                    </Typography>
                    <DialogCloseIconButton {...{ onClose }} />
                </Stack>
                <DialogContent sx={{ pt: 1, minHeight: 360 }}>
                    {loading || !userDetails ? (
                        <Stack
                            sx={{
                                height: 300,
                                placeContent: "center",
                                alignItems: "center",
                            }}
                        >
                            <ActivityIndicator />
                        </Stack>
                    ) : members.length ? (
                        <FamilyDashboard
                            {...{ userDetails, members, isAdmin }}
                            onInvite={() => setInviteOpen(true)}
                            onEdit={setEditingMember}
                            onRemove={confirmRemove}
                            onResend={(member) => void resendInvite(member)}
                            {...{ resendingID }}
                            onLeave={confirmLeave}
                        />
                    ) : (
                        <FamilyIntroduction
                            canCreate={isSubscriptionActivePaid(
                                userDetails.subscription,
                            )}
                            onContinue={() => setInviteOpen(true)}
                            onShowPlans={showPlans}
                        />
                    )}
                </DialogContent>
            </Dialog>
            <InviteMemberDialog
                open={inviteOpen}
                onClose={() => setInviteOpen(false)}
                create={!members.length}
            />
            <StorageLimitDialog
                member={editingMember}
                onClose={() => setEditingMember(undefined)}
            />
        </>
    );
};

const FamilyIntroduction: React.FC<{
    canCreate: boolean;
    onContinue: () => void;
    onShowPlans: () => void;
}> = ({ canCreate, onContinue, onShowPlans }) => (
    <Stack sx={{ alignItems: "center", textAlign: "center", gap: 3, py: 2 }}>
        <img alt="" height={180} src="/images/family-plan/1x.png" />
        <Stack sx={{ gap: 1, maxWidth: 380 }}>
            <Typography variant="h3">{t("family_plan")}</Typography>
            <Typography sx={{ color: "text.muted" }}>
                {t("family_plan_description")}
            </Typography>
        </Stack>
        <FocusVisibleButton
            color="accent"
            onClick={canCreate ? onContinue : onShowPlans}
        >
            {t(canCreate ? "add_family_member" : "view_plans")}
        </FocusVisibleButton>
    </Stack>
);

interface FamilyDashboardProps {
    userDetails: UserDetails;
    members: FamilyMember[];
    isAdmin: boolean;
    resendingID?: string;
    onInvite: () => void;
    onEdit: (member: FamilyMember) => void;
    onRemove: (member: FamilyMember) => void;
    onResend: (member: FamilyMember) => void;
    onLeave: () => void;
}

const FamilyDashboard: React.FC<FamilyDashboardProps> = ({
    userDetails,
    members,
    isAdmin,
    resendingID,
    onInvite,
    onEdit,
    onRemove,
    onResend,
    onLeave,
}) => {
    const used = familyUsage(userDetails);
    const total =
        (userDetails.familyData?.storage ?? 0) + userDetails.storageBonus;

    return (
        <Stack sx={{ gap: 3 }}>
            <Box sx={{ p: 2, bgcolor: "fill.faint", borderRadius: 2 }}>
                <Stack direction="row" sx={{ justifyContent: "space-between" }}>
                    <Typography>{t("family_storage")}</Typography>
                    <Typography variant="small" sx={{ color: "text.muted" }}>
                        {t("family_storage_usage", {
                            used: formattedStorageByteSize(used),
                            total: formattedStorageByteSize(total),
                        })}
                    </Typography>
                </Stack>
                <LinearProgress
                    variant="determinate"
                    value={total ? Math.min((used / total) * 100, 100) : 0}
                    sx={{ mt: 1.5, height: 8, borderRadius: 1 }}
                />
            </Box>
            <Stack sx={{ gap: 1 }}>
                <Typography variant="small" sx={{ px: 1, color: "text.muted" }}>
                    {t("family_members")}
                </Typography>
                <Box sx={{ bgcolor: "fill.faint", borderRadius: 2 }}>
                    {members.map((member, index) => (
                        <React.Fragment key={member.email}>
                            {!!index && <Divider />}
                            <FamilyMemberRow
                                {...{
                                    member,
                                    isAdmin,
                                    onEdit,
                                    onRemove,
                                    onResend,
                                }}
                                resending={member.id == resendingID}
                            />
                        </React.Fragment>
                    ))}
                </Box>
            </Stack>
            {isAdmin ? (
                members.length < 6 && (
                    <FocusVisibleButton
                        color="accent"
                        startIcon={<AddOutlined />}
                        onClick={onInvite}
                    >
                        {t("add_family_member")}
                    </FocusVisibleButton>
                )
            ) : (
                <FocusVisibleButton color="critical" onClick={onLeave}>
                    {t("leave_family_plan")}
                </FocusVisibleButton>
            )}
        </Stack>
    );
};

const FamilyMemberRow: React.FC<{
    member: FamilyMember;
    isAdmin: boolean;
    resending: boolean;
    onEdit: (member: FamilyMember) => void;
    onRemove: (member: FamilyMember) => void;
    onResend: (member: FamilyMember) => void;
}> = ({ member, isAdmin, resending, onEdit, onRemove, onResend }) => {
    const invited = member.status == "INVITED";
    const role = member.isAdmin
        ? t("family_manager")
        : t(invited ? "family_invited" : "family_member");

    return (
        <Stack direction="row" sx={{ p: 2, gap: 1, alignItems: "center" }}>
            <Stack sx={{ flex: 1, minWidth: 0 }}>
                <Typography noWrap>{member.email}</Typography>
                <Typography variant="small" sx={{ color: "text.muted" }}>
                    {role}
                    {!invited &&
                        ` · ${formattedStorageByteSize(member.usage ?? 0)}`}
                    {member.storageLimit != undefined &&
                        ` / ${formattedStorageByteSize(member.storageLimit)}`}
                </Typography>
            </Stack>
            {isAdmin && !member.isAdmin && member.id && (
                <Stack direction="row">
                    {invited ? (
                        <Tooltip title={t("resend_family_invite")}>
                            <IconButton
                                disabled={resending}
                                onClick={() => onResend(member)}
                            >
                                {resending ? (
                                    <ActivityIndicator size={20} />
                                ) : (
                                    <RefreshOutlined />
                                )}
                            </IconButton>
                        </Tooltip>
                    ) : (
                        <Tooltip title={t("set_storage_limit")}>
                            <IconButton onClick={() => onEdit(member)}>
                                <EditOutlined />
                            </IconButton>
                        </Tooltip>
                    )}
                    <Tooltip
                        title={t(
                            invited
                                ? "revoke_family_invite"
                                : "remove_family_member",
                        )}
                    >
                        <IconButton onClick={() => onRemove(member)}>
                            <DeleteOutlined />
                        </IconButton>
                    </Tooltip>
                </Stack>
            )}
        </Stack>
    );
};

const InviteMemberDialog: React.FC<
    ModalVisibilityProps & { create: boolean }
> = ({ open, onClose, create }) => {
    const { onGenericError } = useBaseContext();
    const [email, setEmail] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (open) {
            setEmail("");
            setError("");
        }
    }, [open]);

    const submit = async () => {
        const normalizedEmail = email.trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
            setError(t("enter_valid_email"));
            return;
        }
        setLoading(true);
        try {
            if (create) await createFamily();
            await inviteFamilyMember(normalizedEmail);
            onClose();
        } catch (e) {
            const errorKey = inviteErrorKey(e);
            if (errorKey) setError(t(errorKey));
            else onGenericError(e);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog {...{ open, onClose }} maxWidth="xs" fullWidth>
            <Stack direction="row" sx={{ p: "20px 16px 8px 24px" }}>
                <Typography variant="h3" sx={{ flex: 1 }}>
                    {t("invite_family_member")}
                </Typography>
                <DialogCloseIconButton {...{ onClose }} />
            </Stack>
            <DialogContent>
                <Stack sx={{ gap: 2 }}>
                    <TextField
                        autoFocus
                        type="email"
                        label={t("enter_email")}
                        value={email}
                        error={!!error}
                        helperText={error || t("family_invite_hint")}
                        onChange={(e) => {
                            setEmail(e.target.value);
                            setError("");
                        }}
                        onKeyDown={(e) => {
                            if (e.key == "Enter") void submit();
                        }}
                    />
                    <LoadingButton
                        fullWidth
                        color="accent"
                        loading={loading}
                        onClick={() => void submit()}
                    >
                        {t("invite")}
                    </LoadingButton>
                </Stack>
            </DialogContent>
        </Dialog>
    );
};

const inviteErrorKey = (error: unknown) => {
    if (isHTTPErrorWithStatus(error, 404)) return "family_user_not_found";
    if (isHTTPErrorWithStatus(error, 406)) return "family_already_member";
    if (isHTTPErrorWithStatus(error, 409)) return "family_paid_subscriber";
    if (isHTTPErrorWithStatus(error, 412)) return "family_size_limit";
    if (isHTTPErrorWithStatus(error, 402)) return "family_paid_plan_required";
    return undefined;
};

const StorageLimitDialog: React.FC<{
    member?: FamilyMember;
    onClose: () => void;
}> = ({ member, onClose }) => {
    const { onGenericError } = useBaseContext();
    const [value, setValue] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        setValue(
            member?.storageLimit == undefined
                ? ""
                : String(member.storageLimit / 1024 ** 3),
        );
        setError("");
    }, [member]);

    const save = async () => {
        const storageLimit = value
            ? Math.round(Number(value) * 1024 ** 3)
            : null;
        if (
            (storageLimit != null &&
                (!Number.isFinite(storageLimit) || storageLimit < 0)) ||
            (storageLimit != null && storageLimit < (member?.usage ?? 0))
        ) {
            setError(t("family_storage_limit_invalid"));
            return;
        }
        setLoading(true);
        try {
            await modifyFamilyMemberStorage(member!.id!, storageLimit);
            onClose();
        } catch (e) {
            onGenericError(e);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={!!member} {...{ onClose }} maxWidth="xs" fullWidth>
            <Stack direction="row" sx={{ p: "20px 16px 8px 24px" }}>
                <Typography variant="h3" sx={{ flex: 1 }}>
                    {t("set_storage_limit")}
                </Typography>
                <DialogCloseIconButton {...{ onClose }} />
            </Stack>
            <DialogContent>
                <Stack sx={{ gap: 2 }}>
                    <TextField
                        autoFocus
                        type="number"
                        label={t("storage_limit_gb")}
                        value={value}
                        error={!!error}
                        helperText={error || t("storage_limit_hint")}
                        slotProps={{ htmlInput: { min: 0, step: "any" } }}
                        onChange={(e) => {
                            setValue(e.target.value);
                            setError("");
                        }}
                        onKeyDown={(e) => {
                            if (e.key == "Enter") void save();
                        }}
                    />
                    <LoadingButton
                        fullWidth
                        color="accent"
                        loading={loading}
                        onClick={() => void save()}
                    >
                        {t("save")}
                    </LoadingButton>
                </Stack>
            </DialogContent>
        </Dialog>
    );
};
