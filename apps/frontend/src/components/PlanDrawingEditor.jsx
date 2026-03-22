import { useState, useRef, useEffect } from "react";

// ── Plan Drawing Editor (fabric.js) ───────────────────────────────────────────
const PLAN_GRID_SIZE = 20;
const PLAN_COLORS = ["#111111", "#dc2626", "#2563eb", "#059669", "#d97706", "#8b5cf6", "#0891b2", "#94a3b8"];
const PLAN_LINE_WIDTHS = [1, 2, 3, 5, 8];

const PlanDrawingEditor = ({ onSave, onClose, existingSrc }) => {
  const canvasRef = useRef(null);
  const fabricRef = useRef(null);
  const fabricModRef = useRef(null);
  const containerRef = useRef(null);
  const [tool, setTool] = useState("line");
  const [color, setColor] = useState("#111111");
  const [lineWidth, setLineWidth] = useState(2);
  const [snapGrid, setSnapGrid] = useState(true);
  const [snapEndpoints, setSnapEndpoints] = useState(true);
  const [showLengths, setShowLengths] = useState(true);
  const [constrainAngle, setConstrainAngle] = useState(false);
  const [angleStep, setAngleStep] = useState(45);
  const [scale, setScale] = useState(100); // pixels per metre (displayed as mm)
  const [cursorInfo, setCursorInfo] = useState(null); // { angle, length, x, y }
  const drawStateRef = useRef(null); // { startX, startY, tempLine }
  const labelGroupsRef = useRef([]); // track measurement labels
  const [fabricLoaded, setFabricLoaded] = useState(false);

  useEffect(() => {
    let disposed = false;
    import("fabric").then((mod) => {
      if (disposed) return;
      fabricModRef.current = mod;
      setFabricLoaded(true);
    });
    return () => { disposed = true; };
  }, []);

  // Initialize canvas
  useEffect(() => {
    if (!fabricLoaded || !canvasRef.current || fabricRef.current) return;
    const fb = fabricModRef.current;
    const container = containerRef.current;
    const w = container ? container.clientWidth - 40 : 1200;
    const h = window.innerHeight * 0.72;
    const cvs = new fb.Canvas(canvasRef.current, {
      width: w, height: h, selection: true, isDrawingMode: false,
      backgroundColor: "#ffffff"
    });
    fabricRef.current = cvs;

    // Draw grid
    drawGrid(cvs, w, h);

    // Load existing plan if editing
    if (existingSrc) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const scaleF = Math.min(w / img.width, h / img.height, 1);
        const bgImg = new fb.FabricImage(img, { scaleX: scaleF, scaleY: scaleF });
        cvs.backgroundImage = bgImg;
        drawGrid(cvs, w, h);
        cvs.renderAll();
      };
      img.src = existingSrc;
    }

    // Line drawing handlers
    cvs.on("mouse:down", (opt) => {
      if (cvs.__activeTool !== "line" && cvs.__activeTool !== "wall") return;
      if (cvs.getActiveObject()) return;
      const pointer = cvs.getScenePoint(opt.e);
      let sx = pointer.x, sy = pointer.y;
      if (cvs.__snapGrid) { sx = Math.round(sx / PLAN_GRID_SIZE) * PLAN_GRID_SIZE; sy = Math.round(sy / PLAN_GRID_SIZE) * PLAN_GRID_SIZE; }
      if (cvs.__snapEndpoints) { const sn = findNearestEndpoint(cvs, sx, sy, 12); if (sn) { sx = sn.x; sy = sn.y; } }
      const isWall = cvs.__activeTool === "wall";
      const tempLine = new fb.Line([sx, sy, sx, sy], {
        stroke: cvs.__activeColor || "#111", strokeWidth: isWall ? Math.max((cvs.__lineWidth || 2) * 2, 6) : (cvs.__lineWidth || 2),
        selectable: false, evented: false, _isPlanLine: true, _isWall: isWall
      });
      cvs.add(tempLine);
      drawStateRef.current = { startX: sx, startY: sy, tempLine };
    });

    cvs.on("mouse:move", (opt) => {
      const ds = drawStateRef.current;
      if (!ds) {
        // Show cursor info for snapping
        const pointer = cvs.getScenePoint(opt.e);
        let cx = pointer.x, cy = pointer.y;
        if (cvs.__snapGrid) { cx = Math.round(cx / PLAN_GRID_SIZE) * PLAN_GRID_SIZE; cy = Math.round(cy / PLAN_GRID_SIZE) * PLAN_GRID_SIZE; }
        if (cvs.__snapEndpoints) { const sn = findNearestEndpoint(cvs, cx, cy, 12); if (sn) { cx = sn.x; cy = sn.y; } }
        return;
      }
      const pointer = cvs.getScenePoint(opt.e);
      let ex = pointer.x, ey = pointer.y;
      if (cvs.__snapGrid) { ex = Math.round(ex / PLAN_GRID_SIZE) * PLAN_GRID_SIZE; ey = Math.round(ey / PLAN_GRID_SIZE) * PLAN_GRID_SIZE; }
      if (cvs.__snapEndpoints) { const sn = findNearestEndpoint(cvs, ex, ey, 12, ds.tempLine); if (sn) { ex = sn.x; ey = sn.y; } }
      if (cvs.__constrainAngle) {
        const constrained = constrainToAngle(ds.startX, ds.startY, ex, ey, cvs.__angleStep || 45);
        ex = constrained.x; ey = constrained.y;
      }
      ds.tempLine.set({ x2: ex, y2: ey });
      cvs.renderAll();
      // Compute and display info
      const dx = ex - ds.startX, dy = ey - ds.startY;
      const lengthPx = Math.sqrt(dx * dx + dy * dy);
      const lengthMm = (lengthPx / (cvs.__scale || 50)) * 1000;
      let angle = Math.atan2(-dy, dx) * (180 / Math.PI);
      if (angle < 0) angle += 360;
      setCursorInfo({ angle: Math.round(angle), length: Math.round(lengthMm), x: Math.round(ex), y: Math.round(ey) });
    });

    cvs.on("mouse:up", () => {
      const ds = drawStateRef.current;
      if (!ds) return;
      drawStateRef.current = null;
      const line = ds.tempLine;
      const x1 = line.x1, y1 = line.y1, x2 = line.x2, y2 = line.y2;
      const dx = x2 - x1, dy = y2 - y1;
      const lengthPx = Math.sqrt(dx * dx + dy * dy);
      if (lengthPx < 3) { cvs.remove(line); setCursorInfo(null); cvs.renderAll(); return; }
      line.set({ selectable: true, evented: true, hasControls: true, hasBorders: true });
      // Add endpoint circles
      const dotOpts = { radius: 3, fill: cvs.__activeColor || "#111", stroke: "#fff", strokeWidth: 1, selectable: false, evented: false, _isPlanDot: true, _parentLine: line };
      const dot1 = new fb.Circle({ ...dotOpts, left: x1 - 3, top: y1 - 3 });
      const dot2 = new fb.Circle({ ...dotOpts, left: x2 - 3, top: y2 - 3 });
      cvs.add(dot1, dot2);
      // Add length label
      if (cvs.__showLengths) {
        const lengthMm = Math.round((lengthPx / (cvs.__scale || 50)) * 1000);
        const midX = (x1 + x2) / 2, midY = (y1 + y2) / 2;
        let angle = Math.atan2(dy, dx) * (180 / Math.PI);
        const labelText = new fb.FabricText(lengthMm + "mm", {
          left: midX, top: midY - 12, fontSize: 11, fontFamily: "'Open Sans', monospace",
          fill: "#555", fontWeight: "600", originX: "center", originY: "center",
          selectable: false, evented: false, _isPlanLabel: true, _parentLine: line,
          angle: (angle > 90 || angle < -90) ? angle + 180 : angle
        });
        const labelBg = new fb.Rect({
          left: midX, top: midY - 12, width: labelText.width + 8, height: 16,
          fill: "rgba(255,255,255,0.88)", rx: 3, ry: 3, originX: "center", originY: "center",
          selectable: false, evented: false, _isPlanLabel: true, _parentLine: line,
          angle: (angle > 90 || angle < -90) ? angle + 180 : angle
        });
        cvs.add(labelBg, labelText);
        labelGroupsRef.current.push({ line, bg: labelBg, text: labelText, dot1, dot2 });
      }
      setCursorInfo(null);
      cvs.renderAll();
    });

    return () => { cvs.dispose(); fabricRef.current = null; };
  }, [existingSrc, fabricLoaded]);

  // Sync tool options to canvas
  useEffect(() => {
    const cvs = fabricRef.current; if (!cvs) return;
    cvs.__activeTool = tool;
    cvs.__activeColor = color;
    cvs.__lineWidth = lineWidth;
    cvs.__snapGrid = snapGrid;
    cvs.__snapEndpoints = snapEndpoints;
    cvs.__showLengths = showLengths;
    cvs.__constrainAngle = constrainAngle;
    cvs.__angleStep = angleStep;
    cvs.__scale = scale;

    if (tool === "pen") {
      cvs.isDrawingMode = true;
      cvs.freeDrawingBrush = new (fabricModRef.current.PencilBrush)(cvs);
      cvs.freeDrawingBrush.color = color;
      cvs.freeDrawingBrush.width = lineWidth;
    } else {
      cvs.isDrawingMode = false;
    }
    if (tool === "select") {
      cvs.selection = true;
      cvs.forEachObject(o => { if (!o._isPlanDot && !o._isPlanLabel && !o._isGrid) { o.selectable = true; o.evented = true; } });
    } else if (tool !== "pen") {
      cvs.selection = false;
      cvs.discardActiveObject();
    }
    cvs.renderAll();
  }, [tool, color, lineWidth, snapGrid, snapEndpoints, showLengths, constrainAngle, angleStep, scale]);

  const drawGrid = (cvs, w, h) => {
    const fb = fabricModRef.current; if (!fb) return;
    // Remove old grid
    cvs.getObjects().filter(o => o._isGrid).forEach(o => cvs.remove(o));
    for (let x = 0; x <= w; x += PLAN_GRID_SIZE) {
      const isMajor = x % (PLAN_GRID_SIZE * 5) === 0;
      cvs.add(new fb.Line([x, 0, x, h], { stroke: isMajor ? "#d4d4d4" : "#ececec", strokeWidth: isMajor ? 0.8 : 0.4, selectable: false, evented: false, _isGrid: true }));
    }
    for (let y = 0; y <= h; y += PLAN_GRID_SIZE) {
      const isMajor = y % (PLAN_GRID_SIZE * 5) === 0;
      cvs.add(new fb.Line([0, y, w, y], { stroke: isMajor ? "#d4d4d4" : "#ececec", strokeWidth: isMajor ? 0.8 : 0.4, selectable: false, evented: false, _isGrid: true }));
    }
    // Send grid to back
    cvs.getObjects().filter(o => o._isGrid).forEach(o => cvs.sendObjectToBack(o));
    cvs.renderAll();
  };

  const findNearestEndpoint = (cvs, x, y, threshold, exclude) => {
    let nearest = null, minDist = threshold;
    cvs.getObjects().forEach(obj => {
      if (obj === exclude || obj._isGrid || obj._isPlanLabel) return;
      if (obj._isPlanLine || obj._isWall) {
        [[obj.x1, obj.y1], [obj.x2, obj.y2]].forEach(([px, py]) => {
          const d = Math.sqrt((x - px) ** 2 + (y - py) ** 2);
          if (d < minDist) { minDist = d; nearest = { x: px, y: py }; }
        });
      } else if (obj._isPlanDot) {
        const cx = obj.left + 3, cy = obj.top + 3;
        const d = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
        if (d < minDist) { minDist = d; nearest = { x: cx, y: cy }; }
      }
    });
    return nearest;
  };

  const constrainToAngle = (x1, y1, x2, y2, step) => {
    const dx = x2 - x1, dy = y2 - y1;
    const length = Math.sqrt(dx * dx + dy * dy);
    let angle = Math.atan2(dy, dx) * (180 / Math.PI);
    angle = Math.round(angle / step) * step;
    const rad = angle * (Math.PI / 180);
    return { x: x1 + length * Math.cos(rad), y: y1 + length * Math.sin(rad) };
  };

  const addRect = () => {
    const cvs = fabricRef.current; const fb = fabricModRef.current; if (!cvs || !fb) return;
    setTool("select");
    const rect = new fb.Rect({ left: 100, top: 100, width: 200, height: 150, fill: "transparent", stroke: color, strokeWidth: lineWidth, rx: 0, ry: 0 });
    cvs.add(rect); cvs.setActiveObject(rect); cvs.renderAll();
  };

  const addText = () => {
    const cvs = fabricRef.current; const fb = fabricModRef.current; if (!cvs || !fb) return;
    setTool("select");
    const text = new fb.IText("Label", { left: 100, top: 100, fontSize: 16, fontFamily: "'Open Sans', sans-serif", fontWeight: "600", fill: color, editable: true });
    cvs.add(text); cvs.setActiveObject(text); cvs.renderAll();
  };

  const addDimension = () => {
    const cvs = fabricRef.current; const fb = fabricModRef.current; if (!cvs || !fb) return;
    setTool("select");
    const x1 = 100, y1 = 200, x2 = 300, y2 = 200;
    const mainLine = new fb.Line([x1, y1, x2, y2], { stroke: "#555", strokeWidth: 1, strokeDashArray: [4, 3], _isDimension: true });
    const tick1 = new fb.Line([x1, y1 - 6, x1, y1 + 6], { stroke: "#555", strokeWidth: 1 });
    const tick2 = new fb.Line([x2, y2 - 6, x2, y2 + 6], { stroke: "#555", strokeWidth: 1 });
    const lengthMm = Math.round((Math.abs(x2 - x1) / scale) * 1000);
    const label = new fb.FabricText(lengthMm + "mm", { left: (x1 + x2) / 2, top: y1 - 14, fontSize: 12, fill: "#555", fontWeight: "600", fontFamily: "monospace", originX: "center" });
    const group = new fb.Group([mainLine, tick1, tick2, label], { left: x1, top: y1 - 14 });
    cvs.add(group); cvs.setActiveObject(group); cvs.renderAll();
  };

  const deleteSelected = () => {
    const cvs = fabricRef.current; if (!cvs) return;
    const active = cvs.getActiveObjects();
    if (active.length) {
      active.forEach(obj => {
        // Also remove associated dots & labels
        const associated = labelGroupsRef.current.filter(g => g.line === obj);
        associated.forEach(g => { cvs.remove(g.bg); cvs.remove(g.text); cvs.remove(g.dot1); cvs.remove(g.dot2); });
        labelGroupsRef.current = labelGroupsRef.current.filter(g => g.line !== obj);
        cvs.remove(obj);
      });
      cvs.discardActiveObject(); cvs.renderAll();
    }
  };

  const clearAll = () => {
    const cvs = fabricRef.current; if (!cvs) return;
    cvs.getObjects().filter(o => !o._isGrid).forEach(o => cvs.remove(o));
    labelGroupsRef.current = [];
    cvs.renderAll();
  };

  const handleSave = () => {
    const cvs = fabricRef.current; if (!cvs) return;
    cvs.discardActiveObject();
    // Temporarily hide grid for export
    cvs.getObjects().filter(o => o._isGrid).forEach(o => o.set({ visible: false }));
    cvs.renderAll();
    const dataUrl = cvs.toDataURL({ format: "png", quality: 0.95, multiplier: 2 });
    cvs.getObjects().filter(o => o._isGrid).forEach(o => o.set({ visible: true }));
    cvs.renderAll();
    onSave(dataUrl);
  };

  const tools = [
    { id: "line", icon: "╱", label: "Line" },
    { id: "wall", icon: "▬", label: "Wall" },
    { id: "rect", icon: "▢", label: "Room", action: addRect },
    { id: "pen", icon: "✏️", label: "Freehand" },
    { id: "text", icon: "T", label: "Label", action: addText },
    { id: "dimension", icon: "↔", label: "Dimension", action: addDimension },
    { id: "select", icon: "☝️", label: "Select" },
  ];

  const btnStyle = (active) => ({ padding: "5px 9px", borderRadius: 6, border: active ? "2px solid #fff" : "2px solid transparent", background: active ? "rgba(255,255,255,0.15)" : "transparent", color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 4 });
  const toggleStyle = (on) => ({ padding: "4px 8px", borderRadius: 5, border: "none", background: on ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.06)", color: on ? "#fff" : "#888", cursor: "pointer", fontSize: 11, fontWeight: 600 });

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 10000, background: "rgba(0,0,0,0.92)", display: "flex", flexDirection: "column", alignItems: "center" }}>
      {/* Top Toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "8px 12px", background: "#1e1e1e", borderRadius: "0 0 12px 12px", flexWrap: "wrap", justifyContent: "center", maxWidth: "100%", position: "relative", zIndex: 10 }}>
        {tools.map(t => (
          <button key={t.id} onClick={() => { if (t.action) t.action(); else setTool(t.id); }} style={btnStyle(tool === t.id)}>
            <span style={{ fontSize: 14 }}>{t.icon}</span> {t.label}
          </button>
        ))}
        <div style={{ width: 1, height: 22, background: "#555", margin: "0 3px" }} />
        <button onClick={deleteSelected} style={{ ...btnStyle(false), color: "#f87171" }}>🗑</button>
        <button onClick={clearAll} style={{ ...btnStyle(false), color: "#fbbf24" }}>✕ Clear</button>
        <div style={{ width: 1, height: 22, background: "#555", margin: "0 3px" }} />
        {/* Line width */}
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ color: "#aaa", fontSize: 10, fontWeight: 600 }}>Width</span>
          {PLAN_LINE_WIDTHS.map(w => (
            <button key={w} onClick={() => setLineWidth(w)}
              style={{ width: 22, height: 22, borderRadius: 4, border: lineWidth === w ? "2px solid #fff" : "1px solid #555", background: lineWidth === w ? "rgba(255,255,255,0.15)" : "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ width: Math.min(w * 2, 14), height: Math.min(w, 8), background: "#fff", borderRadius: 1 }} />
            </button>
          ))}
        </div>
        <div style={{ width: 1, height: 22, background: "#555", margin: "0 3px" }} />
        {/* Colors */}
        <div style={{ display: "flex", gap: 3 }}>
          {PLAN_COLORS.map(c => (
            <button key={c} onClick={() => setColor(c)}
              style={{ width: 20, height: 20, borderRadius: "50%", background: c, border: color === c ? "3px solid #fff" : `1px solid ${c === "#111111" ? "#666" : "transparent"}`, cursor: "pointer" }} />
          ))}
        </div>
      </div>

      {/* Snap/Options Bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", background: "#161616", width: "100%", justifyContent: "center", flexWrap: "wrap", position: "relative", zIndex: 10 }}>
        <button onClick={() => setSnapGrid(v => !v)} style={toggleStyle(snapGrid)}>⊞ Snap Grid</button>
        <button onClick={() => setSnapEndpoints(v => !v)} style={toggleStyle(snapEndpoints)}>⊙ Snap Endpoints</button>
        <button onClick={() => setShowLengths(v => !v)} style={toggleStyle(showLengths)}>📏 Show Lengths</button>
        <button onClick={() => setConstrainAngle(v => !v)} style={toggleStyle(constrainAngle)}>📐 Constrain Angle</button>
        {constrainAngle && (
          <select value={angleStep} onChange={e => setAngleStep(Number(e.target.value))} style={{ padding: "3px 6px", borderRadius: 4, background: "#333", color: "#fff", border: "1px solid #555", fontSize: 11 }}>
            <option value={15}>15°</option>
            <option value={30}>30°</option>
            <option value={45}>45°</option>
            <option value={90}>90°</option>
          </select>
        )}
        <div style={{ width: 1, height: 18, background: "#444" }} />
        <span style={{ color: "#888", fontSize: 11 }}>Scale:</span>
        <select value={scale} onChange={e => setScale(Number(e.target.value))} style={{ padding: "3px 6px", borderRadius: 4, background: "#333", color: "#fff", border: "1px solid #555", fontSize: 11 }}>
          <option value={100}>100mm = 10px</option>
          <option value={250}>100mm = 25px</option>
          <option value={500}>100mm = 50px</option>
          <option value={1000}>100mm = 100px</option>
        </select>
        {cursorInfo && (
          <>
            <div style={{ width: 1, height: 18, background: "#444" }} />
            <span style={{ color: "#0891b2", fontSize: 12, fontWeight: 700, fontFamily: "monospace" }}>
              {cursorInfo.length}mm &nbsp; {cursorInfo.angle}°
            </span>
          </>
        )}
      </div>

      {/* Canvas */}
      <div ref={containerRef} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", width: "100%", padding: "10px 20px", overflow: "auto" }}>
        <div style={{ borderRadius: 8, overflow: "hidden", boxShadow: "0 4px 24px rgba(0,0,0,0.5)", border: "1px solid #333" }}>
          <canvas ref={canvasRef} />
        </div>
      </div>

      {/* Bottom bar */}
      <div style={{ display: "flex", gap: 10, padding: "10px 20px", background: "#1e1e1e", borderRadius: "12px 12px 0 0", width: "100%", justifyContent: "center", position: "relative", zIndex: 10 }}>
        <button onClick={onClose} style={{ padding: "8px 24px", borderRadius: 8, border: "1px solid #555", background: "transparent", color: "#ccc", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>Cancel</button>
        <button onClick={handleSave} style={{ padding: "8px 24px", borderRadius: 8, border: "none", background: "#0891b2", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 700 }}>💾 Save Plan</button>
      </div>
    </div>
  );
};

export { PlanDrawingEditor };
