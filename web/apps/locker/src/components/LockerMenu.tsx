import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import MoreHorizIcon from "@mui/icons-material/MoreHoriz";
import {
    Box,
    IconButton,
    MenuItem,
    Typography,
    type IconButtonProps,
} from "@mui/material";
import Menu, { type MenuProps } from "@mui/material/Menu";
import React, { createContext, useContext, useMemo, useState } from "react";
import { lockerMenuPaperSx } from "./locker-dialog-styles";
import { lockerColorSx, lockerTextMiniSx } from "./locker-tokens";

const LockerMenuContext = createContext<{ close: () => void } | undefined>(
    undefined,
);

export const LockerOverflowMenu: React.FC<
    React.PropsWithChildren<{
        ariaID: string;
        triggerButtonIcon?: React.ReactNode;
        triggerButtonSxProps?: IconButtonProps["sx"];
    }>
> = ({ ariaID, triggerButtonIcon, triggerButtonSxProps, children }) => {
    const [anchorEl, setAnchorEl] = useState<MenuProps["anchorEl"]>();
    const context = useMemo(
        () => ({ close: () => setAnchorEl(undefined) }),
        [],
    );
    return (
        <LockerMenuContext value={context}>
            <IconButton
                onClick={(event) => setAnchorEl(event.currentTarget)}
                aria-controls={anchorEl ? ariaID : undefined}
                aria-haspopup="true"
                aria-expanded={anchorEl ? "true" : undefined}
                sx={triggerButtonSxProps}
            >
                {triggerButtonIcon ?? <MoreHorizIcon />}
            </IconButton>
            <Menu
                id={ariaID}
                {...(anchorEl && { anchorEl })}
                open={!!anchorEl}
                onClose={() => setAnchorEl(undefined)}
                slotProps={{
                    paper: { sx: lockerMenuPaperSx },
                    list: { disablePadding: true, "aria-labelledby": ariaID },
                }}
                anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
                transformOrigin={{ vertical: "top", horizontal: "right" }}
            >
                {children}
            </Menu>
        </LockerMenuContext>
    );
};

export const LockerMenuOption: React.FC<
    React.PropsWithChildren<{
        onClick: () => void;
        critical?: boolean;
        disabled?: boolean;
        selected?: boolean;
        startIcon?: React.ReactNode;
        secondary?: string;
    }>
> = ({
    onClick,
    critical,
    disabled,
    selected,
    startIcon,
    secondary,
    children,
    ...rest
}) => {
    const menuContext = useContext(LockerMenuContext);
    return (
        <MenuItem
            {...rest}
            onClick={() => {
                onClick();
                menuContext?.close();
            }}
            disabled={disabled}
            selected={selected}
            sx={(theme) => ({
                height: 52,
                minHeight: 52,
                px: "16px",
                gap: "6px",
                alignItems: "center",
                borderBottom: "1px solid",
                ...lockerColorSx(theme, { borderColor: "strokeFaint" }),
                "&.Mui-disabled": { opacity: 0.5 },
                "&.Mui-selected": lockerColorSx(theme, {
                    backgroundColor: "primaryLight",
                }),
                "&:hover, &.Mui-selected:hover": lockerColorSx(theme, {
                    backgroundColor: "fillDark",
                }),
            })}
        >
            {startIcon && (
                <Box
                    sx={(theme) => ({
                        width: 24,
                        height: 24,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                        ...lockerColorSx(theme, {
                            color: critical ? "warning" : "textBase",
                        }),
                        "& .MuiSvgIcon-root": { fontSize: 18 },
                    })}
                >
                    {startIcon}
                </Box>
            )}
            <Typography
                noWrap
                sx={(theme) => ({
                    ...lockerTextMiniSx,
                    flex: 1,
                    minWidth: 0,
                    ...lockerColorSx(theme, {
                        color: critical ? "warning" : "textBase",
                    }),
                })}
            >
                {children}
            </Typography>
            {secondary !== undefined && (
                <Typography
                    sx={(theme) => ({
                        ...lockerTextMiniSx,
                        flexShrink: 0,
                        ...lockerColorSx(theme, { color: "textLight" }),
                    })}
                >
                    · {secondary}
                </Typography>
            )}
            {selected && (
                <CheckRoundedIcon
                    sx={(theme) => ({
                        fontSize: 18,
                        ...lockerColorSx(theme, { color: "primary" }),
                    })}
                />
            )}
        </MenuItem>
    );
};

export const LockerMenuFooter: React.FC<
    React.PropsWithChildren<{ onClick: () => void }>
> = ({ onClick, children, ...rest }) => (
    <MenuItem
        {...rest}
        onClick={onClick}
        sx={(theme) => ({
            ...lockerTextMiniSx,
            height: 44,
            minHeight: 44,
            width: "100%",
            justifyContent: "center",
            textDecoration: "underline",
            textUnderlineOffset: "3px",
            textTransform: "none",
            ...lockerColorSx(theme, { color: "textLight" }),
            "&:hover": lockerColorSx(theme, { backgroundColor: "fillDark" }),
        })}
    >
        {children}
    </MenuItem>
);
