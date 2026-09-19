use std::sync::OnceLock;

use crate::cv::OpResult;
use crate::cv::image::ImageU8;

use super::ColorMode;

const ANALYSIS_LONG_EDGE: usize = 384;
const CELL_EDGE: usize = 16;
const CHROMA_BIN_COUNT: usize = 48;
const PAPER_CHROMA_RADIUS: f32 = 0.032;
const NEUTRAL_CHROMA_SPREAD: f32 = 0.034;
const MIN_PAPER_LUMINANCE: f32 = 0.12;
const MAX_CELL_LOG_STEP: f32 = 0.14;
const MAX_PAPER_CURVATURE: f32 = 16.0;
const ENCODE_TABLE_SIZE: usize = 8192;

#[derive(Clone, Copy, Default)]
struct Sample {
    rgb: [f32; 3],
    luminance: f32,
    coverage: f32,
    unclipped: f32,
    smoothness: f32,
}

struct Analysis {
    width: usize,
    height: usize,
    samples: Vec<Sample>,
}

#[derive(Clone, Copy, Default)]
struct PaperCell {
    log_luminance: f32,
    weight: f32,
}

struct PaperField {
    width: usize,
    height: usize,
    log_luminance: Vec<f32>,
    confidence: Vec<f32>,
    target_log_luminance: f32,
    adaptation: [f32; 3],
}

struct TransferTables {
    decode: [f32; 256],
    encode: Vec<f32>,
}

fn transfer_tables() -> &'static TransferTables {
    static TABLES: OnceLock<TransferTables> = OnceLock::new();
    TABLES.get_or_init(|| TransferTables {
        decode: std::array::from_fn(|value| {
            let encoded = value as f32 / 255.0;
            if encoded <= 0.04045 {
                encoded / 12.92
            } else {
                ((encoded + 0.055) / 1.055).powf(2.4)
            }
        }),
        encode: (0..=ENCODE_TABLE_SIZE)
            .map(|index| {
                let linear = index as f32 / ENCODE_TABLE_SIZE as f32;
                255.0
                    * if linear <= 0.0031308 {
                        linear * 12.92
                    } else {
                        1.055 * linear.powf(1.0 / 2.4) - 0.055
                    }
            })
            .collect(),
    })
}

fn luminance(rgb: [f32; 3]) -> f32 {
    0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]
}

fn chromaticity(rgb: [f32; 3]) -> [f32; 3] {
    let total = (rgb[0] + rgb[1] + rgb[2]).max(f32::MIN_POSITIVE);
    rgb.map(|value| value / total)
}

fn chroma_distance(a: [f32; 3], b: [f32; 3]) -> f32 {
    a.into_iter()
        .zip(b)
        .map(|(left, right)| (left - right).abs())
        .fold(0.0, f32::max)
}

fn transition(value: f32, low: f32, high: f32) -> f32 {
    let t = ((value - low) / (high - low)).clamp(0.0, 1.0);
    t * t * (3.0 - 2.0 * t)
}

fn validate(image: &ImageU8, valid: Option<&[u8]>) -> OpResult<(usize, usize)> {
    if image.width <= 0 || image.height <= 0 || image.channels != 3 {
        return Err("document appearance requires a nonempty three-channel image".into());
    }
    let width = image.width as usize;
    let height = image.height as usize;
    let pixels = width
        .checked_mul(height)
        .ok_or_else(|| "document image dimensions overflow".to_string())?;
    let bytes = pixels
        .checked_mul(3)
        .ok_or_else(|| "document image byte count overflows".to_string())?;
    if image.data.len() != bytes {
        return Err("document image buffer does not match its dimensions".into());
    }
    if valid.is_some_and(|mask| mask.len() != pixels) {
        return Err("document validity mask does not match its image".into());
    }
    Ok((width, height))
}

fn analyze(image: &ImageU8, valid: Option<&[u8]>, long_edge: usize) -> Analysis {
    let source_width = image.width as usize;
    let source_height = image.height as usize;
    let ratio = (long_edge as f64 / source_width.max(source_height) as f64).min(1.0);
    let width = (source_width as f64 * ratio).round().max(1.0) as usize;
    let height = (source_height as f64 * ratio).round().max(1.0) as usize;
    let mut samples = vec![Sample::default(); width * height];
    let decode = &transfer_tables().decode;
    for y in 0..height {
        let top = y * source_height / height;
        let bottom = (y + 1) * source_height / height;
        for x in 0..width {
            let left = x * source_width / width;
            let right = (x + 1) * source_width / width;
            let mut rgb = [0.0; 3];
            let mut count = 0;
            let mut unclipped = 0;
            for source_y in top..bottom {
                for source_x in left..right {
                    let index = source_y * source_width + source_x;
                    if valid.is_some_and(|mask| mask[index] == 0) {
                        continue;
                    }
                    let pixel = &image.data[index * 3..index * 3 + 3];
                    unclipped += usize::from(pixel.iter().all(|&value| value < 254));
                    rgb[0] += decode[pixel[2] as usize];
                    rgb[1] += decode[pixel[1] as usize];
                    rgb[2] += decode[pixel[0] as usize];
                    count += 1;
                }
            }
            if count != 0 {
                rgb.iter_mut().for_each(|value| *value /= count as f32);
                samples[y * width + x] = Sample {
                    rgb,
                    luminance: luminance(rgb),
                    coverage: count as f32 / ((right - left) * (bottom - top)) as f32,
                    unclipped: unclipped as f32 / count as f32,
                    smoothness: 0.0,
                };
            }
        }
    }
    for y in 0..height {
        for x in 0..width {
            let index = y * width + x;
            let center = samples[index];
            if center.coverage < 0.6
                || center.unclipped < 0.9
                || center.luminance < MIN_PAPER_LUMINANCE
            {
                continue;
            }
            let mut low = center.luminance;
            let mut high = center.luminance;
            let mut chroma_range: f32 = 0.0;
            let center_chroma = chromaticity(center.rgb);
            for nearby_y in y.saturating_sub(1)..=(y + 1).min(height - 1) {
                for nearby_x in x.saturating_sub(1)..=(x + 1).min(width - 1) {
                    let neighbor = samples[nearby_y * width + nearby_x];
                    if neighbor.coverage >= 0.6 {
                        low = low.min(neighbor.luminance);
                        high = high.max(neighbor.luminance);
                        chroma_range = chroma_range
                            .max(chroma_distance(center_chroma, chromaticity(neighbor.rgb)));
                    }
                }
            }
            let local_range = (high - low) / center.luminance.max(MIN_PAPER_LUMINANCE);
            samples[index].smoothness = (1.0 - transition(local_range, 0.07, 0.25))
                * (1.0 - transition(chroma_range, 0.012, 0.055));
        }
    }
    Analysis {
        width,
        height,
        samples,
    }
}

