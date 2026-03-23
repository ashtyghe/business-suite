/**
 * Document PDF generation — builds clean HTML and converts to base64 PDF
 * Used for attaching PDFs to emails sent via Resend
 */

const fmt = (n) => "$" + Number(n || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const fmtAddr = ({ address, suburb, state, postcode } = {}) => {
  if (suburb || state || postcode) return [address, [suburb, state, postcode].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return address || "";
};
const fmtDate = (d) => {
  if (!d) return "—";
  const dt = new Date(d + (d.includes("T") ? "" : "T00:00:00"));
  return dt.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
};

// ── Shared HTML building blocks ─────────────────────────────────────────────

function docStyles(accentColor) {
  return `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; color: #1e293b; font-size: 13px; line-height: 1.5; padding: 40px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 20px; border-bottom: 3px solid ${accentColor}; margin-bottom: 24px; }
    .doc-title { font-size: 26px; font-weight: 900; color: #0f172a; }
    .doc-ref { font-size: 14px; color: #94a3b8; margin-top: 4px; }
    .meta { text-align: right; font-size: 12px; color: #475569; }
    .meta p { margin: 3px 0; }
    .meta strong { color: #334155; }
    .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 24px; }
    .party-label { font-size: 10px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 6px; }
    .party-name { font-weight: 700; font-size: 15px; margin-bottom: 2px; }
    .party-detail { font-size: 12px; color: #475569; }
    table.items { width: 100%; border-collapse: collapse; margin: 16px 0; }
    table.items th { text-align: left; padding: 8px; font-size: 10px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.06em; border-bottom: 2px solid #e2e8f0; }
    table.items th.right { text-align: right; }
    table.items td { padding: 10px 8px; border-bottom: 1px solid #f1f5f9; font-size: 13px; color: #334155; }
    table.items td.right { text-align: right; }
    table.items td.bold { font-weight: 600; }
    .totals { margin-left: auto; max-width: 260px; margin-top: 8px; }
    .totals-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 13px; }
    .totals-row span:first-child { color: #94a3b8; }
    .totals-row span:last-child { font-weight: 600; }
    .totals-row.total { border-top: 2px solid #e2e8f0; margin-top: 4px; padding-top: 10px; font-size: 15px; }
    .totals-row.total span:first-child { font-weight: 700; color: #0f172a; }
    .totals-row.total span:last-child { font-weight: 800; color: ${accentColor}; }
    .section-box { border-radius: 8px; padding: 14px 16px; margin: 16px 0; }
    .section-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 6px; }
    .section-text { font-size: 13px; color: #334155; white-space: pre-line; line-height: 1.6; }
    .notes-section { border-top: 1px solid #e2e8f0; margin-top: 20px; padding-top: 16px; }
    .notes-label { font-size: 10px; font-weight: 700; color: #94a3b8; text-transform: uppercase; margin-bottom: 6px; }
    .notes-text { font-size: 12px; color: #475569; white-space: pre-line; }
    .accept-box { text-align: center; margin: 32px 0 20px; }
    .accept-btn { display: inline-block; padding: 12px 36px; background: ${accentColor}; color: #fff; font-size: 14px; font-weight: 700; text-decoration: none; border-radius: 8px; }
    .accept-hint { font-size: 10px; color: #94a3b8; margin-top: 6px; }
    .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 10px; color: #94a3b8; text-align: center; }
    @media print { body { padding: 20px; } .accept-box { display: none; } }
  `;
}

function esc(val) {
  return String(val || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ── Quote PDF HTML ──────────────────────────────────────────────────────────

export function buildQuotePdfHtml({ quote, job, client, company, template, acceptUrl }) {
  const accent = template?.accentColor || "#111111";
  const lineItems = quote.lineItems || [];
  const sub = lineItems.reduce((s, l) => s + (l.qty || 0) * (l.rate || 0), 0);
  const taxRate = quote.tax || 10;
  const tax = sub * taxRate / 100;
  const total = sub + tax;

  const linesHtml = lineItems.map(l => `
    <tr>
      <td>${esc(l.desc || "—")}</td>
      <td class="right">${l.qty} ${esc(l.unit || "")}</td>
      <td class="right">${fmt(l.rate)}</td>
      <td class="right bold">${fmt((l.qty || 0) * (l.rate || 0))}</td>
    </tr>`).join("");

  const acceptHtml = acceptUrl ? `
    <div class="accept-box">
      <a href="${acceptUrl}" class="accept-btn">Accept Quote</a>
      <div class="accept-hint">Click to accept this quote online</div>
    </div>` : "";

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Quote ${esc(quote.number)}</title>
<style>${docStyles(accent)}</style></head><body>
  <div class="header">
    <div>
      <div class="doc-title">QUOTE</div>
      <div class="doc-ref">${esc(quote.number)}</div>
    </div>
    <div class="meta">
      <p><strong>Date:</strong> ${fmtDate(quote.createdAt)}</p>
      ${job ? `<p><strong>Job:</strong> ${esc(job.title)}</p>` : ""}
    </div>
  </div>

  <div class="parties">
    <div>
      <div class="party-label">From</div>
      <div class="party-name">${esc(company?.companyName || "FieldOps")}</div>
      ${company?.abn ? `<div class="party-detail">ABN: ${esc(company.abn)}</div>` : ""}
      ${fmtAddr(company) ? `<div class="party-detail">${esc(fmtAddr(company))}</div>` : ""}
      ${company?.phone ? `<div class="party-detail">${esc(company.phone)}</div>` : ""}
      ${company?.email ? `<div class="party-detail">${esc(company.email)}</div>` : ""}
    </div>
    <div>
      <div class="party-label">To</div>
      <div class="party-name">${esc(client?.name || "—")}</div>
      ${client?.email ? `<div class="party-detail">${esc(client.email)}</div>` : ""}
      ${client?.phone ? `<div class="party-detail">${esc(client.phone)}</div>` : ""}
      ${fmtAddr(client) ? `<div class="party-detail">${esc(fmtAddr(client))}</div>` : ""}
    </div>
  </div>

  <table class="items">
    <thead><tr><th>Description</th><th class="right">Qty</th><th class="right">Rate</th><th class="right">Total</th></tr></thead>
    <tbody>${linesHtml}</tbody>
  </table>

  <div class="totals">
    <div class="totals-row"><span>Subtotal</span><span>${fmt(sub)}</span></div>
    <div class="totals-row"><span>GST (${taxRate}%)</span><span>${fmt(tax)}</span></div>
    <div class="totals-row total"><span>Total (inc. GST)</span><span>${fmt(total)}</span></div>
  </div>

  ${quote.notes ? `<div class="notes-section"><div class="notes-label">Notes / Terms</div><div class="notes-text">${esc(quote.notes)}</div></div>` : ""}
  ${template?.terms ? `<div class="notes-section"><div class="notes-label">Terms & Conditions</div><div class="notes-text">${esc(template.terms)}</div></div>` : ""}
  ${acceptHtml}
  ${template?.footer ? `<div class="footer">${esc(template.footer)}</div>` : `<div class="footer">Generated ${fmtDate(new Date().toISOString())} · FieldOps</div>`}
</body></html>`;
}

// ── Invoice PDF HTML ────────────────────────────────────────────────────────

export function buildInvoicePdfHtml({ invoice, job, client, company, template }) {
  const accent = template?.accentColor || "#4f46e5";
  const lineItems = invoice.lineItems || [];
  const sub = lineItems.reduce((s, l) => s + (l.qty || 0) * (l.rate || 0), 0);
  const taxRate = invoice.tax || 10;
  const tax = sub * taxRate / 100;
  const total = sub + tax;

  const linesHtml = lineItems.map(l => `
    <tr>
      <td>${esc(l.desc || "—")}</td>
      <td class="right">${l.qty} ${esc(l.unit || "")}</td>
      <td class="right">${fmt(l.rate)}</td>
      <td class="right bold">${fmt((l.qty || 0) * (l.rate || 0))}</td>
    </tr>`).join("");

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Invoice ${esc(invoice.number)}</title>
<style>${docStyles(accent)}</style></head><body>
  <div class="header">
    <div>
      <div class="doc-title">INVOICE</div>
      <div class="doc-ref">${esc(invoice.number)}</div>
    </div>
    <div class="meta">
      <p><strong>Date:</strong> ${fmtDate(invoice.createdAt)}</p>
      <p><strong>Due Date:</strong> ${fmtDate(invoice.dueDate) || "On receipt"}</p>
      ${job ? `<p><strong>Job:</strong> ${esc(job.title)}</p>` : ""}
    </div>
  </div>

  <div class="parties">
    <div>
      <div class="party-label">From</div>
      <div class="party-name">${esc(company?.companyName || "FieldOps")}</div>
      ${company?.abn ? `<div class="party-detail">ABN: ${esc(company.abn)}</div>` : ""}
      ${fmtAddr(company) ? `<div class="party-detail">${esc(fmtAddr(company))}</div>` : ""}
      ${company?.phone ? `<div class="party-detail">${esc(company.phone)}</div>` : ""}
      ${company?.email ? `<div class="party-detail">${esc(company.email)}</div>` : ""}
    </div>
    <div>
      <div class="party-label">Bill To</div>
      <div class="party-name">${esc(client?.name || "—")}</div>
      ${client?.email ? `<div class="party-detail">${esc(client.email)}</div>` : ""}
      ${client?.phone ? `<div class="party-detail">${esc(client.phone)}</div>` : ""}
      ${fmtAddr(client) ? `<div class="party-detail">${esc(fmtAddr(client))}</div>` : ""}
    </div>
  </div>

  <table class="items">
    <thead><tr><th>Description</th><th class="right">Qty</th><th class="right">Rate</th><th class="right">Total</th></tr></thead>
    <tbody>${linesHtml}</tbody>
  </table>

  <div class="totals">
    <div class="totals-row"><span>Subtotal</span><span>${fmt(sub)}</span></div>
    <div class="totals-row"><span>GST (${taxRate}%)</span><span>${fmt(tax)}</span></div>
    <div class="totals-row total"><span>Amount Due</span><span>${fmt(total)}</span></div>
  </div>

  ${invoice.notes ? `<div class="notes-section"><div class="notes-label">Notes</div><div class="notes-text">${esc(invoice.notes)}</div></div>` : ""}
  ${template?.terms ? `<div class="notes-section"><div class="notes-label">Payment Terms</div><div class="notes-text">${esc(template.terms)}</div></div>` : ""}
  ${template?.footer ? `<div class="footer">${esc(template.footer)}</div>` : `<div class="footer">Generated ${fmtDate(new Date().toISOString())} · FieldOps</div>`}
</body></html>`;
}

// ── Work Order / Purchase Order PDF HTML ─────────────────────────────────────

export function buildOrderPdfHtml({ type, order, job, company, template, acceptUrl }) {
  const isWO = type === "wo" || type === "work_order";
  const accent = isWO ? "#2563eb" : "#059669";
  const title = isWO ? "WORK ORDER" : "PURCHASE ORDER";
  const partyLabel = isWO ? "Contractor" : "Supplier";
  const partyName = isWO ? order.contractorName : order.supplierName;
  const partyContact = isWO ? order.contractorContact : order.supplierContact;
  const partyEmail = isWO ? order.contractorEmail : order.supplierEmail;

  const scopeHtml = isWO && order.scopeOfWork ? `
    <div class="section-box" style="background:#eff6ff;">
      <div class="section-label" style="color:${accent};">Scope of Work</div>
      <div class="section-text">${esc(order.scopeOfWork)}</div>
    </div>` : "";

  const deliveryHtml = !isWO && order.deliveryAddress ? `
    <div class="section-box" style="background:#ecfdf5;">
      <div class="section-label" style="color:${accent};">Delivery Address</div>
      <div class="section-text">${esc(order.deliveryAddress)}</div>
    </div>` : "";

  const linesHtml = (!isWO && order.lines?.length > 0) ? `
    <table class="items">
      <thead><tr><th>Description</th><th class="right">Qty</th><th>Unit</th></tr></thead>
      <tbody>${order.lines.map(l => `<tr><td>${esc(l.desc || "—")}</td><td class="right">${l.qty}</td><td>${esc(l.unit || "")}</td></tr>`).join("")}</tbody>
    </table>` : "";

  const poLimitHtml = order.poLimit ? `
    <div class="section-box" style="background:#fffbeb;border:1px solid #fcd34d;">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <span style="font-size:13px;font-weight:600;color:#92400e;">PO Limit</span>
        <span style="font-size:18px;font-weight:800;color:#b45309;">${fmt(parseFloat(order.poLimit))}</span>
      </div>
    </div>` : "";

  const acceptHtml = acceptUrl ? `
    <div class="accept-box">
      <a href="${acceptUrl}" class="accept-btn" style="background:${accent};">Accept ${isWO ? "Work Order" : "Purchase Order"}</a>
      <div class="accept-hint">Click to accept this ${title.toLowerCase()} online</div>
    </div>` : "";

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title} ${esc(order.ref)}</title>
<style>${docStyles(accent)}</style></head><body>
  <div class="header">
    <div>
      <div class="doc-title">${title}</div>
      <div class="doc-ref">${esc(order.ref)}</div>
    </div>
    <div class="meta">
      <p><strong>Issue Date:</strong> ${fmtDate(order.issueDate)}</p>
      <p><strong>${isWO ? "Due Date" : "Delivery"}:</strong> ${fmtDate(order.dueDate)}</p>
      ${job ? `<p><strong>Job:</strong> ${esc(job.jobNumber || job.title)}</p>` : ""}
    </div>
  </div>

  <div class="parties">
    <div>
      <div class="party-label">From</div>
      <div class="party-name">${esc(company?.companyName || "FieldOps")}</div>
      ${company?.abn ? `<div class="party-detail">ABN: ${esc(company.abn)}</div>` : ""}
      ${fmtAddr(company) ? `<div class="party-detail">${esc(fmtAddr(company))}</div>` : ""}
    </div>
    <div>
      <div class="party-label">${partyLabel}</div>
      <div class="party-name">${esc(partyName || "—")}</div>
      ${partyContact ? `<div class="party-detail">${esc(partyContact)}</div>` : ""}
      ${partyEmail ? `<div class="party-detail">${esc(partyEmail)}</div>` : ""}
    </div>
  </div>

  ${scopeHtml}${deliveryHtml}${linesHtml}${poLimitHtml}

  ${order.notes ? `<div class="notes-section"><div class="notes-label">Notes / Terms</div><div class="notes-text">${esc(order.notes)}</div></div>` : ""}
  ${acceptHtml}
  <div class="footer">Generated ${fmtDate(new Date().toISOString())} · FieldOps</div>
</body></html>`;
}

// ── HTML → Base64 PDF conversion using iframe + print ───────────────────────
// Uses the browser's built-in print rendering to create a clean PDF

export async function htmlToPdfBase64(html, filename) {
  return new Promise((resolve, reject) => {
    const iframe = document.createElement("iframe");
    iframe.style.cssText = "position:fixed;top:-9999px;left:-9999px;width:794px;height:1123px;border:none;";
    document.body.appendChild(iframe);

    iframe.onload = () => {
      try {
        const doc = iframe.contentDocument || iframe.contentWindow.document;
        doc.open();
        doc.write(html);
        doc.close();

        // Give the browser time to render styles
        setTimeout(async () => {
          try {
            // Use html2canvas approach via canvas if available,
            // otherwise fall back to sending raw HTML as attachment
            const canvas = document.createElement("canvas");
            const ctx = canvas.getContext("2d");

            // Use SVG foreignObject to render HTML to canvas
            const svgData = `
              <svg xmlns="http://www.w3.org/2000/svg" width="794" height="1123">
                <foreignObject width="100%" height="100%">
                  <div xmlns="http://www.w3.org/1999/xhtml">
                    ${html.replace(/<!DOCTYPE[^>]*>/i, "").replace(/<\/?html[^>]*>/gi, "").replace(/<head>.*?<\/head>/is, "")}
                  </div>
                </foreignObject>
              </svg>`;

            const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
            const url = URL.createObjectURL(svgBlob);
            const img = new Image();

            img.onload = () => {
              canvas.width = 794 * 2; // 2x for quality
              canvas.height = 1123 * 2;
              ctx.scale(2, 2);
              ctx.fillStyle = "#fff";
              ctx.fillRect(0, 0, 794, 1123);
              ctx.drawImage(img, 0, 0, 794, 1123);
              URL.revokeObjectURL(url);
              document.body.removeChild(iframe);

              // Convert canvas to PDF using pdf-lib
              import("pdf-lib").then(({ PDFDocument }) => {
                PDFDocument.create().then(async (pdfDoc) => {
                  const pngData = canvas.toDataURL("image/png");
                  const pngBytes = Uint8Array.from(atob(pngData.split(",")[1]), c => c.charCodeAt(0));
                  const pngImage = await pdfDoc.embedPng(pngBytes);
                  const page = pdfDoc.addPage([595.28, 841.89]); // A4
                  page.drawImage(pngImage, {
                    x: 0, y: 0,
                    width: 595.28, height: 841.89,
                  });
                  const pdfBytes = await pdfDoc.save();
                  const base64 = btoa(String.fromCharCode(...pdfBytes));
                  resolve(base64);
                }).catch(reject);
              }).catch(reject);
            };

            img.onerror = () => {
              // Fallback: just send the HTML content as base64
              URL.revokeObjectURL(url);
              document.body.removeChild(iframe);
              resolve(btoa(unescape(encodeURIComponent(html))));
            };

            img.src = url;
          } catch (err) {
            document.body.removeChild(iframe);
            // Fallback: send HTML as base64
            resolve(btoa(unescape(encodeURIComponent(html))));
          }
        }, 300);
      } catch (err) {
        document.body.removeChild(iframe);
        reject(err);
      }
    };

    iframe.onerror = () => {
      document.body.removeChild(iframe);
      reject(new Error("Failed to create PDF iframe"));
    };

    iframe.src = "about:blank";
  });
}
