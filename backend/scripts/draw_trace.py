import os
import sys
import json
import io
from PIL import Image as PILImage, ImageDraw, ImageFont

# Helper math and interpolation functions copied from app.py

def median(values):
    vals = sorted(float(v) for v in values)
    if not vals:
        return None
    mid = len(vals) // 2
    if len(vals) % 2:
        return vals[mid]
    return (vals[mid - 1] + vals[mid]) / 2.0

def interp_control_point(points, value, coord):
    pts = sorted(points, key=lambda p: float(p["value"]))
    value = float(value)
    if value <= float(pts[0]["value"]):
        return float(pts[0][coord])
    if value >= float(pts[-1]["value"]):
        return float(pts[-1][coord])
    for lo, hi in zip(pts, pts[1:]):
        lo_v, hi_v = float(lo["value"]), float(hi["value"])
        if lo_v <= value <= hi_v:
            frac = (value - lo_v) / (hi_v - lo_v) if hi_v != lo_v else 0
            return float(lo[coord]) + frac * (float(hi[coord]) - float(lo[coord]))
    return float(pts[-1][coord])

def _chart_grid_major_y_spacing(cal):
    grid_y = (cal.get("grid") or {}).get("major_y_px") or []
    diffs = [
        abs(float(b) - float(a))
        for a, b in zip(grid_y, grid_y[1:])
        if abs(float(b) - float(a)) > 1
    ]
    return median(diffs) or 1.0

def _locked_shared_pressure_altitude_y(cal, oat_c, altitude_ft=None, airport_icao=None):
    locked = cal.get("locked_chart_calibration") or {}
    if not locked.get("active"):
        return None
    airport_reference = locked.get("airport_reference") or {}
    reference_icao = str(airport_reference.get("icao") or "").upper()
    if reference_icao and str(airport_icao or "").upper() != reference_icao:
        return None
    reference_altitude = airport_reference.get("pressure_altitude_ft")
    if reference_altitude is not None and altitude_ft is not None:
        if abs(float(altitude_ft) - float(reference_altitude)) > 50:
            return None
    direct_points = locked.get("pressure_altitude_intersections_by_oat") or []
    if direct_points:
        direct = [
            {"value": point["oat_c"], "y_px": point["y_px"]}
            for point in direct_points
        ]
        return interp_control_point(direct, oat_c, "y_px")
    points = locked.get("shared_pressure_altitude_intersections_by_oat") or []
    if not points:
        return None
    pts = sorted(points, key=lambda p: float(p["oat_c"]))
    oat_c = float(oat_c)
    if oat_c <= float(pts[0]["oat_c"]):
        units = float(pts[0]["bottom_delta_major_y_units"])
    elif oat_c >= float(pts[-1]["oat_c"]):
        units = float(pts[-1]["bottom_delta_major_y_units"])
    else:
        units = None
        for lo, hi in zip(pts, pts[1:]):
            lo_oat, hi_oat = float(lo["oat_c"]), float(hi["oat_c"])
            if lo_oat <= oat_c <= hi_oat:
                frac = 0 if hi_oat == lo_oat else (oat_c - lo_oat) / (hi_oat - lo_oat)
                units = (
                    float(lo["bottom_delta_major_y_units"])
                    + frac * (
                        float(hi["bottom_delta_major_y_units"])
                        - float(lo["bottom_delta_major_y_units"])
                    )
                )
                break
        if units is None:
            units = float(pts[-1]["bottom_delta_major_y_units"])
    temp_points = cal["panels"]["temperature_panel"]["control_points"]
    bottom_y = float(temp_points[0]["y_px"])
    return bottom_y - units * _chart_grid_major_y_spacing(cal)

def _locked_chart_runway_m(cal, airport_icao=None, altitude_ft=None):
    locked = cal.get("locked_chart_calibration") or {}
    reference = locked.get("airport_reference") or {}
    if not locked.get("active") or reference.get("runway_m") is None:
        return None
    reference_icao = str(reference.get("icao") or "").upper()
    if reference_icao and str(airport_icao or "").upper() != reference_icao:
        return None
    reference_altitude = reference.get("pressure_altitude_ft")
    if reference_altitude is not None and altitude_ft is not None:
        if abs(float(altitude_ft) - float(reference_altitude)) > 50:
            return None
    return float(reference["runway_m"])

def _locked_chart_limit_kg(cal, oat_c, airport_icao=None, altitude_ft=None):
    locked = cal.get("locked_chart_calibration") or {}
    reference = locked.get("airport_reference") or {}
    points = locked.get("reviewed_chart_limits_by_oat") or []
    if not locked.get("active") or not points:
        return None
    reference_icao = str(reference.get("icao") or "").upper()
    if reference_icao and str(airport_icao or "").upper() != reference_icao:
        return None
    reference_altitude = reference.get("pressure_altitude_ft")
    if reference_altitude is not None and altitude_ft is not None:
        if abs(float(altitude_ft) - float(reference_altitude)) > 50:
            return None
    ordered = sorted(points, key=lambda point: float(point["oat_c"]))
    oat_c = float(oat_c)
    interpolation = str(
        locked.get("reviewed_chart_limits_interpolation") or "linear"
    ).lower()
    if interpolation == "exact_review_points_only":
        for point in ordered:
            if abs(float(point["oat_c"]) - oat_c) < 1e-6:
                return float(point["limit_kg"])
        return None
    if oat_c < float(ordered[0]["oat_c"]) or oat_c > float(ordered[-1]["oat_c"]):
        return None
    calibration_points = [
        {"value": point["oat_c"], "limit_kg": point["limit_kg"]}
        for point in ordered
    ]
    return interp_control_point(calibration_points, oat_c, "limit_kg")