fn paper_chromaticity(analysis: &Analysis) -> Option<[f32; 3]> {
    let mut histogram = vec![0.0f32; CHROMA_BIN_COUNT * CHROMA_BIN_COUNT];
    for sample in &analysis.samples {
        if sample.smoothness <= 0.0 {
            continue;
        }
        let chroma = chromaticity(sample.rgb);
        let x = (chroma[0] * CHROMA_BIN_COUNT as f32) as usize;
        let y = (chroma[2] * CHROMA_BIN_COUNT as f32) as usize;
        let x = x.min(CHROMA_BIN_COUNT - 1);
        let y = y.min(CHROMA_BIN_COUNT - 1);
        histogram[y * CHROMA_BIN_COUNT + x] +=
            sample.smoothness * sample.coverage * sample.luminance.sqrt();
    }
    let mut peak = (0, 0);
    let mut peak_weight = 0.0;
    for y in 0..CHROMA_BIN_COUNT {
        for x in 0..CHROMA_BIN_COUNT {
            let mut weight = 0.0;
            for near_y in y.saturating_sub(1)..=(y + 1).min(CHROMA_BIN_COUNT - 1) {
                for near_x in x.saturating_sub(1)..=(x + 1).min(CHROMA_BIN_COUNT - 1) {
                    let horizontal = if near_x == x { 2.0 } else { 1.0 };
                    let vertical = if near_y == y { 2.0 } else { 1.0 };
                    weight += histogram[near_y * CHROMA_BIN_COUNT + near_x] * horizontal * vertical;
                }
            }
            if weight > peak_weight {
                peak = (x, y);
                peak_weight = weight;
            }
        }
    }
    if peak_weight == 0.0 {
        return None;
    }
    let red = (peak.0 as f32 + 0.5) / CHROMA_BIN_COUNT as f32;
    let blue = (peak.1 as f32 + 0.5) / CHROMA_BIN_COUNT as f32;
    let mut center = [red, 1.0 - red - blue, blue];
    for _ in 0..3 {
        let mut sum = [0.0; 3];
        let mut weight = 0.0;
        for sample in &analysis.samples {
            let chroma = chromaticity(sample.rgb);
            if sample.smoothness > 0.0 && chroma_distance(center, chroma) < PAPER_CHROMA_RADIUS {
                let w = sample.smoothness * sample.coverage;
                for channel in 0..3 {
                    sum[channel] += chroma[channel] * w;
                }
                weight += w;
            }
        }
        if weight == 0.0 {
            return None;
        }
        center = chromaticity(sum);
    }
    Some(center)
}

