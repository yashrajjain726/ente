use super::document::PreparedNotesChunk;
use super::{NOTES_CHUNK_CHARACTERS, NOTES_CHUNK_OVERLAP_CHARACTERS, NotesError, is_valid_label};

#[derive(Debug)]
struct DocumentGroup {
    section: Option<String>,
    text: String,
}

pub(super) fn prepare_chunks(
    document_id: &str,
    source: &str,
) -> Result<(String, Vec<PreparedNotesChunk>), NotesError> {
    let source = source.replace("\r\n", "\n").replace('\r', "\n");
    let mut title = None;
    let mut section = None;
    let mut group_lines = Vec::new();
    let mut groups = Vec::new();
    let mut fence = None;

    for line in source.lines() {
        if let Some((marker, count)) = fence_marker(line) {
            match fence {
                Some((open_marker, open_count)) if marker == open_marker && count >= open_count => {
                    fence = None;
                }
                None => fence = Some((marker, count)),
                _ => {}
            }
        }
        if fence.is_none()
            && let Some((level, heading)) = atx_heading(line)
        {
            if !is_valid_label(&heading) {
                return Err(NotesError::InvalidInput(
                    "heading length or characters are invalid".to_string(),
                ));
            }
            flush_group(&mut groups, section.clone(), &mut group_lines);
            if level == 1 && title.is_none() {
                title = Some(heading);
                section = None;
            } else {
                section = Some(heading);
            }
            continue;
        }

        let line = line.trim_end();
        if line.is_empty() {
            if group_lines
                .last()
                .is_some_and(|line: &String| !line.is_empty())
            {
                group_lines.push(String::new());
            }
        } else {
            group_lines.push(line.to_string());
        }
    }
    flush_group(&mut groups, section, &mut group_lines);

    let title = title.unwrap_or_else(|| document_id.to_string());
    if groups.is_empty() {
        groups.push(DocumentGroup {
            section: None,
            text: title.clone(),
        });
    }

    let mut chunks = Vec::new();
    for group in groups {
        for text in split_group(&group.text) {
            chunks.push(PreparedNotesChunk {
                section: group.section.clone(),
                text,
            });
        }
    }
    if chunks.is_empty() {
        return Err(NotesError::InvalidInput(
            "source document produced no chunks".to_string(),
        ));
    }
    Ok((title, chunks))
}

fn flush_group(groups: &mut Vec<DocumentGroup>, section: Option<String>, lines: &mut Vec<String>) {
    if let (Some(start), Some(end)) = (
        lines.iter().position(|line| !line.is_empty()),
        lines.iter().rposition(|line| !line.is_empty()),
    ) {
        groups.push(DocumentGroup {
            section,
            text: lines[start..=end].join("\n"),
        });
    }
    lines.clear();
}

fn atx_heading(line: &str) -> Option<(usize, String)> {
    let leading_spaces = line.bytes().take_while(|byte| *byte == b' ').count();
    if leading_spaces > 3 {
        return None;
    }
    let line = &line[leading_spaces..];
    let level = line.bytes().take_while(|byte| *byte == b'#').count();
    if !(1..=6).contains(&level) {
        return None;
    }
    let remainder = &line[level..];
    if !remainder.is_empty() && !remainder.chars().next().is_some_and(char::is_whitespace) {
        return None;
    }
    let mut heading = remainder.trim().to_string();
    if let Some(separator) = heading.rfind(char::is_whitespace)
        && heading[separator..]
            .trim()
            .chars()
            .all(|character| character == '#')
    {
        heading.truncate(separator);
        heading = heading.trim_end().to_string();
    }
    let heading = heading.split_whitespace().collect::<Vec<_>>().join(" ");
    if heading.is_empty() {
        None
    } else {
        Some((level, heading))
    }
}

fn fence_marker(line: &str) -> Option<(char, usize)> {
    let line = line.trim_start();
    let marker = line.chars().next()?;
    if !matches!(marker, '`' | '~') {
        return None;
    }
    let count = line
        .chars()
        .take_while(|character| *character == marker)
        .count();
    (count >= 3).then_some((marker, count))
}

fn split_group(text: &str) -> Vec<String> {
    let character_count = text.chars().count();
    if character_count <= NOTES_CHUNK_CHARACTERS {
        return vec![text.to_string()];
    }

    let boundaries = text
        .char_indices()
        .map(|(index, _)| index)
        .chain(std::iter::once(text.len()))
        .collect::<Vec<_>>();
    let mut chunks = Vec::new();
    let mut start = 0;
    while start < character_count {
        let end = (start + NOTES_CHUNK_CHARACTERS).min(character_count);
        let chunk = text[boundaries[start]..boundaries[end]].trim();
        if !chunk.is_empty() {
            chunks.push(chunk.to_string());
        }
        if end == character_count {
            break;
        }
        start = end - NOTES_CHUNK_OVERLAP_CHARACTERS;
    }
    chunks
}