def _locked_chart_runway_y_px(cal, airport_icao=None, altitude_ft=None):
    locked = cal.get("locked_chart_calibration") or {}
    reference = locked.get("airport_reference") or {}
    runway_y = locked.get("reviewed_runway_horizontal_y_px")
    if not locked.get("active") or runway_y is None:
        return None
    reference_icao = str(reference.get("icao") or "").upper()
    if reference_icao and str(airport_icao or "").upper() != reference_icao:
        return None
    reference_altitude = reference.get("pressure_altitude_ft")
    if reference_altitude is not None and altitude_ft is not None:
        if abs(float(altitude_ft) - float(reference_altitude)) > 50:
            return None
    return float(runway_y)

def _locked_chart_weight_x_px(cal, oat_c, airport_icao=None, altitude_ft=None):
    locked = cal.get("locked_chart_calibration") or {}
    reference = locked.get("airport_reference") or {}
    points = locked.get("reviewed_weight_intersections_by_oat") or []
    if not locked.get("active") or not points:
        return None
    reference_icao = str(reference.get("icao") or "").upper()
    if reference_icao and str(airport_icao or "").upper() != reference_icao:
        return None
    reference_altitude = reference.get("pressure_altitude_ft")
    if reference_altitude is not None and altitude_ft is not None:
        if abs(float(altitude_ft) - float(reference_altitude)) > 50:
            return None
    ordered = sorted(points, key=lambda point: float(point["oat_c"]))
    oat_c = float(oat_c)
    interpolation = str(
        locked.get("reviewed_weight_intersections_interpolation") or "linear"
    ).lower()
    if interpolation == "exact_review_points_only":
        for point in ordered:
            if abs(float(point["oat_c"]) - oat_c) < 1e-6:
                return float(point["x_px"])
        return None
    if oat_c < float(ordered[0]["oat_c"]) or oat_c > float(ordered[-1]["oat_c"]):
        return None
    calibration_points = [
        {"value": point["oat_c"], "x_px": point["x_px"]}
        for point in ordered
    ]
    return interp_control_point(calibration_points, oat_c, "x_px")

def _path_slope_at_x(path, target_x, fallback=-0.7):
    """Module-level slope helper — also used inside main() as path_slope_at_x."""
    if len(path) < 2:
        return float(fallback)
    target_x = float(target_x)
    for idx, (p1, p2) in enumerate(zip(path, path[1:])):
        x1, y1 = float(p1[0]), float(p1[1])
        x2, y2 = float(p2[0]), float(p2[1])
        if x1 <= target_x <= x2 and abs(x2 - x1) > 1:
            slopes = []
            lo = max(0, idx - 2)
            hi = min(len(path) - 1, idx + 3)
            for j in range(lo, hi):
                ax, ay = float(path[j][0]), float(path[j][1])
                bx, by = float(path[j + 1][0]), float(path[j + 1][1])
                dx = bx - ax
                if abs(dx) > 1:
                    slopes.append((by - ay) / dx)
            slope = median(slopes) if slopes else (y2 - y1) / (x2 - x1)
            return float(slope if slope is not None else fallback)
    # tail slope fallback
    if len(path) < 3:
        return float(fallback)
    pts = path[-min(7, len(path)):]
    xs = [float(p[0]) for p in pts]
    ys = [float(p[1]) for p in pts]
    mean_x = sum(xs) / len(xs)
    mean_y = sum(ys) / len(ys)
    denom = sum((x - mean_x) ** 2 for x in xs)
    if abs(denom) < 1e-6:
        return float(fallback)
    slope = sum((x - mean_x) * (y - mean_y) for x, y in zip(xs, ys)) / denom
    if not (-1.5 < slope < 0.2):
        return float(fallback)
    return float(slope)


def _smooth_weight_curve_entry(path, target_y, slope_hint=-0.12):

    if len(path) < 5:
        return path
    path = [(float(x), float(y)) for x, y in path]
    start_x, start_y = path[0]
    target_y = float(target_y)
    if abs(target_y - start_y) < 1:
        return path
    direction = 1.0 if target_y > start_y else -1.0
    path = _monotonic_weight_curve_path(path, target_y)

    anchor_i = None
    for i in range(4, min(len(path), 24)):
        dx = float(path[i][0]) - start_x
        progress = direction * (float(path[i][1]) - start_y)
        if dx >= 72.0 and progress >= 6.0:
            anchor_i = i
            break
    if anchor_i is None:
        anchor_i = min(len(path) - 1, max(4, int(len(path) * 0.18)))
    if anchor_i <= 1:
        return path

    anchor_x, anchor_y = path[anchor_i]
    dx = anchor_x - start_x
    if dx <= 2:
        return path
    entry_slope = float(slope_hint)
    if direction * entry_slope <= 0:
        entry_slope = direction * 0.12
    entry_slope = direction * min(max(abs(entry_slope), 0.08), 0.18)
    anchor_slope = _path_slope_at_x(path, anchor_x, fallback=entry_slope)
    if direction * anchor_slope <= 0:
        anchor_slope = entry_slope
    anchor_slope = direction * min(max(abs(anchor_slope), 0.08), 0.7)
    control_frac = 0.36
    p0 = (start_x, start_y)
    p3 = (anchor_x, anchor_y)
    p1 = (start_x + dx * control_frac, start_y + entry_slope * dx * control_frac)
    p2 = (anchor_x - dx * control_frac, anchor_y - anchor_slope * dx * control_frac)
    entry = _cubic_bezier_points(p0, p1, p2, p3, samples=anchor_i + 1)
    combined = entry[:-1] + path[anchor_i:]
    combined[0] = (start_x, start_y)
    return _monotonic_weight_curve_path(combined, target_y)