fn estimate_field(analysis: &Analysis) -> Option<PaperField> {
    let chroma = paper_chromaticity(analysis)?;
    let width = analysis.width.div_ceil(CELL_EDGE);
    let height = analysis.height.div_ceil(CELL_EDGE);
    let mut cells = vec![PaperCell::default(); width * height];
    let mut eligible = Vec::with_capacity(CELL_EDGE * CELL_EDGE);
    let mut valid_weight = 0.0;
    let mut paper_weight = 0.0;
    for y in 0..height {
        for x in 0..width {
            eligible.clear();
            let left = x * analysis.width / width;
            let right = (x + 1) * analysis.width / width;
            let top = y * analysis.height / height;
            let bottom = (y + 1) * analysis.height / height;
            let mut supported = 0.0;
            let mut available = 0.0;
            for sample_y in top..bottom {
                for sample_x in left..right {
                    let sample = analysis.samples[sample_y * analysis.width + sample_x];
                    available += sample.coverage;
                    if sample.smoothness > 0.5
                        && chroma_distance(chromaticity(sample.rgb), chroma) < PAPER_CHROMA_RADIUS
                    {
                        eligible.push(sample.luminance);
                        supported += sample.coverage;
                    }
                }
            }
            valid_weight += available;
            paper_weight += supported;
            if supported >= available * 0.18 && eligible.len() >= 3 {
                eligible.sort_unstable_by(f32::total_cmp);
                let bright = eligible[eligible.len() * 3 / 4];
                let median = eligible[eligible.len() / 2];
                let spread = (bright / median).ln();
                cells[y * width + x] = PaperCell {
                    log_luminance: bright.ln(),
                    weight: (supported / available.max(1.0))
                        * (1.0 - transition(spread, 0.06, 0.22)),
                };
            }
        }
    }
    if valid_weight < 12.0 || paper_weight / valid_weight < 0.38 {
        return None;
    }
    retain_paper_component(&mut cells, width, height);
    if paper_curvature(&cells, width, height) > MAX_PAPER_CURVATURE {
        return None;
    }
    let supported_cells = cells.iter().filter(|cell| cell.weight > 0.0).count();
    if supported_cells < 2 || supported_cells as f32 / cells.len() as f32 <= 0.32 {
        return None;
    }
    let mut regions = [false; 9];
    for y in 0..height {
        for x in 0..width {
            if cells[y * width + x].weight > 0.0 {
                regions[(y * 3 / height).min(2) * 3 + (x * 3 / width).min(2)] = true;
            }
        }
    }
    if width >= 3 && height >= 3 && regions.iter().filter(|&&value| value).count() < 7 {
        return None;
    }
    let mut measured: Vec<f32> = cells
        .iter()
        .filter(|cell| cell.weight > 0.0)
        .map(|cell| cell.log_luminance)
        .collect();
    measured.sort_unstable_by(f32::total_cmp);
    let initial = measured[measured.len() / 2];
    let bright = measured[measured.len() * 9 / 10];
    let neutral = chroma.iter().copied().fold(f32::NEG_INFINITY, f32::max)
        - chroma.iter().copied().fold(f32::INFINITY, f32::min)
        < NEUTRAL_CHROMA_SPREAD;
    let target_log_luminance = if neutral {
        bright.max(0.965f32.ln())
    } else {
        bright
    };
    let mut field = vec![initial; width * height];
    let mut scratch = field.clone();
    let mut distance = vec![width + height; width * height];
    for (index, cell) in cells.iter().enumerate() {
        if cell.weight > 0.0 {
            field[index] = cell.log_luminance;
            distance[index] = 0;
        }
    }
    for _ in 0..(width + height) {
        let mut changed = false;
        for y in 0..height {
            for x in 0..width {
                let index = y * width + x;
                let old = distance[index];
                for neighbor in neighbors(x, y, width, height).into_iter().flatten() {
                    distance[index] = distance[index].min(distance[neighbor] + 1);
                }
                changed |= old != distance[index];
            }
        }
        if !changed {
            break;
        }
    }
    for _ in 0..(width.max(height) * 6) {
        for y in 0..height {
            for x in 0..width {
                let index = y * width + x;
                let evidence = cells[index].weight * 7.0;
                let mut sum = cells[index].log_luminance * evidence;
                let mut total = evidence;
                for neighbor in neighbors(x, y, width, height).into_iter().flatten() {
                    sum += field[neighbor];
                    total += 1.0;
                }
                scratch[index] = if total > 0.0 { sum / total } else { initial };
            }
        }
        std::mem::swap(&mut field, &mut scratch);
    }
    let confidence_start = (width.min(height) as f32 * 0.3).max(2.0);
    let confidence_end = (width.max(height) as f32 * 0.75).max(confidence_start + 1.0);
    let confidence = distance
        .into_iter()
        .map(|value| 1.0 - transition(value as f32, confidence_start, confidence_end))
        .collect();
    let adaptation = if neutral {
        let paper_luminance = luminance(chroma);
        chroma.map(|channel| (paper_luminance / channel.max(0.001)).clamp(0.88, 1.12))
    } else {
        [1.0; 3]
    };
    Some(PaperField {
        width,
        height,
        log_luminance: field,
        confidence,
        target_log_luminance,
        adaptation,
    })
}

fn neighbors(x: usize, y: usize, width: usize, height: usize) -> [Option<usize>; 4] {
    [
        (x > 0).then(|| y * width + x - 1),
        (x + 1 < width).then_some(y * width + x + 1),
        (y > 0).then(|| (y - 1) * width + x),
        (y + 1 < height).then_some((y + 1) * width + x),
    ]
}

fn paper_curvature(cells: &[PaperCell], width: usize, height: usize) -> f32 {
    let mut curvature = Vec::new();
    for y in 0..height {
        for x in 0..width {
            let center = cells[y * width + x];
            if center.weight == 0.0 {
                continue;
            }
            if x > 0 && x + 1 < width {
                let before = cells[y * width + x - 1];
                let after = cells[y * width + x + 1];
                if before.weight > 0.0 && after.weight > 0.0 {
                    curvature.push(
                        (before.log_luminance + after.log_luminance - 2.0 * center.log_luminance)
                            .abs()
                            * (width * width) as f32,
                    );
                }
            }
            if y > 0 && y + 1 < height {
                let before = cells[(y - 1) * width + x];
                let after = cells[(y + 1) * width + x];
                if before.weight > 0.0 && after.weight > 0.0 {
                    curvature.push(
                        (before.log_luminance + after.log_luminance - 2.0 * center.log_luminance)
                            .abs()
                            * (height * height) as f32,
                    );
                }
            }
        }
    }
    curvature.sort_unstable_by(f32::total_cmp);
    if curvature.is_empty() {
        0.0
    } else {
        curvature[curvature.len() * 3 / 4]
    }
}

fn retain_paper_component(cells: &mut [PaperCell], width: usize, height: usize) {
    let mut labels = vec![usize::MAX; cells.len()];
    let mut queue = Vec::with_capacity(cells.len());
    let mut best_label = 0;
    let mut best_weight = 0.0;
    let mut label = 0;
    for start in 0..cells.len() {
        if cells[start].weight <= 0.0 || labels[start] != usize::MAX {
            continue;
        }
        queue.clear();
        queue.push(start);
        labels[start] = label;
        let mut index = 0;
        let mut weight = 0.0;
        while index < queue.len() {
            let current = queue[index];
            weight += cells[current].weight * (0.3 * cells[current].log_luminance).exp();
            for neighbor in neighbors(current % width, current / width, width, height)
                .into_iter()
                .flatten()
            {
                if cells[neighbor].weight > 0.0
                    && labels[neighbor] == usize::MAX
                    && paper_cells_agree(cells, current, neighbor, width, height)
                {
                    labels[neighbor] = label;
                    queue.push(neighbor);
                }
            }
            index += 1;
        }
        if weight > best_weight {
            best_weight = weight;
            best_label = label;
        }
        label += 1;
    }
    for (cell, label) in cells.iter_mut().zip(labels) {
        if label != best_label {
            cell.weight = 0.0;
        }
    }
}

