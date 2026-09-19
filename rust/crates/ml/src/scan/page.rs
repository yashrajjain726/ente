use super::{OpResult, Point, Quad};
use crate::cv::image::ImageU8;
use crate::cv::projective::{ProjectiveMap, WarpedImage, warp_document};

#[derive(Clone, Copy, Debug)]
pub(super) struct SourceExtent {
    pub width: f64,
    pub height: f64,
}

impl SourceExtent {
    pub fn new(width: i32, height: i32) -> OpResult<Self> {
        if width <= 0 || height <= 0 {
            return Err("source dimensions must be positive".to_owned());
        }
        Ok(Self {
            width: width as f64,
            height: height as f64,
        })
    }

    pub fn full_frame(self) -> Quad {
        quad_from_points([
            Point { x: 0.0, y: 0.0 },
            Point {
                x: self.width,
                y: 0.0,
            },
            Point {
                x: self.width,
                y: self.height,
            },
            Point {
                x: 0.0,
                y: self.height,
            },
        ])
    }
}

pub(super) fn points(quad: Quad) -> [Point; 4] {
    [
        quad.top_left,
        quad.top_right,
        quad.bottom_right,
        quad.bottom_left,
    ]
}

pub(super) fn quad_from_points(p: [Point; 4]) -> Quad {
    Quad {
        top_left: p[0],
        top_right: p[1],
        bottom_right: p[2],
        bottom_left: p[3],
    }
}

