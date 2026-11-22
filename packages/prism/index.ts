type Point = [number, number];

export function drawPrism(ctx: CanvasRenderingContext2D, width: number, height: number, time: number, energy: number, dispersion: boolean) {
  ctx.clearRect(0, 0, width, height);
  const unit = Math.min(width, height);
  if (!unit) return;
  const size = unit * 0.34;
  const x = width * 0.52;
  const y = height * 0.49 + Math.sin(time * 1.15) * unit * 0.026;
  const color = ctx.createRadialGradient(x, y, size * 0.04, x, y, unit * 0.78);
  color.addColorStop(0, "rgba(116, 77, 201, .34)");
  color.addColorStop(0.52, "rgba(61, 37, 115, .17)");
  color.addColorStop(1, "rgba(50, 24, 93, 0)");
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, width, height);

  const shift = Math.sin(time * 0.49) * 0.19;
  const a: Point = [x + size * shift, y - size];
  const b: Point = [x - size * 0.96, y + size * 0.55];
  const c: Point = [x + size * 0.83, y + size * 0.53];
  const d: Point = [x + size * (0.89 + shift), y + size * 0.17];
  const e: Point = [x + size * (0.22 + shift), y - size * 0.95];
  const polygon = (points: Point[], fill: string | CanvasGradient, outline: string) => {
    ctx.beginPath();
    ctx.moveTo(...points[0]);
    for (const point of points.slice(1)) ctx.lineTo(...point);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = outline;
    ctx.lineWidth = Math.max(1, unit / 400);
    ctx.stroke();
  };

  const rayWidth = dispersion ? 1.0 : 0.55;
  const target = [x + size * 0.57, y + size * 0.05] as const;
  const colors = ["246,111,209", "255,169,160", "255,212,146", "163,178,255", "129,106,253", "111,205,251"];
  colors.forEach((rgb, i) => {
    const dy = (i - 2.5) * size * 0.31 * rayWidth;
    const spread = size * 1.85;
    const beam = ctx.createLinearGradient(...target, target[0] + spread, target[1] + dy);
    beam.addColorStop(0, "rgba(" + rgb + "," + (0.35 + energy * 0.31) + ")");
    beam.addColorStop(1, "rgba(" + rgb + ",0)");
    const thickness = size * (0.07 + energy * 0.05);
    polygon([[target[0], target[1] - size * 0.008], [target[0] + spread, target[1] + dy - thickness],
      [target[0] + spread, target[1] + dy + thickness]], beam, "transparent");
  });

  const incoming = ctx.createLinearGradient(x - size * 2.2, y + size * 0.33, x, y);
  incoming.addColorStop(0, "transparent");
  incoming.addColorStop(1, "rgba(229,212,255,.67)");
  polygon([[x - size * 2.2, y + size * 0.25], [x - size * 2.2, y + size * 0.31], [target[0], target[1]]], incoming, "transparent");

  const face = ctx.createLinearGradient(...a, ...c);
  face.addColorStop(0, "rgba(207,190,255,.42)");
  face.addColorStop(0.42, "rgba(72,50,121,.24)");
  face.addColorStop(0.72, "rgba(160,104,213,.29)");
  face.addColorStop(1, "rgba(106,192,251,.31)");
  polygon([a, e, d, c], "rgba(162,115,240,.19)", "rgba(187,154,255,.31)");
  polygon([a, b, c], face, "rgba(231,213,255,.86)");
  polygon([a, [x - size * 0.13, y + size * 0.28], b], "rgba(163,152,255,.15)", "rgba(204,198,255,.2)");
  polygon([[x - size * 0.13, y + size * 0.28], a, c], "rgba(49,30,91,.13)", "rgba(164,154,231,.22)");

  for (const [px, py] of [a, b, c]) {
    const edge = ctx.createRadialGradient(px, py, 0, px, py, size * 0.28);
    edge.addColorStop(0, "rgba(237,218,255,.69)");
    edge.addColorStop(1, "rgba(165,127,255,0)");
    ctx.fillStyle = edge;
    ctx.fillRect(px - size * 0.28, py - size * 0.28, size * 0.56, size * 0.56);
  }
}