fn paper_cells_agree(
    cells: &[PaperCell],
    current: usize,
    neighbor: usize,
    width: usize,
    height: usize,
) -> bool {
    let step = (cells[neighbor].log_luminance - cells[current].log_luminance).abs();
    if step > MAX_CELL_LOG_STEP {
        return false;
    }
    let current_x = (current % width) as isize;
    let current_y = (current / width) as isize;
    let neighbor_x = (neighbor % width) as isize;
    let neighbor_y = (neighbor / width) as isize;
    let dx = neighbor_x - current_x;
    let dy = neighbor_y - current_y;
    let before = (current_x - dx, current_y - dy);
    let after = (neighbor_x + dx, neighbor_y + dy);
    let at = |(x, y): (isize, isize)| {
        (x >= 0 && y >= 0 && x < width as isize && y < height as isize)
            .then(|| cells[y as usize * width + x as usize])
            .filter(|cell| cell.weight > 0.0)
    };
    if let (Some(before), Some(after)) = (at(before), at(after)) {
        let slope = (cells[current].log_luminance - before.log_luminance)
            .abs()
            .max((after.log_luminance - cells[neighbor].log_luminance).abs());
        step <= slope * 2.0 + 0.035
    } else {
        true
    }
}

fn interpolate(values: &[f32], width: usize, height: usize, x: f32, y: f32) -> f32 {
    let x = (x * width as f32 - 0.5).clamp(0.0, (width - 1) as f32);
    let y = (y * height as f32 - 0.5).clamp(0.0, (height - 1) as f32);
    let left = x as usize;
    let top = y as usize;
    let right = (left + 1).min(width - 1);
    let bottom = (top + 1).min(height - 1);
    let fx = x - left as f32;
    let fy = y - top as f32;
    let upper = values[top * width + left] * (1.0 - fx) + values[top * width + right] * fx;
    let lower = values[bottom * width + left] * (1.0 - fx) + values[bottom * width + right] * fx;
    upper * (1.0 - fy) + lower * fy
}

fn encode(value: f32, table: &[f32]) -> u8 {
    let index = value.clamp(0.0, 1.0) * ENCODE_TABLE_SIZE as f32;
    let low = index as usize;
    let high = (low + 1).min(ENCODE_TABLE_SIZE);
    let fraction = index - low as f32;
    (table[low] * (1.0 - fraction) + table[high] * fraction).round() as u8
}

fn render(image: &mut ImageU8, valid: Option<&[u8]>, field: Option<&PaperField>, grayscale: bool) {
    let width = image.width as usize;
    let height = image.height as usize;
    let tables = transfer_tables();
    for (index, pixel) in image.data.as_chunks_mut::<3>().0.iter_mut().enumerate() {
        if valid.is_some_and(|mask| mask[index] == 0) {
            pixel.fill(255);
            continue;
        }
        if field.is_none() && !grayscale {
            continue;
        }
        let mut rgb = [
            tables.decode[pixel[2] as usize],
            tables.decode[pixel[1] as usize],
            tables.decode[pixel[0] as usize],
        ];
        if let Some(field) = field {
            let x = (index % width) as f32 / width as f32 + 0.5 / width as f32;
            let y = (index / width) as f32 / height as f32 + 0.5 / height as f32;
            let paper = interpolate(&field.log_luminance, field.width, field.height, x, y);
            let confidence = interpolate(&field.confidence, field.width, field.height, x, y);
            let gain =
                ((field.target_log_luminance - paper).clamp(-0.08, 4.0f32.ln()) * confidence).exp();
            for (value, adaptation) in rgb.iter_mut().zip(field.adaptation) {
                *value *= gain * (1.0 + (adaptation - 1.0) * confidence);
            }
            let maximum = rgb.iter().copied().fold(1.0, f32::max);
            rgb.iter_mut().for_each(|value| *value /= maximum);
        }
        if grayscale {
            pixel.fill(encode(luminance(rgb), &tables.encode));
        } else {
            pixel[0] = encode(rgb[2], &tables.encode);
            pixel[1] = encode(rgb[1], &tables.encode);
            pixel[2] = encode(rgb[0], &tables.encode);
        }
    }
}

fn meaningful_color(image: &ImageU8, valid: Option<&[u8]>) -> bool {
    let width = image.width as usize;
    let height = image.height as usize;
    let mut coherent = 0;
    for y in 0..height {
        for x in 0..width {
            let index = y * width + x;
            if valid.is_some_and(|mask| mask[index] == 0) {
                continue;
            }
            let pixel = &image.data[index * 3..index * 3 + 3];
            let low = pixel[0].min(pixel[1]).min(pixel[2]) as i16;
            let high = pixel[0].max(pixel[1]).max(pixel[2]) as i16;
            if high - low < 13 {
                continue;
            }
            if width * height < 36 {
                return true;
            }
            let differences = [
                pixel[2] as i16 - pixel[1] as i16,
                pixel[0] as i16 - pixel[1] as i16,
            ];
            let mut matched = false;
            for neighbor in [
                (x + 1 < width).then_some(index + 1),
                (y + 1 < height).then_some(index + width),
            ]
            .into_iter()
            .flatten()
            {
                if valid.is_some_and(|mask| mask[neighbor] == 0) {
                    continue;
                }
                let other = &image.data[neighbor * 3..neighbor * 3 + 3];
                let other_differences = [
                    other[2] as i16 - other[1] as i16,
                    other[0] as i16 - other[1] as i16,
                ];
                let dot = differences[0] as i32 * other_differences[0] as i32
                    + differences[1] as i32 * other_differences[1] as i32;
                let length = differences[0] as i32 * differences[0] as i32
                    + differences[1] as i32 * differences[1] as i32;
                matched |= dot > length / 2;
            }
            if matched {
                coherent += 1;
                if coherent >= 6 {
                    return true;
                }
            }
        }
    }
    false
}