pub(super) fn cross(a: Point, b: Point, c: Point) -> f64 {
    (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
}

pub(super) fn distance(a: Point, b: Point) -> f64 {
    (a.x - b.x).hypot(a.y - b.y)
}

pub(super) fn area(p: &[Point; 4]) -> f64 {
    (0..4)
        .map(|i| p[i].x * p[(i + 1) % 4].y - p[i].y * p[(i + 1) % 4].x)
        .sum::<f64>()
        * 0.5
}

pub(super) fn validate_quad(quad: Quad, extent: SourceExtent) -> OpResult<()> {
    let p = points(quad).map(|p| Point {
        x: p.x / extent.width,
        y: p.y / extent.height,
    });
    if p.iter().any(|p| {
        !p.x.is_finite()
            || !p.y.is_finite()
            || p.x < -0.08
            || p.y < -0.08
            || p.x > 1.08
            || p.y > 1.08
    }) {
        return Err("quad is non-finite or extends too far outside the source".to_owned());
    }
    let polygon_area = area(&p);
    if polygon_area <= 1e-10
        || (0..4).any(|i| cross(p[i], p[(i + 1) % 4], p[(i + 2) % 4]) <= polygon_area * 1e-7)
    {
        return Err("quad must be a non-degenerate clockwise convex polygon".to_owned());
    }
    ProjectiveMap::from_unit_quad(p.map(|p| (p.x, p.y)))?;
    Ok(())
}

pub(super) fn quarter_turns(degrees: i32) -> OpResult<usize> {
    if degrees % 90 != 0 {
        return Err("rotation must be a multiple of 90 degrees".to_owned());
    }
    Ok((degrees / 90).rem_euclid(4) as usize)
}

pub(super) fn rotate_mask_quad(quad: Quad, turns: usize, side: f64) -> Quad {
    let rotated = points(quad).map(|p| match turns {
        0 => p,
        1 => Point {
            x: side - p.y,
            y: p.x,
        },
        2 => Point {
            x: side - p.x,
            y: side - p.y,
        },
        _ => Point {
            x: p.y,
            y: side - p.x,
        },
    });
    quad_from_points(std::array::from_fn(|i| rotated[(i + 4 - turns) % 4]))
}

#[derive(Debug, Clone, Copy)]
pub(super) enum AspectEvidence {
    OppositeEdges,
    CameraBlend(f64),
}

pub(super) struct RenderPlan {
    pub width: i32,
    pub height: i32,
    pub map: ProjectiveMap,
    pub aspect_evidence: AspectEvidence,
}

fn aspect_ratio(quad: Quad, extent: SourceExtent) -> OpResult<(f64, AspectEvidence)> {
    let p = points(quad);
    let horizontal = (distance(p[0], p[1]) * distance(p[2], p[3])).sqrt();
    let vertical = (distance(p[1], p[2]) * distance(p[3], p[0])).sqrt();
    let edge_ratio = horizontal / vertical;
    let normalized = p.map(|p| {
        (
            (p.x - extent.width * 0.5) / extent.width,
            (p.y - extent.height * 0.5) / extent.width,
        )
    });
    let h = ProjectiveMap::from_unit_quad(normalized)?.coefficients;
    let denominator = h[6] * h[7];
    let focal_squared = -(h[0] * h[1] + h[3] * h[4]) / denominator;
    let diagonal = extent.width.hypot(extent.height) / extent.width;
    if denominator.abs() < 1e-5 || !focal_squared.is_finite() || focal_squared <= 0.0 {
        return Ok((edge_ratio, AspectEvidence::OppositeEdges));
    }
    let focal = focal_squared.sqrt() / diagonal;
    let ratio = ((h[0] * h[0] + h[3] * h[3] + focal_squared * h[6] * h[6])
        / (h[1] * h[1] + h[4] * h[4] + focal_squared * h[7] * h[7]))
        .sqrt();
    let focal_support =
        ((focal - 0.35) / 0.35).clamp(0.0, 1.0) * ((4.0 - focal) / 2.0).clamp(0.0, 1.0);
    let perspective_support = (h[6].abs().min(h[7].abs()) / 0.2).clamp(0.0, 1.0);
    let agreement = (1.0 - (ratio / edge_ratio).ln().abs() / 1.8f64.ln()).clamp(0.0, 1.0);
    let confidence = focal_support * perspective_support * agreement;
    if confidence == 0.0 || !ratio.is_finite() {
        return Ok((edge_ratio, AspectEvidence::OppositeEdges));
    }
    Ok((
        (edge_ratio.ln() * (1.0 - confidence) + ratio.ln() * confidence).exp(),
        AspectEvidence::CameraBlend(confidence),
    ))
}

pub(super) fn checked_dimensions(width: f64, height: f64, max_pixels: u32) -> OpResult<(i32, i32)> {
    if max_pixels == 0
        || !width.is_finite()
        || !height.is_finite()
        || width <= 0.0
        || height <= 0.0
        || !(width * height).is_finite()
    {
        return Err("render dimensions and pixel budget must be positive and finite".to_owned());
    }
    let scale = (max_pixels as f64 / (width * height)).sqrt().min(1.0);
    let mut w = (width * scale + f64::EPSILON * width * scale * 16.0)
        .floor()
        .max(1.0)
        .min(max_pixels as f64) as u64;
    let mut h = (height * scale + f64::EPSILON * height * scale * 16.0)
        .floor()
        .max(1.0)
        .min(max_pixels as f64) as u64;
    if w * h > max_pixels as u64 {
        if w >= h {
            w = max_pixels as u64 / h;
        } else {
            h = max_pixels as u64 / w;
        }
    }
    let w = i32::try_from(w).map_err(|_| "render width is too large".to_owned())?;
    let h = i32::try_from(h).map_err(|_| "render height is too large".to_owned())?;
    Ok((w, h))
}

impl RenderPlan {
    pub fn new(
        quad: Quad,
        extent: SourceExtent,
        rotation_degrees: i32,
        max_pixels: u32,
    ) -> OpResult<Self> {
        validate_quad(quad, extent)?;
        let turns = quarter_turns(rotation_degrees)?;
        let p = points(quad);
        let (ratio, aspect_evidence) = aspect_ratio(quad, extent)?;
        let horizontal = (distance(p[0], p[1]) * distance(p[2], p[3])).sqrt();
        let vertical = (distance(p[1], p[2]) * distance(p[3], p[0])).sqrt();
        let height = vertical.min(horizontal / ratio);
        let (mut width, mut height) = checked_dimensions(height * ratio, height, max_pixels)?;
        if turns % 2 == 1 {
            std::mem::swap(&mut width, &mut height);
        }
        let corners = std::array::from_fn(|i| {
            let p = p[(i + 4 - turns) % 4];
            (p.x, p.y)
        });
        let map = ProjectiveMap::from_unit_quad(corners)?;
        Ok(Self {
            width,
            height,
            map,
            aspect_evidence,
        })
    }

    pub fn render(&self, source: &ImageU8) -> OpResult<WarpedImage> {
        match self.aspect_evidence {
            AspectEvidence::OppositeEdges => {
                log::debug!("page proportions: opposite-edge estimate")
            }
            AspectEvidence::CameraBlend(confidence) => {
                log::debug!("page proportions: camera blend {confidence:.3}")
            }
        }
        warp_document(source, self.map, self.width, self.height)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn full_frame_and_quarter_turns_keep_every_edge_pixel() -> OpResult<()> {
        let source = ImageU8::new(7, 5, 3, (0..105).map(|i| i as u8).collect())?;
        let extent = SourceExtent::new(7, 5)?;
        for turns in 0..4 {
            let plan = RenderPlan::new(extent.full_frame(), extent, turns * 90, 35)?;
            let output = plan.render(&source)?.image;
            assert_eq!(output.width, if turns % 2 == 0 { 7 } else { 5 });
            assert_eq!(output.height, if turns % 2 == 0 { 5 } else { 7 });
            for y in 0..5 {
                for x in 0..7 {
                    let (dx, dy) = match turns {
                        0 => (x, y),
                        1 => (4 - y, x),
                        2 => (6 - x, 4 - y),
                        _ => (y, 6 - x),
                    };
                    let a = (y * 7 + x) * 3;
                    let b = (dy * output.width as usize + dx) * 3;
                    assert_eq!(
                        &source.data[a..a + 3],
                        &output.data[b..b + 3],
                        "turns={turns} x={x} y={y}"
                    );
                }
            }
        }
        Ok(())
    }

    #[test]
    fn tiny_budgets_and_extreme_receipts_stay_nonempty() -> OpResult<()> {
        for budget in 1..100 {
            for (w, h) in [(100.0, 3000.0), (8000.0, 30.0), (1.0, 1.0)] {
                let (width, height) = checked_dimensions(w, h, budget)?;
                assert!(width > 0 && height > 0);
                assert!(width as u64 * height as u64 <= budget as u64);
            }
        }
        assert!(checked_dimensions(10.0, 10.0, 0).is_err());
        assert!(checked_dimensions(f64::INFINITY, 10.0, 10).is_err());
        assert!(checked_dimensions(1e300, 1e300, 100).is_err());
        Ok(())
    }

    #[test]
    fn invalid_quads_fail_before_allocation() -> OpResult<()> {
        let extent = SourceExtent::new(800, 600)?;
        let valid = extent.full_frame();
        let mut p = points(valid);
        p.swap(1, 2);
        assert!(RenderPlan::new(quad_from_points(p), extent, 0, 2_000_000).is_err());
        let mut p = points(valid);
        p[0].x = f64::NAN;
        assert!(RenderPlan::new(quad_from_points(p), extent, 0, 2_000_000).is_err());
        assert!(RenderPlan::new(valid, extent, 45, 2_000_000).is_err());
        assert!(RenderPlan::new(valid, extent, -90, 2_000_000).is_ok());
        assert!(
            RenderPlan::new(
                quad_from_points([Point { x: 1.0, y: 1.0 }; 4]),
                extent,
                0,
                2_000_000
            )
            .is_err()
        );
        Ok(())
    }

    #[test]
    fn front_facing_cards_receipts_and_landscape_preserve_proportions() -> OpResult<()> {
        for (width, height) in [(400, 700), (700, 400), (100, 1700), (1300, 120)] {
            let extent = SourceExtent::new(width, height)?;
            let plan = RenderPlan::new(extent.full_frame(), extent, 0, 2_000_000)?;
            assert!(
                ((plan.width as f64 / plan.height as f64) / (width as f64 / height as f64) - 1.0)
                    .abs()
                    < 0.005
            );
        }
        Ok(())
    }
}

#[cfg(test)]
mod benchmarks {
    use super::*;
    use std::time::Instant;

    #[test]
    #[ignore = "release performance and allocation measurements"]
    fn render_source_and_output_budgets() -> OpResult<()> {
        for (width, height) in [(4000, 3000), (6000, 4000), (8000, 6000)] {
            let source = ImageU8::new(
                width,
                height,
                3,
                (0..width as usize * height as usize * 3)
                    .map(|i| ((i * 17 + i / 31) % 256) as u8)
                    .collect(),
            )?;
            let extent = SourceExtent::new(width, height)?;
            for budget in [1_000_000, 2_000_000, 4_000_000] {
                let plan = RenderPlan::new(extent.full_frame(), extent, 0, budget)?;
                let mut times = Vec::new();
                for _ in 0..21 {
                    let start = Instant::now();
                    let rendered = plan.render(&source)?;
                    std::hint::black_box(rendered.image.data);
                    times.push(start.elapsed().as_secs_f64() * 1000.0);
                }
                let cold = times.remove(0);
                times.sort_by(f64::total_cmp);
                println!(
                    "render {width}x{height} -> {}x{}, cold_ms={cold:.3}, median_ms={:.3}, p95_ms={:.3}, decoded_source_bytes={}, output_bytes={}",
                    plan.width,
                    plan.height,
                    times[2],
                    times[4],
                    source.data.len(),
                    plan.width as usize * plan.height as usize * 3
                );
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod camera_geometry_tests {
    use super::*;

    fn camera_quad(width: f64, height: f64, yaw: f64, pitch: f64) -> Quad {
        let project = |x: f64, y: f64| {
            let x_camera = yaw.cos() * x + yaw.sin() * pitch.sin() * y;
            let y_camera = pitch.cos() * y;
            let z_camera = 1400.0 - yaw.sin() * x + yaw.cos() * pitch.sin() * y;
            Point {
                x: 600.0 + 1100.0 * x_camera / z_camera,
                y: 450.0 + 1100.0 * y_camera / z_camera,
            }
        };
        quad_from_points([
            project(-width / 2.0, -height / 2.0),
            project(width / 2.0, -height / 2.0),
            project(width / 2.0, height / 2.0),
            project(-width / 2.0, height / 2.0),
        ])
    }

    #[test]
    fn camera_constraints_improve_supported_oblique_rectangles() -> OpResult<()> {
        let extent = SourceExtent::new(1200, 900)?;
        for (w, h, yaw, pitch) in [
            (400.0, 560.0, 0.45, 0.35),
            (400.0, 560.0, 0.8, 0.55),
            (100.0, 900.0, 0.35, 0.3),
            (600.0, 340.0, 0.65, 0.45),
        ] {
            let quad = camera_quad(w, h, yaw, pitch);
            let p = points(quad);
            let edge = ((distance(p[0], p[1]) * distance(p[2], p[3]))
                / (distance(p[1], p[2]) * distance(p[3], p[0])))
            .sqrt();
            let (ratio, evidence) = aspect_ratio(quad, extent)?;
            let error = (ratio / (w / h)).ln().abs();
            let edge_error = (edge / (w / h)).ln().abs();
            assert!(
                error <= edge_error + 1e-10,
                "{evidence:?}: {ratio} vs {}",
                w / h
            );
            assert!(error < 0.22, "conservative aspect error {error}");
        }
        Ok(())
    }

    #[test]
    fn weak_perspective_proportions_change_continuously() -> OpResult<()> {
        let extent = SourceExtent::new(1200, 900)?;
        let mut previous = 400.0 / 560.0;
        for step in 0..100 {
            let angle = step as f64 / 1000.0;
            let (ratio, _) = aspect_ratio(camera_quad(400.0, 560.0, angle, angle * 0.7), extent)?;
            assert!((ratio - previous).abs() < 0.001);
            previous = ratio;
        }
        Ok(())
    }
}