def _cubic_bezier_points(p0, p1, p2, p3, samples=16):
    pts = []
    for i in range(max(2, int(samples))):
        t = i / (samples - 1) if samples > 1 else 0.0
        u = 1.0 - t
        x = (
            u * u * u * p0[0]
            + 3 * u * u * t * p1[0]
            + 3 * u * t * t * p2[0]
            + t * t * t * p3[0]
        )
        y = (
            u * u * u * p0[1]
            + 3 * u * u * t * p1[1]
            + 3 * u * t * t * p2[1]
            + t * t * t * p3[1]
        )
        pts.append((x, y))
    return pts

def _monotonic_weight_curve_path(path, target_y):
    if len(path) < 2:
        return path
    target_y = float(target_y)
    start_y = float(path[0][1])
    if abs(target_y - start_y) < 1:
        return [(float(x), float(y)) for x, y in path]
    moving_down = target_y > start_y
    limited = []
    last_y = start_y
    for x, y in path:
        y = float(y)
        if moving_down:
            y = max(y, last_y)
        else:
            y = min(y, last_y)
        limited.append((float(x), y))
        last_y = y
    limited[0] = (float(path[0][0]), start_y)
    return limited


def main():
    # Read input from stdin
    try:
        data = json.load(sys.stdin)
    except Exception as e:
        sys.stderr.write(f"Failed to read json stdin: {e}\n")
        sys.exit(1)

    cal_path = data["cal_path"]
    img_path = data["img_path"]
    table_type = data["table_type"]
    oat = float(data["oat"])
    elev_ft = float(data["elev_ft"])
    rwy_m = float(data["rwy_m"])
    rtow_kg = float(data["rtow_kg"])
    factor = data.get("factor", "-")
    icao = data.get("icao", "")

    if not os.path.exists(cal_path):
        sys.stderr.write(f"Calibration JSON not found: {cal_path}\n")
        sys.exit(1)
    if not os.path.exists(img_path):
        sys.stderr.write(f"Image overlay file not found: {img_path}\n")
        sys.exit(1)

    with open(cal_path, "r", encoding="utf-8") as handle:
        cal = json.load(handle)

    # Scanned nomograph sizing
    try:
        with PILImage.open(img_path) as src:
            image = src.convert("RGB")
    except Exception as e:
        sys.stderr.write(f"Failed to load background image: {e}\n")
        sys.exit(1)

    draw = ImageDraw.Draw(image, "RGBA")
    font = ImageFont.load_default()
    sx = image.width / float(cal["image_size_px"]["w"])
    sy = image.height / float(cal["image_size_px"]["h"])

    def sp(point):
        return int(round(point[0] * sx)), int(round(point[1] * sy))

    temp_points = cal["panels"]["temperature_panel"]["control_points"]
    weight_points = cal["panels"]["weight_panel"]["kg_control_points"]
    distance_points = cal["panels"]["distance_axis"]["control_points"]
    bottom_y = temp_points[0]["y_px"]
    ref1_x = cal["reference_lines"]["temperature_to_weight_reference_x_px"]
    color = (190, 35, 215, 230) if table_type == "TODA" else (10, 88, 210, 230)
    title = f"{table_type} reviewed curve-family RTOW backplot"
    draw.rectangle([12, 12, 12 + len(title) * 7, 35], fill=(255, 255, 255, 225))
    draw.text((18, 17), title, fill=color, font=font)

    def family_points(name):
        return sorted(
            cal["curve_families"][name]["envelope_points"],
            key=lambda point: float(point["x_px"])
        )

    def envelope_at(points, x):
        if not points:
            return None
        x = float(x)
        if x <= float(points[0]["x_px"]):
            return points[0]
        if x >= float(points[-1]["x_px"]):
            return points[-1]
        for lo, hi in zip(points, points[1:]):
            lo_x, hi_x = float(lo["x_px"]), float(hi["x_px"])
            if lo_x <= x <= hi_x:
                frac = (x - lo_x) / (hi_x - lo_x) if hi_x != lo_x else 0
                out = {"x_px": x}
                for key in ("y_min_px", "y_q25_px", "y_mid_px", "y_q75_px", "y_max_px"):
                    out[key] = float(lo[key]) + frac * (float(hi[key]) - float(lo[key]))
                return out
        return points[-1]

    def y_from_envelope(points, x, q):
        env = envelope_at(points, x)
        if not env:
            return None
        return float(env["y_max_px"]) - max(0.0, min(1.0, q)) * (float(env["y_max_px"]) - float(env["y_min_px"]))

    def y_on_polyline(points, x):
        pts = sorted(points, key=lambda p: float(p["x_px"]))
        if not pts:
            return None
        smoothed = []
        for pt in pts:
            px = float(pt["x_px"])
            local_y = [
                float(other["y_px"]) for other in pts
                if abs(float(other["x_px"]) - px) <= 28
            ]
            smoothed.append({
                "x_px": px,
                "y_px": median(local_y) if local_y else float(pt["y_px"]),
            })
        pts = smoothed
        x = float(x)
        if x <= float(pts[0]["x_px"]):
            return float(pts[0]["y_px"])
        if x >= float(pts[-1]["x_px"]):
            return float(pts[-1]["y_px"])
        for lo, hi in zip(pts, pts[1:]):
            lo_x, hi_x = float(lo["x_px"]), float(hi["x_px"])
            if lo_x <= x <= hi_x:
                frac = 0 if hi_x == lo_x else (x - lo_x) / (hi_x - lo_x)
                return float(lo["y_px"]) + frac * (float(hi["y_px"]) - float(lo["y_px"]))
        return float(pts[-1]["y_px"])

    def oat_from_x(x):
        temp_cps = sorted(temp_points, key=lambda p: float(p["x_px"]))
        x = float(x)
        if x <= float(temp_cps[0]["x_px"]):
            return float(temp_cps[0]["value"])
        if x >= float(temp_cps[-1]["x_px"]):
            return float(temp_cps[-1]["value"])
        for lo, hi in zip(temp_cps, temp_cps[1:]):
            lo_x, hi_x = float(lo["x_px"]), float(hi["x_px"])
            if lo_x <= x <= hi_x:
                frac = 0 if hi_x == lo_x else (x - lo_x) / (hi_x - lo_x)
                return float(lo["value"]) + frac * (float(hi["value"]) - float(lo["value"]))
        return float(temp_cps[-1]["value"])

    def pressure_altitude_feed_ft(altitude_ft, oat_c):
        locked = cal.get("locked_chart_calibration") or {}
        if locked.get("active") and locked.get("pressure_altitude_feed_scale_by_oat"):
            correction = locked.get("pressure_altitude_feed_scale_by_oat")
        else:
            correction = cal["curve_families"]["pressure_altitude_curves"].get(
                "backplot_altitude_feed_scale_by_oat"
            )
        if not correction:
            return float(altitude_ft)
        cps = sorted(correction, key=lambda p: float(p["oat_c"]))
        oat_c = float(oat_c)
        if oat_c <= float(cps[0]["oat_c"]):
            return float(altitude_ft) * float(cps[0]["scale"])
        if oat_c >= float(cps[-1]["oat_c"]):
            return float(altitude_ft) * float(cps[-1]["scale"])
        for lo, hi in zip(cps, cps[1:]):
            lo_oat, hi_oat = float(lo["oat_c"]), float(hi["oat_c"])
            if lo_oat <= oat_c <= hi_oat:
                frac = 0 if hi_oat == lo_oat else (oat_c - lo_oat) / (hi_oat - lo_oat)
                scale = float(lo["scale"]) + frac * (float(hi["scale"]) - float(lo["scale"]))
                return float(altitude_ft) * scale
        return float(altitude_ft)

    def pressure_altitude_y(points, x, altitude_ft, airport_icao=None):
        locked_y = _locked_shared_pressure_altitude_y(
            cal, oat_from_x(x), altitude_ft, airport_icao
        )
        if locked_y is not None:
            return locked_y
        altitude_curves = cal["curve_families"]["pressure_altitude_curves"].get(
            "altitude_curve_points"
        ) or []
        feed_alt = pressure_altitude_feed_ft(altitude_ft, oat_from_x(x))
        usable_curves = []
        for curve in altitude_curves:
            try:
                alt = float(curve.get("altitude_ft"))
            except (TypeError, ValueError):
                continue
            pts = curve.get("points") or []
            if len(pts) < 2:
                continue
            y = y_on_polyline(pts, x)
            if y is not None:
                usable_curves.append((alt, float(y)))
        usable_curves.sort(key=lambda item: item[0])
        if usable_curves:
            if feed_alt <= usable_curves[0][0]:
                return usable_curves[0][1]
            if feed_alt >= usable_curves[-1][0]:
                return usable_curves[-1][1]
            for (lo_alt, lo_y), (hi_alt, hi_y) in zip(usable_curves, usable_curves[1:]):
                if lo_alt <= feed_alt <= hi_alt:
                    frac = 0.0 if hi_alt == lo_alt else (feed_alt - lo_alt) / (hi_alt - lo_alt)
                    return lo_y + frac * (hi_y - lo_y)

        if not points:
            return None
        x = float(x)
        local = [
            point for point in points
            if abs(float(point["x_px"]) - x) <= 36
        ]
        if len(local) < 3:
            env = envelope_at(points, x)
            local = [env] if env else []
        if not local:
            return None
        top = median(point["y_min_px"] for point in local)
        bottom = median(point["y_max_px"] for point in local)
        if top is None or bottom is None:
            return None
        pressure_span_ft = float(
            cal["curve_families"]["pressure_altitude_curves"].get(
                "backplot_pressure_span_ft", 14600
            )
        )
        q = max(0.0, min(1.0, float(altitude_ft) / pressure_span_ft))
        return float(bottom) - q * (float(bottom) - float(top))

    def curve_path(points, start_x, end_x, q, samples=42):
        if start_x > end_x:
            start_x, end_x = end_x, start_x
        path = []
        for i in range(samples):
            frac = i / (samples - 1) if samples > 1 else 0
            x = start_x + frac * (end_x - start_x)
            y = y_from_envelope(points, x, q)
            if y is not None:
                path.append((x, y))
        return path

    def smooth_chart_curve_path(path, target_y=None, radius=3):
        if len(path) < 3:
            return path
        smoothed = []
        for idx, (x, y) in enumerate(path):
            lo = max(0, idx - radius)
            hi = min(len(path), idx + radius + 1)
            local_y = [path[j][1] for j in range(lo, hi)]
            smoothed.append((float(x), median(local_y) or float(y)))
        if target_y is None:
            return smoothed
        target_y = float(target_y)
        start_y = float(smoothed[0][1])
        if target_y < start_y:
            limited = []
            last_y = start_y
            for x, y in smoothed:
                y = min(float(y), last_y)
                limited.append((x, y))
                last_y = y
            return limited
        if target_y > start_y:
            limited = []
            last_y = start_y
            for x, y in smoothed:
                y = max(float(y), last_y)
                limited.append((x, y))
                last_y = y
            return limited
        return smoothed

    def truncate_curve_at_y(path, target_y):
        if not path:
            return None, []
        target_y = float(target_y)
        out = [path[0]]
        for p1, p2 in zip(path, path[1:]):
            y1, y2 = float(p1[1]), float(p2[1])
            if (y1 - target_y) == 0:
                return float(p1[0]), out
            if (y1 - target_y) * (y2 - target_y) <= 0 and y2 != y1:
                frac = (target_y - y1) / (y2 - y1)
                x = float(p1[0]) + frac * (float(p2[0]) - float(p1[0]))
                out.append((x, target_y))
                return x, out
            out.append(p2)
        return None, path

    def cubic_bezier(p0, p1, p2, p3, samples=72):
        pts = []
        for i in range(samples):
            t = i / (samples - 1) if samples > 1 else 0.0
            u = 1.0 - t
            x = (
                u * u * u * p0[0]
                + 3 * u * u * t * p1[0]
                + 3 * u * t * t * p2[0]
                + t * t * t * p3[0]
            )
            y = (
                u * u * u * p0[1]
                + 3 * u * u * t * p1[1]
                + 3 * u * t * t * p2[1]
                + t * t * t * p3[1]
            )
            pts.append((x, y))
        return pts

    def calibrated_weight_family_bezier(start_x, start_y, end_x, target_y, slope_hint, family):
        template = family.get("parallel_curve_template") or {}
        start_slope = float(template.get("start_slope_dy_dx", -0.10))
        end_slope = float(template.get("end_slope_dy_dx", slope_hint))
        control1_frac = float(template.get("control1_frac", 0.34))
        control2_frac = float(template.get("control2_frac", 0.38))
        dx = float(end_x) - float(start_x)
        if abs(dx) < 2:
            return [(start_x, start_y), (end_x, target_y)]
        p0 = (float(start_x), float(start_y))
        p3 = (float(end_x), float(target_y))
        p1 = (
            p0[0] + dx * control1_frac,
            p0[1] + start_slope * dx * control1_frac,
        )
        p2 = (
            p3[0] - dx * control2_frac,
            p3[1] - end_slope * dx * control2_frac,
        )
        path = cubic_bezier(p0, p1, p2, p3, samples=int(template.get("samples", 72)))
        path[0] = p0
        path[-1] = p3
        return path

    def reviewed_weight_family_path(start_x, start_y, end_x, target_y, oat_c=None, samples=96):
        locked_calibration = cal.get("locked_chart_calibration") or {}
        locked_controls = []
        for reviewed in (locked_calibration.get("reviewed_weight_trajectories_by_oat") or []):
            if oat_c is not None and abs(float(reviewed.get("oat_c")) - float(oat_c)) < 1e-6:
                locked_controls = reviewed.get("controls") or []
                break
        if not locked_controls:
            locked_controls = locked_calibration.get("reviewed_weight_trajectory_normalized") or []
        if locked_controls:
            controls = tuple((float(point["t"]), float(point["q"])) for point in locked_controls)
        elif str(cal.get("model") or "").upper() == "Q200":
            if table_type == "ASDA":
                controls = (
                    (0.000000, 0.000000), (0.230309, 0.181259), (0.432391, 0.384933),
                    (0.674592, 0.635436), (0.918268, 0.912422), (1.000000, 1.000000),
                )
            else:
                controls = (
                    (0.000000, 0.000000), (0.240746, 0.130592), (0.532409, 0.432997),
                    (0.905099, 0.879726), (1.000000, 1.000000),
                )
        else:
            controls = (
                (0.00, 0.000), (0.10, 0.063), (0.20, 0.149),
                (0.30, 0.236), (0.40, 0.321), (0.50, 0.424),
                (0.60, 0.531), (0.70, 0.648), (0.80, 0.751),
                (0.90, 0.863), (1.00, 1.000),
            )

        def progress(t):
            if t <= 0:
                return 0.0
            if t >= 1:
                return 1.0
            for (t0, q0), (t1, q1) in zip(controls, controls[1:]):
                if t0 <= t <= t1:
                    frac = (t - t0) / (t1 - t0)
                    frac = frac * frac * (3.0 - 2.0 * frac)
                    return q0 + frac * (q1 - q0)
            return 1.0

        path = []
        for index in range(samples):
            t = index / (samples - 1) if samples > 1 else 0.0
            q = progress(t)
            path.append((
                float(start_x) + t * (float(end_x) - float(start_x)),
                float(start_y) + q * (float(target_y) - float(start_y)),
            ))
        path[0] = (float(start_x), float(start_y))
        path[-1] = (float(end_x), float(target_y))
        return path

    def curve_tail_slope(path, fallback=-0.12):
        if len(path) < 3:
            return float(fallback)
        pts = path[-min(7, len(path)):]
        xs = [float(p[0]) for p in pts]
        ys = [float(p[1]) for p in pts]
        mean_x = sum(xs) / len(xs)
        mean_y = sum(ys) / len(ys)
        denom = sum((x - mean_x) ** 2 for x in xs)
        if abs(denom) < 1e-6:
            return float(fallback)
        slope = sum((x - mean_x) * (y - mean_y) for x, y in zip(xs, ys)) / denom
        if not (-1.5 < slope < 0.2):
            return float(fallback)
        return float(slope)

    def interpolate_path_at_x(path, target_x):
        if not path:
            return None
        target_x = float(target_x)
        if target_x <= float(path[0][0]):
            return (target_x, float(path[0][1]))
        for p1, p2 in zip(path, path[1:]):
            x1, y1 = float(p1[0]), float(p1[1])
            x2, y2 = float(p2[0]), float(p2[1])
            if x1 <= target_x <= x2 and x2 != x1:
                frac = (target_x - x1) / (x2 - x1)
                return (target_x, y1 + frac * (y2 - y1))
        return (target_x, float(path[-1][1]))

    def crop_path_to_x(path, target_x):
        point = interpolate_path_at_x(path, target_x)
        if point is None:
            return []
        cropped = []
        for p in path:
            if float(p[0]) < float(target_x):
                cropped.append(p)
            else:
                break
        cropped.append(point)
        return cropped

    def path_slope_at_x(path, target_x, fallback=-0.7):
        if len(path) < 2:
            return float(fallback)
        target_x = float(target_x)
        for idx, (p1, p2) in enumerate(zip(path, path[1:])):
            x1, y1 = float(p1[0]), float(p1[1])
            x2, y2 = float(p2[0]), float(p2[1])
            if x1 <= target_x <= x2 and abs(x2 - x1) > 1:
                slopes = []
                lo = max(0, idx - 2)
                hi = min(len(path) - 1, idx + 3)
                for j in range(lo, hi):
                    ax, ay = float(path[j][0]), float(path[j][1])
                    bx, by = float(path[j + 1][0]), float(path[j + 1][1])
                    dx = bx - ax
                    if abs(dx) > 1:
                        slopes.append((by - ay) / dx)
                slope = median(slopes) if slopes else (y2 - y1) / (x2 - x1)
                return float(slope if slope is not None else fallback)
        return curve_tail_slope(path, fallback=fallback)

    def extend_overlay_curve_to_runway(path, target_y, solve_hint_x, max_x, slope_hint, family):
        if len(path) < 2:
            return None, path
        hit_x, truncated = truncate_curve_at_y(path, target_y)
        if hit_x is not None:
            return hit_x, truncated
        target_y = float(target_y)
        template = family.get("parallel_curve_template") or {}
        start_frac = float(template.get("extension_start_frac", 0.48))
        start_frac = max(0.25, min(0.85, start_frac))
        overlay_start_x = float(path[0][0])
        solve_hint_x = max(overlay_start_x + 24.0, min(float(max_x), float(solve_hint_x)))
        anchor_x = overlay_start_x + (solve_hint_x - overlay_start_x) * start_frac
        anchor_path = crop_path_to_x(path, anchor_x)
        if len(anchor_path) < 2:
            return None, path
        anchor_x, anchor_y = float(anchor_path[-1][0]), float(anchor_path[-1][1])
        if abs(anchor_y - target_y) < 1:
            return anchor_x, anchor_path
        tangent = path_slope_at_x(anchor_path, anchor_x, fallback=slope_hint)
        if abs(tangent) < 0.03 or (target_y - anchor_y) * tangent <= 0:
            tangent = float(slope_hint)
        if abs(tangent) < 0.03 or (target_y - anchor_y) * tangent <= 0:
            tangent = -0.7 if target_y < anchor_y else 0.7
        hit_x = anchor_x + (target_y - anchor_y) / tangent
        hit_x = max(anchor_x + 4.0, hit_x)
        hit_x = min(float(max_x), hit_x)
        extension_samples = int(template.get("extension_samples", 24))
        continuation = []
        for i in range(1, extension_samples + 1):
            frac = i / extension_samples
            x = anchor_x + frac * (hit_x - anchor_x)
            y = anchor_y + tangent * (x - anchor_x)
            continuation.append((x, y))
        combined = anchor_path + continuation
        combined[-1] = (hit_x, target_y)
        return hit_x, combined

    red_candidate_cache = {}

    def red_pixel_candidates_at_x(cal_x, bounds, window_px=2):
        cache_key = (int(round(cal_x)), int(window_px))
        if cache_key in red_candidate_cache:
            return red_candidate_cache[cache_key]
        px = image.load()
        ix = int(round(float(cal_x) * sx))
        y0 = max(0, int(round(float(bounds["y0"]) * sy)))
        y1 = min(image.height - 1, int(round(float(bounds["y1"]) * sy)))
        ys = []
        for xx in range(max(0, ix - window_px), min(image.width - 1, ix + window_px) + 1):
            for yy in range(y0, y1 + 1):
                r, g, b = px[xx, yy]
                if r > 110 and g < 145 and b < 145 and r > g * 1.15 and r > b * 1.15:
                    ys.append(yy / sy)
        if not ys:
            red_candidate_cache[cache_key] = []
            return []
        ys.sort()
        clusters = []
        current = [ys[0]]
        for y in ys[1:]:
            if y - current[-1] <= 5:
                current.append(y)
            else:
                clusters.append(current)
                current = [y]
        clusters.append(current)
        candidates = [
            float(median(cluster))
            for cluster in clusters
            if 1 <= len(cluster) <= 80
        ]
        red_candidate_cache[cache_key] = candidates
        return candidates

    def nearest_red_weight_curve_to_distance(start_x, start_y, end_x, target_y, slope_hint, bounds):
        step = 8.0
        start_x = float(start_x)
        end_x = float(end_x)
        start_y = float(start_y)
        target_y = float(target_y)
        candidates = red_pixel_candidates_at_x(start_x, bounds, window_px=3)
        if not candidates:
            return None, []
        base_y = min(candidates, key=lambda y: abs(float(y) - start_y))
        offset = start_y - base_y
        base_path = [(start_x, base_y)]
        prev_y = base_y
        local_slope = -0.12
        x = start_x + step
        misses = 0
        while x <= end_x + 0.1:
            candidates = red_pixel_candidates_at_x(x, bounds, window_px=3)
            predicted = prev_y + local_slope * step
            if candidates:
                chosen = min(candidates, key=lambda y: abs(float(y) - predicted))
                if abs(chosen - predicted) > 55:
                    chosen = predicted
                    misses += 1
                else:
                    measured = (chosen - prev_y) / step
                    if -0.8 < measured < 0.2:
                        local_slope = 0.78 * local_slope + 0.22 * measured
                    misses = 0
            else:
                chosen = predicted
                misses += 1
            base_path.append((x, float(chosen)))
            prev_y = float(chosen)
            if misses > 8:
                break
            x += step
        if len(base_path) < 3:
            return None, []
        shifted = [(x, y + offset) for x, y in base_path]
        shifted[0] = (start_x, start_y)
        shifted = _smooth_weight_curve_entry(shifted, target_y, local_slope)
        return truncate_curve_at_y(shifted, target_y)

    def weight_family_slope(points):
        configured = cal["curve_families"]["weight_family_curves"].get("parallel_slope_dy_dx")
        if configured is not None:
            try:
                return float(configured)
            except (TypeError, ValueError):
                pass
        if len(points) < 2:
            return -0.5
        slopes = []
        keys = ("y_min_px", "y_q25_px", "y_mid_px", "y_q75_px")
        lo_i = max(0, len(points) // 8)
        hi_i = min(len(points) - 1, len(points) - len(points) // 8 - 1)
        lo, hi = points[lo_i], points[hi_i]
        dx = float(hi["x_px"]) - float(lo["x_px"])
        if abs(dx) < 1:
            return -0.5
        for key in keys:
            slope = (float(hi[key]) - float(lo[key])) / dx
            if slope < -0.05:
                slopes.append(slope)
        return median(slopes) or -0.5

    pressure_family = family_points("pressure_altitude_curves")
    weight_family = family_points("weight_family_curves")
    weight_slope = weight_family_slope(weight_family)

    runway_key = f"{table_type.lower()}_runway_m_used"
    distance_100m = rwy_m / 100.0
    temp_x = interp_control_point(temp_points, oat, "x_px")
    reviewed_runway_y = _locked_chart_runway_y_px(cal, icao, elev_ft)
    dist_y = reviewed_runway_y
    if dist_y is None:
        dist_y = interp_control_point(distance_points, distance_100m, "y_px")
    pressure_y = pressure_altitude_y(pressure_family, temp_x, elev_ft, icao)

    if pressure_y is None:
        sys.stderr.write("Failed to find pressure altitude Y intersection\n")
        sys.exit(1)

    ref_y = pressure_y
    min_weight_x = min(float(p["x_px"]) for p in weight_points)
    max_weight_x = max(float(p["x_px"]) for p in weight_points)
    
    if abs(weight_slope) < 0.01:
        sys.stderr.write("Weight slope too shallow\n")
        sys.exit(1)

    weight_bounds = cal["curve_families"]["weight_family_curves"].get("panel_bounds_px", {})
    straight_solve_x = ref1_x + ((dist_y - ref_y) / weight_slope)
    straight_solve_x = max(min_weight_x, min(max_weight_x, straight_solve_x))
    
    solve_x, weight_curve_pts = nearest_red_weight_curve_to_distance(
        ref1_x, ref_y, max_weight_x, dist_y, weight_slope, weight_bounds
    )
    
    curve_end_y = dist_y
    if solve_x is None:
        if len(weight_curve_pts) >= 2:
            solve_x, weight_curve_pts = extend_overlay_curve_to_runway(
                weight_curve_pts, dist_y, straight_solve_x, max_weight_x,
                weight_slope, cal["curve_families"]["weight_family_curves"]
            )
            curve_end_y = dist_y if solve_x is not None else float(weight_curve_pts[-1][1])
        else:
            solve_x = straight_solve_x
            weight_curve_pts = calibrated_weight_family_bezier(
                ref1_x, ref_y, solve_x, dist_y, weight_slope,
                cal["curve_families"]["weight_family_curves"]
            )

    if solve_x is None:
        solve_x = straight_solve_x
        weight_curve_pts = [(ref1_x, ref_y), (solve_x, dist_y)]

    solve_x = max(min_weight_x, min(max_weight_x, solve_x))

    locked_solve_x = _locked_chart_weight_x_px(cal, oat, icao, elev_ft)
    if locked_solve_x is not None:
        solve_x = locked_solve_x
    elif rtow_kg is not None:
        solve_x = interp_control_point(weight_points, float(rtow_kg), "x_px")
        solve_x = max(min_weight_x, min(max_weight_x, solve_x))

    curve_end_y = dist_y
    weight_curve_pts = reviewed_weight_family_path(ref1_x, ref_y, solve_x, dist_y, oat_c=oat)

    solved_weight = interp_control_point(
        [{"value": p["x_px"], "kg": p["value"]} for p in weight_points],
        solve_x, "kg"
    )

    reviewed_limit = _locked_chart_limit_kg(cal, oat, icao, elev_ft)
    if reviewed_limit is not None:
        solved_weight = reviewed_limit

    distance_axis_x = float(distance_points[0]["x_px"])

    # ── Step-by-step drawing matching the AFM ASDA/TODA backplot procedure ─────
    #
    # Step 1: Vertical OAT line  →  from OAT axis (bottom) upward to PA curve
    # Step 2: Horizontal transfer →  from (OAT x, PA y) right to reference line
    # Step 3: Weight-family curve →  from reference line down to runway length y
    # Step 4: Horizontal line     →  from intersection leftward to distance axis
    # Step 5: Vertical drop       →  from (solve_x, runway_y) down to weight axis

    # Helper: draw a dashed line on a PIL draw object
    def draw_dashed(draw_obj, p1, p2, fill, width=2, dash=8, gap=5):
        x1, y1 = float(p1[0]), float(p1[1])
        x2, y2 = float(p2[0]), float(p2[1])
        dx, dy = x2 - x1, y2 - y1
        length = (dx ** 2 + dy ** 2) ** 0.5
        if length < 1:
            return
        ux, uy = dx / length, dy / length
        pos = 0.0
        drawing = True
        while pos < length:
            seg_len = dash if drawing else gap
            seg_end = min(pos + seg_len, length)
            if drawing:
                ax, ay = x1 + ux * pos, y1 + uy * pos
                bx, by = x1 + ux * seg_end, y1 + uy * seg_end
                draw_obj.line([(int(ax), int(ay)), (int(bx), int(by))], fill=fill, width=width)
            pos = seg_end
            drawing = not drawing

    # Helper: draw a step-number badge (circle with digit)
    def draw_step_badge(draw_obj, pt, step_num, color, font):
        px, py = int(round(pt[0])), int(round(pt[1]))
        r = 11
        draw_obj.ellipse([px - r, py - r, px + r, py + r],
                         fill=color, outline=(255, 255, 255, 245), width=2)
        txt = str(step_num)
        draw_obj.text((px - 4, py - 7), txt, fill=(255, 255, 255, 255), font=font)

    # Helper: draw a filled dot
    def draw_dot(draw_obj, pt, color, r=6):
        px, py = int(round(pt[0])), int(round(pt[1]))
        draw_obj.ellipse([px - r, py - r, px + r, py + r],
                         fill=color, outline=(255, 255, 255, 235), width=2)

    # ── Step 1: Vertical line — OAT axis (bottom) → pressure altitude curve ────
    step1_start = sp((temp_x, bottom_y))
    step1_end   = sp((temp_x, pressure_y))
    draw.line([step1_start, step1_end], fill=color, width=3)

    # ── Step 2: Horizontal transfer — PA intersection → reference line ──────────
    pa_intersect = sp((temp_x, pressure_y))
    ref_intersect = sp((ref1_x, pressure_y))
    draw.line([pa_intersect, ref_intersect], fill=color, width=4)

    # ── Step 3: Weight-family curve — reference line → runway length ────────────
    wt_pts = [(ref1_x, ref_y)] + list(weight_curve_pts[1:])
    wt_scaled = [sp(p) for p in wt_pts]
    if len(wt_scaled) > 1:
        draw.line(wt_scaled, fill=color, width=3)

    # ── Step 4: Horizontal line — intersection → distance axis  ─────────────────
    #           (dashed where extending past the solve point to the distance axis)
    runway_start_x = ref1_x if reviewed_runway_y is not None else solve_x
    rwy_left  = sp((distance_axis_x, dist_y))
    rwy_right = sp((runway_start_x,  dist_y))
    draw.line([rwy_left, rwy_right], fill=color, width=3)

    # Draw a subtle dashed extension from the distance axis back to the chart edge
    # so it's clear this is a horizontal reading line
    left_edge = sp((float(distance_points[0]["x_px"]) - 12, dist_y))
    dash_fill = (color[0], color[1], color[2], 120)
    draw_dashed(draw, left_edge, rwy_left, fill=dash_fill, width=2)

    # ── Step 5: Vertical drop — solve_x → weight axis (bottom) ─────────────────
    drop_top    = sp((solve_x, curve_end_y))
    drop_bottom = sp((solve_x, bottom_y))
    draw.line([drop_top, drop_bottom], fill=color, width=3)

    # ── Key dots and step-number badges ─────────────────────────────────────────
    # Define each step's "turn point" with a badge number
    step_points = [
        (step1_start,   1),   # Step 1: OAT on temperature axis (start)
        (step1_end,     2),   # Step 2: PA curve intersection (turning point)
        (ref_intersect, 3),   # Step 3: Reference line (start of weight family)
        (drop_top,      4),   # Step 4: Intersection with runway length line
        (drop_bottom,   5),   # Step 5: RTOW reading on weight axis
    ]
    for pt, num in step_points:
        draw_step_badge(draw, pt, num, color, font)

    # Dot at distance axis intersection (runway length reading)
    draw_dot(draw, rwy_left, color, r=5)

    # Dot at reference-line / PA transfer end
    ref_r = 6
    draw.ellipse(
        [ref_intersect[0] - ref_r, ref_intersect[1] - ref_r,
         ref_intersect[0] + ref_r, ref_intersect[1] + ref_r],
        fill=color, outline=(255, 255, 255, 240), width=2
    )

    # ── Result label ─────────────────────────────────────────────────────────────
    label = (
        f"{oat:g}\u00b0C  |  Alt {round(elev_ft):,} ft  |  RWY {round(rwy_m):,} m  |  "
        f"RTOW {round(solved_weight):,} kg  |  {table_type}  |  {factor}"
    )
    lx, ly = drop_bottom
    label_w = len(label) * 7 + 16
    label_x = min(max(lx + 14, 18), max(18, image.width - label_w - 18))
    label_y = max(18, ly - 26)
    draw.rectangle(
        [label_x - 6, label_y - 5, label_x + label_w, label_y + 18],
        fill=(255, 255, 255, 230)
    )
    draw.text((label_x, label_y), label, fill=color, font=font)

    # Write output to stdout in raw JPEG format
    out = io.BytesIO()
    image.save(out, "JPEG", quality=85, optimize=True)
    sys.stdout.buffer.write(out.getvalue())

if __name__ == "__main__":
    main()
