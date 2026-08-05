import {
    MenuItem,
    Select,
    type SelectChangeEvent,
    Typography,
} from "@mui/material";

export interface DropdownOption<T> {
    label: string;
    value: T;
}

interface DropdownInputProps<T> {
    options: DropdownOption<T>[];
    selected: T | undefined;
    onSelect: (selectedValue: T) => void;
    placeholder?: string;
}

export const DropdownInput = <T extends string>({
    options,
    selected,
    onSelect,
    placeholder,
}: DropdownInputProps<T>) => (
    <Select
        value={selected}
        onChange={(event: SelectChangeEvent) => {
            onSelect(event.target.value as T);
        }}
        variant="outlined"
        displayEmpty
        renderValue={() => {
            const label = options.find((o) => o.value == selected)?.label;
            return label ? (
                <Typography sx={{ whiteSpace: "normal" }}>{label}</Typography>
            ) : (
                <Typography sx={{ color: "text.muted" }}>
                    {placeholder}
                </Typography>
            );
        }}
        MenuProps={{
            slotProps: {
                paper: {
                    // MUI's item min-width prevents wrapping unless max-width is reset.
                    sx: { maxWidth: 0 },
                },
                list: {
                    sx: {
                        backgroundColor: "background.paper2",
                        ".MuiMenuItem-root": {
                            color: "text.faint",
                            whiteSpace: "normal",
                        },
                        "&&& > .Mui-selected": { color: "text.base" },
                    },
                },
            },
        }}
        sx={{
            ".MuiOutlinedInput-notchedOutline": { borderColor: "transparent" },
            ".MuiSelect-select": { backgroundColor: "fill.faint" },
        }}
    >
        {options.map(({ value, label }) => (
            <MenuItem key={value} value={value}>
                <Typography>{label}</Typography>
            </MenuItem>
        ))}
    </Select>
);
