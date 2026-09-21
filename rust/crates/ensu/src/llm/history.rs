pub fn strip_hidden_parts_text(text: &str) -> String {
    let input = text.replace('\0', "");
    let tags = ["<think>", "</think>", "<todo_list>", "</todo_list>"];
    let mut stack = Vec::new();
    let mut output = String::new();
    let mut remaining = input.as_str();
    while let Some((offset, tag)) = tags
        .iter()
        .filter_map(|tag| remaining.find(tag).map(|offset| (offset, *tag)))
        .min_by_key(|(offset, _)| *offset)
    {
        if stack.is_empty() {
            output.push_str(&remaining[..offset]);
        }
        let closing = tag.starts_with("</");
        let name = &tag[if closing { 2 } else { 1 }..tag.len() - 1];
        if !closing {
            stack.push(name);
        } else if stack.last() == Some(&name) {
            stack.pop();
        }
        remaining = &remaining[offset + tag.len()..];
    }
    if stack.is_empty() {
        output.push_str(remaining);
    }
    output
        .trim_matches(|ch| {
            matches!(ch, '\u{0009}'..='\u{000D}' | '\u{0020}' | '\u{00A0}' |
                '\u{1680}' | '\u{2000}'..='\u{200A}' | '\u{2028}' | '\u{2029}' |
                '\u{202F}' | '\u{205F}' | '\u{3000}' | '\u{FEFF}')
        })
        .to_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn shared_hidden_text_fixtures() {
        let fixtures: serde_json::Value =
            serde_json::from_str(include_str!("../../tests/fixtures/history-text.json")).unwrap();
        for case in fixtures.as_array().unwrap() {
            assert_eq!(
                strip_hidden_parts_text(case["input"].as_str().unwrap()),
                case["expected"].as_str().unwrap(),
                "{}",
                case["name"]
            );
        }
    }
}
