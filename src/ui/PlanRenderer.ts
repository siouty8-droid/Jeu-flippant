import { HALLOWEEN_MODULE, moduleDef, STORE, type StoreLayout } from "../world/StoreLayout";

export interface PlanOptions {
  /** Quel module dessiner dans chaque slot. */
  assignment: readonly number[];
  /** Style « affiche plastifiée » (plan d'évacuation) ou « écran » (debug). */
  theme: "poster" | "debug";
  title?: string;
  youAreHere?: { x: number; z: number };
  player?: { x: number; z: number; yaw: number };
  /** Dessiner aussi ce qui n'est pas censé figurer sur le plan (rayon 9, présentoir). */
  showHidden?: boolean;
  /** Heatmap d'ancrage (0..1) par slot, pour le debug. */
  heat?: readonly number[];
}

interface Frame {
  ox: number;
  oy: number;
  scale: number;
}

/** Dessine le plan du magasin. Sert au plan d'évacuation mural et à la mini-carte de debug. */
export function drawPlan(ctx: CanvasRenderingContext2D, w: number, h: number, layout: StoreLayout, opts: PlanOptions): void {
  const poster = opts.theme === "poster";
  const header = opts.title ? h * 0.1 : 0;
  const footer = poster ? h * 0.07 : 0;
  const margin = w * 0.05;
  const scale = Math.min((w - 2 * margin) / STORE.width, (h - header - footer - 2 * margin) / STORE.depth);
  const f: Frame = {
    ox: (w - STORE.width * scale) / 2,
    oy: header + margin + (h - header - footer - 2 * margin - STORE.depth * scale) / 2,
    scale,
  };
  const X = (x: number) => f.ox + x * f.scale;
  const Y = (z: number) => f.oy + (STORE.depth - z) * f.scale;

  const ink = poster ? "#1a1a1a" : "#9fe0a8";
  ctx.fillStyle = poster ? "#f4f1e8" : "rgba(5,12,8,0.85)";
  ctx.fillRect(0, 0, w, h);

  if (opts.title) {
    ctx.fillStyle = poster ? "#1f8a3a" : "#1d3a24";
    ctx.fillRect(0, 0, w, header);
    ctx.fillStyle = "#ffffff";
    ctx.font = `bold ${Math.round(header * 0.42)}px Arial`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(opts.title, w / 2, header / 2);
  }

  // Pièces.
  ctx.lineWidth = Math.max(1, f.scale * 0.12);
  for (const r of layout.rooms) {
    if (r.id === "entree") continue;
    ctx.fillStyle = poster ? "#e2ddd0" : "rgba(40,70,50,0.5)";
    ctx.fillRect(X(r.x0), Y(r.z1), (r.x1 - r.x0) * f.scale, (r.z1 - r.z0) * f.scale);
    ctx.fillStyle = ink;
    ctx.font = `${Math.round(f.scale * 1.05)}px Arial`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const cx = X((r.x0 + r.x1) / 2);
    const cy = Y((r.z0 + r.z1) / 2);
    const words = r.name.split(" ");
    const lines = r.x1 - r.x0 < 9 && words.length > 1 ? [words[0], words.slice(1).join(" ")] : [r.name];
    lines.forEach((line, i) => ctx.fillText(line, cx, cy + (i - (lines.length - 1) / 2) * f.scale * 1.2));
  }

  // Rayons.
  for (const slot of layout.slots) {
    const id = opts.assignment[slot.index];
    const def = moduleDef(id);
    if (!def.onPlan && !opts.showHidden) continue;
    const x = X(slot.x0);
    const y = Y(slot.z1);
    const sw = (slot.x1 - slot.x0) * f.scale;
    const sh = (slot.z1 - slot.z0) * f.scale;
    if (opts.heat) {
      ctx.fillStyle = `rgba(255, 170, 40, ${0.08 + opts.heat[slot.index] * 0.5})`;
      ctx.fillRect(x, y, sw, sh);
    }
    if (id === HALLOWEEN_MODULE) {
      ctx.strokeStyle = poster ? "#c96a1c" : "#e8741c";
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(x + sw * 0.3, y + sh * 0.2, sw * 0.4, sh * 0.6);
      ctx.setLineDash([]);
      continue;
    }
    // Deux gondoles.
    ctx.fillStyle = poster ? "#8fa3b8" : "rgba(120,200,140,0.5)";
    ctx.fillRect(x, y + sh * 0.05, sw * 0.2, sh * 0.9);
    ctx.fillRect(x + sw * 0.8, y + sh * 0.05, sw * 0.2, sh * 0.9);
    ctx.fillStyle = poster ? "#1b3561" : "#d6ffd9";
    ctx.font = `bold ${Math.round(f.scale * 2.4)}px Arial`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(def.id), x + sw / 2, y + sh * 0.42);
    ctx.font = `${Math.round(f.scale * 0.85)}px Arial`;
    const label = def.name.length > 11 ? def.name.split(" ")[0] : def.name;
    ctx.fillText(label, x + sw / 2, y + sh * 0.66);
  }

  // Caisses.
  ctx.fillStyle = poster ? "#555" : "rgba(160,220,170,0.6)";
  for (const cx of [23, 27, 31]) ctx.fillRect(X(cx - 0.4), Y(6.5), 0.8 * f.scale, 3 * f.scale);

  // Murs.
  ctx.strokeStyle = ink;
  ctx.lineWidth = Math.max(1.5, f.scale * 0.25);
  ctx.lineCap = "square";
  for (const wall of layout.walls) {
    const along = wall.z0 === wall.z1 ? "x" : "z";
    const start = along === "x" ? wall.x0 : wall.z0;
    const end = along === "x" ? wall.x1 : wall.z1;
    const cuts = wall.openings.filter((o) => o.bottom === 0).sort((a, b) => a.from - b.from);
    let cursor = start;
    const seg = (a: number, b: number) => {
      if (b - a <= 0.01) return;
      ctx.beginPath();
      if (along === "x") {
        ctx.moveTo(X(a), Y(wall.z0));
        ctx.lineTo(X(b), Y(wall.z0));
      } else {
        ctx.moveTo(X(wall.x0), Y(a));
        ctx.lineTo(X(wall.x0), Y(b));
      }
      ctx.stroke();
    };
    for (const o of cuts) {
      seg(cursor, o.from);
      cursor = o.to;
    }
    seg(cursor, end);
  }

  // Sorties de secours.
  for (const d of layout.doors) {
    if (d.kind !== "emergency" && d.kind !== "entrance") continue;
    ctx.fillStyle = "#1fae45";
    const s = f.scale * 1.6;
    ctx.fillRect(X(d.x) - s / 2, Y(d.z) - s / 2, s, s);
    ctx.fillStyle = "#ffffff";
    ctx.font = `bold ${Math.round(s * 0.7)}px Arial`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("➜", X(d.x), Y(d.z));
  }

  if (opts.youAreHere) {
    const px = X(opts.youAreHere.x);
    const py = Y(opts.youAreHere.z);
    ctx.fillStyle = "#d42020";
    ctx.beginPath();
    ctx.arc(px, py, f.scale * 0.9, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = `bold ${Math.round(f.scale * 1.1)}px Arial`;
    ctx.textAlign = "left";
    ctx.fillText("VOUS ÊTES ICI", px + f.scale * 1.3, py - f.scale * 1.2);
  }

  if (opts.player) {
    const px = X(opts.player.x);
    const py = Y(opts.player.z);
    const r = Math.max(5, f.scale * 1.1);
    // yaw = 0 regarde +z, c'est-à-dire vers le haut du plan.
    const dx = Math.sin(opts.player.yaw);
    const dy = -Math.cos(opts.player.yaw);
    ctx.fillStyle = "#ff4040";
    ctx.beginPath();
    ctx.moveTo(px + dx * r * 1.8, py + dy * r * 1.8);
    ctx.lineTo(px - dy * r, py + dx * r);
    ctx.lineTo(px + dy * r, py - dx * r);
    ctx.closePath();
    ctx.fill();
  }

  if (poster) {
    ctx.fillStyle = "#1a1a1a";
    ctx.font = `${Math.round(footer * 0.3)}px Arial`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("En cas d'incendie, gagnez la sortie la plus proche.", w / 2, h - footer * 0.6);
    ctx.font = `${Math.round(footer * 0.22)}px Arial`;
    ctx.fillText("Supermarché Bellevue — ouvert 24h/24", w / 2, h - footer * 0.22);
  }
}
