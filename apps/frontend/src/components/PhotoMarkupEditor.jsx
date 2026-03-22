import { useState, useRef, useEffect } from "react";

// ── Photo Markup Editor (fabric.js) ───────────────────────────────────────────
const MARKUP_COLORS = ["#dc2626", "#f97316", "#eab308", "#22c55e", "#3b82f6", "#8b5cf6", "#ffffff", "#000000"];
const PhotoMarkupEditor = ({ imageSrc, onSave, onClose }) => {
  const canvasRef = useRef(null);
  const fabricRef = useRef(null);
  const containerRef = useRef(null);
  const fabricModRef = useRef(null);
  const [tool, setTool] = useState("pen");
  const [color, setColor] = useState("#dc2626");
  const [brushSize, setBrushSize] = useState(3);
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

  useEffect(() => {
    if (!fabricLoaded || !canvasRef.current || fabricRef.current) return;
    const fb = fabricModRef.current;
    const cvs = new fb.Canvas(canvasRef.current, { isDrawingMode: true, selection: true });
    fabricRef.current = cvs;

    // Load the background image
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const container = containerRef.current;
      const maxW = container ? container.clientWidth - 40 : 800;
      const maxH = (window.innerHeight * 0.65);
      const scale = Math.min(maxW / img.width, maxH / img.height, 1);
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      cvs.setDimensions({ width: w, height: h });
      const bgImg = new fb.FabricImage(img, { scaleX: scale, scaleY: scale });
      cvs.backgroundImage = bgImg;
      cvs.renderAll();
    };
    img.src = imageSrc;

    cvs.freeDrawingBrush = new fb.PencilBrush(cvs);
    cvs.freeDrawingBrush.color = color;
    cvs.freeDrawingBrush.width = brushSize;

    return () => { cvs.dispose(); fabricRef.current = null; };
  }, [imageSrc, fabricLoaded]);

  useEffect(() => {
    const cvs = fabricRef.current;
    if (!cvs) return;
    if (tool === "pen") {
      cvs.isDrawingMode = true;
      cvs.freeDrawingBrush = new (fabricModRef.current.PencilBrush)(cvs);
      cvs.freeDrawingBrush.color = color;
      cvs.freeDrawingBrush.width = brushSize;
    } else {
      cvs.isDrawingMode = false;
    }
  }, [tool, color, brushSize]);

  const addArrow = () => {
    const cvs = fabricRef.current; const fb = fabricModRef.current; if (!cvs || !fb) return;
    setTool("select");
    const line = new fb.Line([50, 100, 200, 100], { stroke: color, strokeWidth: brushSize, selectable: true });
    const head = new fb.Triangle({ width: 14, height: 14, fill: color, left: 200, top: 100, angle: 90, originX: "center", originY: "center", selectable: false });
    const group = new fb.Group([line, head], { left: 50, top: 80 });
    cvs.add(group);
    cvs.setActiveObject(group);
    cvs.renderAll();
  };

  const addRect = () => {
    const cvs = fabricRef.current; const fb = fabricModRef.current; if (!cvs || !fb) return;
    setTool("select");
    const rect = new fb.Rect({ left: 60, top: 60, width: 150, height: 100, fill: "transparent", stroke: color, strokeWidth: brushSize, rx: 4, ry: 4 });
    cvs.add(rect);
    cvs.setActiveObject(rect);
    cvs.renderAll();
  };

  const addCircle = () => {
    const cvs = fabricRef.current; const fb = fabricModRef.current; if (!cvs || !fb) return;
    setTool("select");
    const circle = new fb.Circle({ left: 80, top: 80, radius: 50, fill: "transparent", stroke: color, strokeWidth: brushSize });
    cvs.add(circle);
    cvs.setActiveObject(circle);
    cvs.renderAll();
  };

  const addText = () => {
    const cvs = fabricRef.current; const fb = fabricModRef.current; if (!cvs || !fb) return;
    setTool("select");
    const text = new fb.IText("Note", { left: 60, top: 60, fontSize: 20, fontFamily: "Open Sans, sans-serif", fontWeight: "700", fill: color, editable: true });
    cvs.add(text);
    cvs.setActiveObject(text);
    cvs.renderAll();
  };

  const deleteSelected = () => {
    const cvs = fabricRef.current; if (!cvs) return;
    const active = cvs.getActiveObjects();
    if (active.length) { active.forEach(o => cvs.remove(o)); cvs.discardActiveObject(); cvs.renderAll(); }
  };

  const clearAll = () => {
    const cvs = fabricRef.current; if (!cvs) return;
    const objs = cvs.getObjects();
    objs.forEach(o => cvs.remove(o));
    cvs.renderAll();
  };

  const handleSave = () => {
    const cvs = fabricRef.current; if (!cvs) return;
    cvs.discardActiveObject();
    cvs.renderAll();
    const dataUrl = cvs.toDataURL({ format: "png", quality: 0.92, multiplier: 2 });
    onSave(dataUrl);
  };

  const tools = [
    { id: "pen", icon: "✏️", label: "Draw" },
    { id: "arrow", icon: "➡️", label: "Arrow", action: addArrow },
    { id: "rect", icon: "▢", label: "Rectangle", action: addRect },
    { id: "circle", icon: "◯", label: "Circle", action: addCircle },
    { id: "text", icon: "T", label: "Text", action: addText },
    { id: "select", icon: "☝️", label: "Select" },
  ];

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 10000, background: "rgba(0,0,0,0.88)", display: "flex", flexDirection: "column", alignItems: "center" }}>
      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 16px", background: "#1e1e1e", borderRadius: "0 0 12px 12px", flexWrap: "wrap", justifyContent: "center", maxWidth: "100%" }}>
        {tools.map(t => (
          <button key={t.id} onClick={() => { if (t.action) t.action(); else setTool(t.id); }}
            style={{ padding: "6px 10px", borderRadius: 6, border: tool === t.id ? "2px solid #fff" : "2px solid transparent", background: tool === t.id ? "rgba(255,255,255,0.15)" : "transparent", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ fontSize: 15 }}>{t.icon}</span> {t.label}
          </button>
        ))}
        <div style={{ width: 1, height: 24, background: "#555", margin: "0 4px" }} />
        <button onClick={deleteSelected} style={{ padding: "6px 10px", borderRadius: 6, border: "2px solid transparent", background: "transparent", color: "#f87171", cursor: "pointer", fontSize: 13, fontWeight: 600 }} title="Delete selected">🗑 Delete</button>
        <button onClick={clearAll} style={{ padding: "6px 10px", borderRadius: 6, border: "2px solid transparent", background: "transparent", color: "#fbbf24", cursor: "pointer", fontSize: 13, fontWeight: 600 }} title="Clear all markups">✕ Clear</button>
        <div style={{ width: 1, height: 24, background: "#555", margin: "0 4px" }} />
        {/* Brush size */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ color: "#aaa", fontSize: 11, fontWeight: 600 }}>Size</span>
          <input type="range" min="1" max="12" value={brushSize} onChange={e => setBrushSize(Number(e.target.value))} style={{ width: 70, accentColor: color }} />
        </div>
        <div style={{ width: 1, height: 24, background: "#555", margin: "0 4px" }} />
        {/* Colors */}
        <div style={{ display: "flex", gap: 3 }}>
          {MARKUP_COLORS.map(c => (
            <button key={c} onClick={() => setColor(c)}
              style={{ width: 22, height: 22, borderRadius: "50%", background: c, border: color === c ? "3px solid #fff" : `2px solid ${c === "#ffffff" ? "#666" : "transparent"}`, cursor: "pointer", boxShadow: color === c ? "0 0 6px rgba(255,255,255,0.4)" : "none" }} />
          ))}
        </div>
      </div>

      {/* Canvas area */}
      <div ref={containerRef} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", width: "100%", padding: 20, overflow: "auto" }}>
        <div style={{ borderRadius: 8, overflow: "hidden", boxShadow: "0 4px 24px rgba(0,0,0,0.5)" }}>
          <canvas ref={canvasRef} />
        </div>
      </div>

      {/* Bottom bar */}
      <div style={{ display: "flex", gap: 10, padding: "12px 20px", background: "#1e1e1e", borderRadius: "12px 12px 0 0", width: "100%", justifyContent: "center" }}>
        <button onClick={onClose} style={{ padding: "8px 24px", borderRadius: 8, border: "1px solid #555", background: "transparent", color: "#ccc", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>Cancel</button>
        <button onClick={handleSave} style={{ padding: "8px 24px", borderRadius: 8, border: "none", background: "#0891b2", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 700 }}>💾 Save Markup</button>
      </div>
    </div>
  );
};

export { PhotoMarkupEditor };
