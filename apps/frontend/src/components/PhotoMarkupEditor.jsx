import { useState, useRef, useEffect } from "react";
import s from './PhotoMarkupEditor.module.css';

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
    <div className={s.overlay}>
      {/* Toolbar */}
      <div className={s.toolbar}>
        {tools.map(t => (
          <button key={t.id} onClick={() => { if (t.action) t.action(); else setTool(t.id); }}
            className={tool === t.id ? s.toolButtonActive : s.toolButtonInactive}>
            <span className={s.toolIcon}>{t.icon}</span> {t.label}
          </button>
        ))}
        <div className={s.divider} />
        <button onClick={deleteSelected} className={s.deleteButton} title="Delete selected">🗑 Delete</button>
        <button onClick={clearAll} className={s.clearButton} title="Clear all markups">✕ Clear</button>
        <div className={s.divider} />
        {/* Brush size */}
        <div className={s.brushSizeGroup}>
          <span className={s.brushSizeLabel}>Size</span>
          <input type="range" min="1" max="12" value={brushSize} onChange={e => setBrushSize(Number(e.target.value))} style={{ width: 70, accentColor: color }} />
        </div>
        <div className={s.divider} />
        {/* Colors */}
        <div className={s.colorsRow}>
          {MARKUP_COLORS.map(c => (
            <button key={c} onClick={() => setColor(c)}
              className={s.colorSwatch} style={{ background: c, border: color === c ? "3px solid #fff" : `2px solid ${c === "#ffffff" ? "#666" : "transparent"}`, boxShadow: color === c ? "0 0 6px rgba(255,255,255,0.4)" : "none" }} />
          ))}
        </div>
      </div>

      {/* Canvas area */}
      <div ref={containerRef} className={s.canvasArea}>
        <div className={s.canvasWrapper}>
          <canvas ref={canvasRef} />
        </div>
      </div>

      {/* Bottom bar */}
      <div className={s.bottomBar}>
        <button onClick={onClose} className={s.cancelButton}>Cancel</button>
        <button onClick={handleSave} className={s.saveButton}>💾 Save Markup</button>
      </div>
    </div>
  );
};

export { PhotoMarkupEditor };
