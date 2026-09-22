import SwiftUI

public struct InputField: View {
    @Binding private var text: String
    @FocusState private var focused: Bool
    @Environment(\.entePalette) private var palette
    @Environment(\.isEnabled) private var enabled
    private let label: String?
    private let required: Bool
    private let placeholder: String
    private let message: String?
    private let state: InputState
    private let secure: Bool
    private let lines: ClosedRange<Int>

    public init(
        text: Binding<String>,
        label: String? = nil,
        required: Bool = false,
        placeholder: String = "",
        message: String? = nil,
        state: InputState = .normal,
        secure: Bool = false,
        lines: ClosedRange<Int> = 1...1,
    ) {
        _text = text
        self.label = label
        self.required = required
        self.placeholder = placeholder
        self.message = message
        self.state = state
        self.secure = secure
        self.lines = lines
    }

    public var body: some View {
        let prompt = Text(placeholder)
            .foregroundColor(enabled ? palette.hintText : palette.disabledText)
        let shape = RoundedRectangle(cornerRadius: EnteRadius.large, style: .continuous)
        VStack(alignment: .leading, spacing: EnteSpacing.sm) {
            if let label {
                HStack(spacing: 2) {
                    Text(label).foregroundStyle(enabled ? palette.text : palette.disabledText)
                    if required {
                        Text("*").font(EnteTypography.bodyBold).foregroundStyle(palette.danger)
                    }
                }
                .font(EnteTypography.body)
            }
            Group {
                if secure {
                    SecureField(label ?? placeholder, text: $text, prompt: prompt)
                } else {
                    TextField(
                        label ?? placeholder, text: $text, prompt: prompt,
                        axis: lines.upperBound == 1 ? .horizontal : .vertical
                    )
                    .lineLimit(lines)
                }
            }
            .textFieldStyle(.plain)
            .accessibilityLabel(label ?? placeholder)
            .focused($focused)
            .font(EnteTypography.body)
            .foregroundStyle(enabled ? palette.text : palette.disabledText)
            .tint(palette.primary)
            .padding(EnteSpacing.lg)
            .frame(minHeight: 52)
            .background {
                shape.fill(enabled ? palette.surface : palette.fill)
                    .onTapGesture { focused = true }
            }
            .overlay { shape.strokeBorder(borderColor, lineWidth: 1) }
            if let message {
                Text(message)
                    .font(EnteTypography.mini)
                    .foregroundStyle(statusColor)
            }
        }
    }

    private var borderColor: Color {
        if state != .normal {
            return statusColor
        }
        return focused ? palette.hintText : palette.faintBorder
    }

    private var statusColor: Color {
        switch state {
        case .normal: palette.mutedText
        case .error: palette.danger
        case .success: palette.primary
        }
    }
}