pub(super) fn render_document(
    image: &mut ImageU8,
    valid: Option<&[u8]>,
    requested_mode: Option<ColorMode>,
) -> OpResult<ColorMode> {
    validate(image, valid)?;
    let analysis = analyze(image, valid, ANALYSIS_LONG_EDGE);
    let field = estimate_field(&analysis);
    let explicit_grayscale = matches!(requested_mode, Some(ColorMode::Grayscale));
    render(image, valid, field.as_ref(), explicit_grayscale);
    let mode = requested_mode.unwrap_or_else(|| {
        if meaningful_color(image, valid) {
            ColorMode::Color
        } else {
            ColorMode::Grayscale
        }
    });
    if requested_mode.is_none() && matches!(mode, ColorMode::Grayscale) {
        render(image, valid, None, true);
    }
    Ok(mode)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[derive(Clone, Copy, PartialEq, Eq)]
    enum Region {
        Paper,
        Ink,
        Faint,
        Color,
        Illustration,
    }

    struct Fixture {
        clean: ImageU8,
        shaded: ImageU8,
        regions: Vec<Region>,
    }

    fn process(image: &mut ImageU8, valid: Option<&[u8]>, mode: Option<ColorMode>) -> ColorMode {
        match render_document(image, valid, mode) {
            Ok(mode) => mode,
            Err(error) => panic!("{error}"),
        }
    }

    fn image(width: usize, height: usize, rgb: [u8; 3]) -> ImageU8 {
        ImageU8 {
            width: width as i32,
            height: height as i32,
            channels: 3,
            data: [rgb[2], rgb[1], rgb[0]].repeat(width * height),
        }
    }

    fn document(width: usize, height: usize, stock: [u8; 3], color: bool) -> Fixture {
        let mut clean = image(width, height, stock);
        let mut shaded = clean.clone();
        let mut regions = vec![Region::Paper; width * height];
        let transfer = transfer_tables();
        for y in 0..height {
            for x in 0..width {
                let index = y * width + x;
                let mut rgb = stock;
                let nx = x as f32 / width as f32;
                let ny = y as f32 / height as f32;
                if (0.09..0.84).contains(&nx)
                    && (0.10..0.66).contains(&ny)
                    && y % 29 < 3
                    && x % 17 < 11
                {
                    rgb = [38; 3];
                    regions[index] = Region::Ink;
                }
                if (0.11..0.83).contains(&nx) && y == height * 7 / 10 {
                    rgb = stock.map(|value| value.saturating_sub(15));
                    regions[index] = Region::Faint;
                }
                if color && (0.77..0.87).contains(&ny) && (0.08..0.89).contains(&nx) {
                    let patch = ((nx - 0.08) / 0.21) as usize;
                    rgb = [[185, 33, 58], [21, 103, 206], [30, 163, 88], [239, 180, 38]]
                        [patch.min(3)];
                    regions[index] = Region::Color;
                }
                if color
                    && (0.34..0.37).contains(&ny)
                    && (0.08..0.89).contains(&nx)
                    && regions[index] == Region::Paper
                {
                    rgb = [244, 235, 120];
                    regions[index] = Region::Color;
                }
                let illumination = 0.37 + 0.55 * nx + 0.045 * (ny * 5.0).sin();
                for (channel, value) in rgb.into_iter().enumerate() {
                    clean.data[index * 3 + 2 - channel] = value;
                    shaded.data[index * 3 + 2 - channel] = encode(
                        transfer.decode[value as usize] * illumination,
                        &transfer.encode,
                    );
                }
            }
        }
        Fixture {
            clean,
            shaded,
            regions,
        }
    }

    fn region_mean(image: &ImageU8, regions: &[Region], region: Region) -> f32 {
        let mut sum = 0.0;
        let mut count = 0;
        for (pixel, &kind) in image.data.as_chunks::<3>().0.iter().zip(regions) {
            if kind == region {
                sum += pixel.iter().map(|&value| value as f32).sum::<f32>() / 3.0;
                count += 1;
            }
        }
        sum / count as f32
    }

    fn region_error(
        image: &ImageU8,
        reference: &ImageU8,
        regions: &[Region],
        region: Region,
    ) -> f32 {
        let mut sum = 0.0;
        let mut count = 0;
        for ((pixel, expected), &kind) in image
            .data
            .as_chunks::<3>()
            .0
            .iter()
            .zip(reference.data.as_chunks::<3>().0.iter())
            .zip(regions)
        {
            if kind == region {
                for channel in 0..3 {
                    sum += (pixel[channel] as f32 - expected[channel] as f32).abs();
                    count += 1;
                }
            }
        }
        sum / count as f32
    }

    fn paper_deviation(image: &ImageU8, regions: &[Region]) -> f32 {
        let mean = region_mean(image, regions, Region::Paper);
        let mut squared = 0.0;
        let mut count = 0;
        for (pixel, &kind) in image.data.as_chunks::<3>().0.iter().zip(regions) {
            if kind == Region::Paper {
                let value = pixel.iter().map(|&value| value as f32).sum::<f32>() / 3.0;
                squared += (value - mean).powi(2);
                count += 1;
            }
        }
        (squared / count as f32).sqrt()
    }

    #[test]
    fn restores_shaded_color_paper_without_erasing_faint_strokes() {
        let fixture = document(512, 704, [248; 3], true);
        let mut rendered = fixture.shaded.clone();
        let mode = process(&mut rendered, None, None);
        let paper_error = region_error(&rendered, &fixture.clean, &fixture.regions, Region::Paper);
        let color_error = region_error(&rendered, &fixture.clean, &fixture.regions, Region::Color);
        let deviation = paper_deviation(&rendered, &fixture.regions);
        let faint_contrast = region_mean(&rendered, &fixture.regions, Region::Paper)
            - region_mean(&rendered, &fixture.regions, Region::Faint);
        eprintln!(
            "neutral page: paper MAE {paper_error:.3}, color MAE {color_error:.3}, paper SD {deviation:.3}, faint contrast {faint_contrast:.3}"
        );
        assert!(matches!(mode, ColorMode::Color));
        assert!(paper_error < 7.0);
        assert!(color_error < 8.0);
        assert!(deviation < paper_deviation(&fixture.shaded, &fixture.regions) * 0.2);
        assert!(faint_contrast > 11.0);
        assert!(region_mean(&rendered, &fixture.regions, Region::Ink) < 48.0);
    }

    #[test]
    fn color_and_grayscale_share_the_same_paper_correction() {
        let fixture = document(384, 512, [248; 3], false);
        let mut color = fixture.shaded.clone();
        let mut gray = fixture.shaded;
        assert!(matches!(
            process(&mut color, None, Some(ColorMode::Color)),
            ColorMode::Color
        ));
        assert!(matches!(
            process(&mut gray, None, Some(ColorMode::Grayscale)),
            ColorMode::Grayscale
        ));
        assert_eq!(color.data, gray.data);
        assert!(paper_deviation(&gray, &fixture.regions) < 4.0);
    }

    #[test]
    fn shaded_colored_stock_preserves_its_tint_and_flattens_light() {
        let fixture = document(416, 608, [235, 211, 159], true);
        let mut rendered = fixture.shaded.clone();
        assert!(matches!(
            process(&mut rendered, None, None),
            ColorMode::Color
        ));
        let deviation = paper_deviation(&rendered, &fixture.regions);
        eprintln!("colored stock: paper SD {deviation:.3}");
        assert!(deviation < paper_deviation(&fixture.shaded, &fixture.regions) * 0.25);
        let pixel = &rendered.data[3 * (40 * 416 + 40)..][..3];
        assert!(pixel[2] > pixel[1] + 17);
        assert!(pixel[1] > pixel[0] + 38);
        let decode = &transfer_tables().decode;
        let expected = chromaticity([decode[235], decode[211], decode[159]]);
        let actual = chromaticity([
            decode[pixel[2] as usize],
            decode[pixel[1] as usize],
            decode[pixel[0] as usize],
        ]);
        assert!(chroma_distance(expected, actual) < 0.005);
    }

    #[test]
    fn keeps_tiny_coherent_stamps_and_one_pixel_color_strokes() {
        let mut stamped = image(1600, 2200, [244; 3]);
        for y in 1200..1209 {
            for x in 400..407 {
                let offset = (y * 1600 + x) * 3;
                stamped.data[offset..offset + 3].copy_from_slice(&[61, 32, 194]);
            }
        }
        assert!(matches!(
            process(&mut stamped, None, None),
            ColorMode::Color
        ));
        let mut signature = image(700, 1000, [244; 3]);
        for x in 230..249 {
            let offset = (720 * 700 + x) * 3;
            signature.data[offset..offset + 3].copy_from_slice(&[120, 60, 44]);
        }
        assert!(matches!(
            process(&mut signature, None, None),
            ColorMode::Color
        ));
    }

    #[test]
    fn photograph_without_broad_paper_support_is_unchanged() {
        let mut photo = image(384, 512, [0; 3]);
        for y in 0..512 {
            for x in 0..384 {
                let index = (y * 384 + x) * 3;
                let noise = ((x * 37 + y * 73 + x * y * 7) % 25) as u8;
                let rgb = if y < 200 {
                    [65 + noise, 130 + noise, 190 + noise]
                } else {
                    [45 + noise, 68 + noise, 29 + noise]
                };
                photo.data[index..index + 3].copy_from_slice(&[rgb[2], rgb[1], rgb[0]]);
            }
        }
        let original = photo.data.clone();
        assert!(matches!(process(&mut photo, None, None), ColorMode::Color));
        assert_eq!(photo.data, original);
    }

    #[test]
    fn large_neutral_graphics_are_not_used_as_dark_paper() {
        let mut fixture = document(512, 704, [248; 3], false);
        let transfer = transfer_tables();
        for y in 300..530 {
            for x in 150..380 {
                let index = y * 512 + x;
                let illumination =
                    0.37 + 0.55 * x as f32 / 512.0 + 0.045 * (y as f32 / 704.0 * 5.0).sin();
                fixture.clean.data[index * 3..index * 3 + 3].fill(119);
                fixture.shaded.data[index * 3..index * 3 + 3].fill(encode(
                    transfer.decode[119] * illumination,
                    &transfer.encode,
                ));
                fixture.regions[index] = Region::Illustration;
            }
        }
        let mut rendered = fixture.shaded;
        process(&mut rendered, None, Some(ColorMode::Color));
        let error = region_error(
            &rendered,
            &fixture.clean,
            &fixture.regions,
            Region::Illustration,
        );
        eprintln!("neutral illustration MAE {error:.3}");
        assert!(region_mean(&rendered, &fixture.regions, Region::Illustration) < 132.0);
        assert!(error < 16.0);
    }

    #[test]
    fn missing_pixels_do_not_contribute_to_analysis_and_finish_neutral() {
        let fixture = document(256, 352, [248; 3], false);
        let mut first = fixture.shaded;
        let mut second = first.clone();
        let mut mask = vec![1; 256 * 352];
        for y in 0..352 {
            for x in 0..32 {
                let index = y * 256 + x;
                mask[index] = 0;
                first.data[index * 3..index * 3 + 3].copy_from_slice(&[255, 0, 128]);
                second.data[index * 3..index * 3 + 3].fill(0);
            }
        }
        process(&mut first, Some(&mask), None);
        process(&mut second, Some(&mask), None);
        assert_eq!(first.data, second.data);
        for (pixel, valid) in first.data.as_chunks::<3>().0.iter().zip(mask) {
            if valid == 0 {
                assert_eq!(*pixel, [255; 3]);
            }
        }
    }

    #[test]
    fn invalid_inputs_are_rejected_before_mutation() {
        let mut invalid = image(20, 20, [130; 3]);
        let original = invalid.clone();
        assert!(render_document(&mut invalid, Some(&[1; 7]), None).is_err());
        assert_eq!(invalid, original);
        invalid.width = i32::MAX;
        invalid.height = i32::MAX;
        let original = invalid.clone();
        assert!(render_document(&mut invalid, None, None).is_err());
        assert_eq!(invalid, original);
        invalid.width = 0;
        assert!(render_document(&mut invalid, None, None).is_err());
    }

    #[test]
    fn blank_degenerate_and_fully_masked_pages_are_safe() {
        for (width, height) in [(1, 1), (1, 400), (400, 1), (64, 96)] {
            for value in [0, 71, 176, 245, 255] {
                let mut blank = image(width, height, [value; 3]);
                assert!(matches!(
                    process(&mut blank, None, None),
                    ColorMode::Grayscale
                ));
                assert!(
                    blank
                        .data
                        .as_chunks::<3>()
                        .0
                        .iter()
                        .all(|pixel| pixel[0] == pixel[1] && pixel[1] == pixel[2])
                );
            }
        }
        let mut missing = image(32, 48, [97, 124, 48]);
        assert!(matches!(
            process(&mut missing, Some(&[0; 32 * 48]), None),
            ColorMode::Grayscale
        ));
        assert!(missing.data.iter().all(|&value| value == 255));
        for (width, height) in [(1, 1), (1, 2), (2, 1), (4, 4)] {
            let mut tiny = image(width, height, [184, 38, 91]);
            assert!(matches!(process(&mut tiny, None, None), ColorMode::Color));
        }
    }

    #[test]
    fn noise_does_not_erase_faint_paper_marks() {
        let mut fixture = document(384, 544, [248; 3], false);
        for (index, pixel) in fixture
            .shaded
            .data
            .as_chunks_mut::<3>()
            .0
            .iter_mut()
            .enumerate()
        {
            let noise = ((index * 37 + index / 384 * 19) % 5) as i16 - 2;
            pixel
                .iter_mut()
                .for_each(|value| *value = (*value as i16 + noise).clamp(0, 255) as u8);
        }
        let mut output = fixture.shaded;
        process(&mut output, None, None);
        let faint_contrast = region_mean(&output, &fixture.regions, Region::Paper)
            - region_mean(&output, &fixture.regions, Region::Faint);
        assert!(faint_contrast > 10.0);
        assert!(paper_deviation(&output, &fixture.regions) < 5.0);
    }

    #[test]
    fn color_conversion_is_identity_without_a_field() {
        let mut pixels = image(256, 1, [0; 3]);
        for value in 0..256 {
            pixels.data[value * 3..value * 3 + 3].fill(value as u8);
        }
        let expected = pixels.data.clone();
        render(&mut pixels, None, None, true);
        assert_eq!(pixels.data, expected);
    }

    #[test]
    fn broad_faint_graphics_keep_their_contrast() {
        for value in [226, 236, 242] {
            let mut page = image(512, 704, [248; 3]);
            for y in 290..490 {
                for x in 140..350 {
                    page.data[(y * 512 + x) * 3..][..3].fill(value);
                }
            }
            process(&mut page, None, None);
            let paper = page.data[(250 * 512 + 245) * 3];
            let graphic = page.data[(390 * 512 + 245) * 3];
            eprintln!("faint graphic {value}: paper {paper}, graphic {graphic}");
            assert!(paper as i16 - graphic as i16 >= (248 - value as i16) * 3 / 4);
        }
    }

    #[test]
    fn embedded_photograph_receives_the_surrounding_paper_correction() {
        let mut fixture = document(448, 640, [248; 3], true);
        let transfer = transfer_tables();
        for y in 130..510 {
            for x in 90..360 {
                let index = y * 448 + x;
                let nx = x as f32 / 448.0;
                let ny = y as f32 / 640.0;
                let wave = (x as f32 * 0.073).sin() * (y as f32 * 0.052).cos();
                let rgb = [0.15 + 0.05 * wave, 0.35 + 0.13 * wave, 0.48 - 0.07 * wave];
                let illumination = 0.37 + 0.55 * nx + 0.045 * (ny * 5.0).sin();
                for (channel, value) in rgb.into_iter().enumerate() {
                    fixture.clean.data[index * 3 + 2 - channel] = encode(value, &transfer.encode);
                    fixture.shaded.data[index * 3 + 2 - channel] =
                        encode(value * illumination, &transfer.encode);
                }
                fixture.regions[index] = Region::Illustration;
            }
        }
        let mut output = fixture.shaded;
        process(&mut output, None, None);
        let error = region_error(
            &output,
            &fixture.clean,
            &fixture.regions,
            Region::Illustration,
        );
        eprintln!("embedded photograph MAE {error:.3}");
        assert!(error < 8.0);
    }

    #[test]
    fn held_out_illumination_shapes_and_neutral_casts_recover_the_reference() {
        let transfer = transfer_tables();
        for scenario in 0..3 {
            let mut fixture = document(480, 688, [248; 3], true);
            for (index, pixel) in fixture
                .shaded
                .data
                .as_chunks_mut::<3>()
                .0
                .iter_mut()
                .enumerate()
            {
                let x = (index % 480) as f32 / 480.0;
                let y = (index / 480) as f32 / 688.0;
                let illumination = match scenario {
                    0 => 0.65 + 0.24 * (y * 5.1 + 0.8).cos(),
                    1 => 0.91 - 0.47 * (-((x - 0.32).powi(2) + (y - 0.62).powi(2)) / 0.09).exp(),
                    _ => 0.36 + 0.55 * (0.3 * x + 0.7 * y),
                };
                for (channel, value) in pixel.iter_mut().enumerate() {
                    let cast = if scenario == 2 {
                        [0.975, 1.0, 1.025][channel]
                    } else {
                        1.0
                    };
                    *value = encode(
                        transfer.decode[fixture.clean.data[index * 3 + channel] as usize]
                            * illumination
                            * cast,
                        &transfer.encode,
                    );
                }
            }
            let mut output = fixture.shaded;
            process(&mut output, None, None);
            let paper = region_error(&output, &fixture.clean, &fixture.regions, Region::Paper);
            let color = region_error(&output, &fixture.clean, &fixture.regions, Region::Color);
            let deviation = paper_deviation(&output, &fixture.regions);
            eprintln!(
                "held-out lighting {scenario}: paper MAE {paper:.3}, color MAE {color:.3}, paper SD {deviation:.3}"
            );
            assert!(paper < 7.0);
            assert!(color < 10.0);
            assert!(deviation < 5.0);
        }
    }

    #[test]
    fn hard_shadow_boundaries_are_not_erased_as_paper() {
        let mut fixture = document(400, 560, [248; 3], true);
        let transfer = transfer_tables();
        for (index, pixel) in fixture
            .shaded
            .data
            .as_chunks_mut::<3>()
            .0
            .iter_mut()
            .enumerate()
        {
            let illumination = if index % 400 < 170 { 0.42 } else { 0.91 };
            for (channel, value) in pixel.iter_mut().enumerate() {
                *value = encode(
                    transfer.decode[fixture.clean.data[index * 3 + channel] as usize]
                        * illumination,
                    &transfer.encode,
                );
            }
        }
        let mut output = fixture.shaded;
        process(&mut output, None, None);
        let faint_contrast = region_mean(&output, &fixture.regions, Region::Paper)
            - region_mean(&output, &fixture.regions, Region::Faint);
        assert!(faint_contrast > 10.0);
        assert!(region_mean(&output, &fixture.regions, Region::Ink) < 42.0);
        assert!(meaningful_color(&output, None));
    }

    #[test]
    fn ambiguous_strong_illumination_and_colored_stock_keep_their_tint() {
        for tint in [[248, 214, 171], [188, 221, 248], [243, 220, 238]] {
            let mut page = image(320, 448, tint);
            process(&mut page, None, None);
            let original = [tint[2], tint[1], tint[0]];
            assert!(
                page.data
                    .as_chunks::<3>()
                    .0
                    .iter()
                    .all(|pixel| pixel.iter().zip(original).all(|(&a, b)| a.abs_diff(b) <= 1))
            );
            assert!(meaningful_color(&page, None));
        }
    }

    #[test]
    fn monochrome_photographic_tones_do_not_become_white_paper() {
        let mut photo = image(384, 512, [0; 3]);
        let transfer = transfer_tables();
        for (index, pixel) in photo.data.as_chunks_mut::<3>().0.iter_mut().enumerate() {
            let x = (index % 384) as f32 / 384.0;
            let y = (index / 384) as f32 / 512.0;
            let tone = 0.27
                + 0.16 * (x * 8.0 + y * 3.0).sin() * (y * 7.0).cos()
                + 0.06 * (x * 18.0 - y * 14.0).cos();
            pixel.fill(encode(tone, &transfer.encode));
        }
        let before = photo.data.clone();
        process(&mut photo, None, None);
        let change = photo
            .data
            .iter()
            .zip(before)
            .map(|(&a, b)| a.abs_diff(b) as f32)
            .sum::<f32>()
            / photo.data.len() as f32;
        eprintln!("monochrome photograph change {change:.3}");
        assert!(change < 3.0);
    }

    #[test]
    fn clipped_reflections_do_not_set_the_paper_level() {
        let mut page = image(320, 448, [235; 3]);
        for y in 150..300 {
            for x in 130..260 {
                page.data[(y * 320 + x) * 3..][..3].fill(255);
            }
        }
        let analysis = analyze(&page, None, ANALYSIS_LONG_EDGE);
        assert!(
            analysis
                .samples
                .iter()
                .filter(|sample| sample.unclipped == 0.0)
                .all(|sample| sample.smoothness == 0.0)
        );
        process(&mut page, None, None);
        let paper = page.data[(30 * 320 + 30) * 3];
        assert!((250..=252).contains(&paper));
        assert_eq!(page.data[(200 * 320 + 200) * 3], 255);
    }

    #[test]
    #[ignore = "appearance calibration and timing report"]
    fn analysis_resolution_calibration() {
        for (width, height) in [(836, 1196), (1180, 1694), (1668, 2396)] {
            let fixture = document(width, height, [248; 3], true);
            for long_edge in [192, 288, 384, 512] {
                let mut elapsed = Vec::new();
                let mut output = fixture.shaded.clone();
                let mut samples = 0;
                for _ in 0..11 {
                    output.data.copy_from_slice(&fixture.shaded.data);
                    let start = std::time::Instant::now();
                    let analysis = analyze(&output, None, long_edge);
                    samples = analysis.samples.len();
                    let field = estimate_field(&analysis);
                    render(&mut output, None, field.as_ref(), false);
                    assert!(meaningful_color(&output, None));
                    elapsed.push(start.elapsed().as_secs_f64() * 1000.0);
                }
                elapsed.sort_unstable_by(f64::total_cmp);
                let paper = region_error(&output, &fixture.clean, &fixture.regions, Region::Paper);
                let color = region_error(&output, &fixture.clean, &fixture.regions, Region::Color);
                let deviation = paper_deviation(&output, &fixture.regions);
                eprintln!(
                    "{} pixels, analysis {long_edge}, sample bytes {}, median {:.3} ms, p95 {:.3} ms, paper MAE {paper:.3}, color MAE {color:.3}, paper SD {deviation:.3}",
                    width * height,
                    samples * std::mem::size_of::<Sample>(),
                    elapsed[5],
                    elapsed[10]
                );
            }
        }
    }
}
