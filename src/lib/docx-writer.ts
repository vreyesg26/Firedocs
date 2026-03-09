// src/lib/docx-writer.ts
import JSZip from "jszip";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import {
  evaluateXPathToFirstNode,
  evaluateXPathToNodes,
  evaluateXPathToNumber,
} from "fontoxpath";
import type {
  CommunicationMatrixRow,
  PiezasGrupo,
  UISection,
  BackupTableGroup,
  InstallationTableGroup,
} from "@/types/manual";

/* ============================== Namespaces ============================== */

const W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const nsResolver = (prefix: string | null) => (prefix === "w" ? W_NS : null);

/* ============================= XPath helpers ============================ */

function xpNode(xpath: string, ctx: Node | null): Node | null {
  if (!ctx) return null;
  return evaluateXPathToFirstNode(xpath, ctx, null, null, {
    namespaceResolver: nsResolver,
  });
}
function xpNodes(xpath: string, ctx: Node | null): Node[] {
  if (!ctx) return [];
  return evaluateXPathToNodes(xpath, ctx, null, null, {
    namespaceResolver: nsResolver,
  }) as Node[];
}
function xpNum(xpath: string, ctx: Node | null): number {
  if (!ctx) return 0;
  const n = evaluateXPathToNumber(xpath, ctx, null, null, {
    namespaceResolver: nsResolver,
  });
  return Number.isFinite(n) ? (n as number) : 0;
}

/* ============================ Text utilities ============================ */

function getTextDeep(n: Node | null): string {
  if (!n) return "";
  const ts = xpNodes(".//w:t", n);
  return ts
    .map((t) =>
      ((t as Element).textContent || "").replace(/\u00A0/g, " ").trim()
    )
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Escribe texto dentro de la celda sin tocar estructura:
 * - Usa el PRIMER <w:p> existente.
 * - Si ese <w:p> no tiene <w:r>/<w:t>, los crea dentro de ese mismo <w:p>.
 * - No cambia alineación ni spacing si el párrafo ya existía.
 */
function setCellTextKeepParagraph(
  tc: Node | null,
  text: string,
  doc: Document,
  opts?: {
    bold?: boolean;
    italic?: boolean;
    align?: "left" | "center" | "right";
    verticalAlign?: "top" | "center" | "bottom";
  }
) {
  if (!tc) return;

  let p = xpNode("./w:p[1]", tc);
  if (!p) {
    // Celda totalmente vacía: creamos un p mínimo.
    p = (tc as Element).appendChild(doc.createElementNS(W_NS, "w:p"));
  }

  if (opts?.align) {
    let pPr = xpNode("./w:pPr[1]", p);
    if (!pPr) pPr = (p as Element).insertBefore(doc.createElementNS(W_NS, "w:pPr"), p.firstChild);

    let jc = xpNode("./w:jc[1]", pPr);
    if (!jc) jc = (pPr as Element).appendChild(doc.createElementNS(W_NS, "w:jc"));
    (jc as Element).setAttributeNS(W_NS, "w:val", opts.align);
  }

  if (opts?.verticalAlign) {
    let tcPr = xpNode("./w:tcPr[1]", tc);
    if (!tcPr) tcPr = (tc as Element).insertBefore(doc.createElementNS(W_NS, "w:tcPr"), tc.firstChild);

    let vAlign = xpNode("./w:vAlign[1]", tcPr);
    if (!vAlign) {
      vAlign = (tcPr as Element).appendChild(doc.createElementNS(W_NS, "w:vAlign"));
    }
    (vAlign as Element).setAttributeNS(W_NS, "w:val", opts.verticalAlign);
  }

  for (const child of Array.from(p.childNodes)) {
    if (child.nodeType === 1 && (child as Element).localName === "pPr") continue;
    p.removeChild(child);
  }

  const lines = String(text ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");

  for (let i = 0; i < lines.length; i += 1) {
    const run = doc.createElementNS(W_NS, "w:r");

    if (opts?.bold || opts?.italic) {
      const rPr = doc.createElementNS(W_NS, "w:rPr");

      if (opts.bold) {
        const b = doc.createElementNS(W_NS, "w:b");
        b.setAttributeNS(W_NS, "w:val", "1");
        rPr.appendChild(b);

        const bCs = doc.createElementNS(W_NS, "w:bCs");
        bCs.setAttributeNS(W_NS, "w:val", "1");
        rPr.appendChild(bCs);
      }

      if (opts.italic) {
        const italic = doc.createElementNS(W_NS, "w:i");
        italic.setAttributeNS(W_NS, "w:val", "1");
        rPr.appendChild(italic);

        const italicCs = doc.createElementNS(W_NS, "w:iCs");
        italicCs.setAttributeNS(W_NS, "w:val", "1");
        rPr.appendChild(italicCs);
      }

      run.appendChild(rPr);
    }

    const textNode = doc.createElementNS(W_NS, "w:t");
    textNode.textContent = lines[i] || "";
    try {
      textNode.setAttribute("xml:space", "preserve");
    } catch {}
    run.appendChild(textNode);
    p.appendChild(run);

    if (i < lines.length - 1) {
      const breakRun = doc.createElementNS(W_NS, "w:r");
      const lineBreak = doc.createElementNS(W_NS, "w:br");
      breakRun.appendChild(lineBreak);
      p.appendChild(breakRun);
    }
  }
}

function setParagraphTextKeepStyle(p: Node | null, text: string, doc: Document) {
  if (!p) return;

  let r = xpNode("./w:r[1]", p);
  if (!r) r = (p as Element).appendChild(doc.createElementNS(W_NS, "w:r"));

  let t = xpNode("./w:t[1]", r);
  if (!t) t = (r as Element).appendChild(doc.createElementNS(W_NS, "w:t"));

  for (const extraText of xpNodes(".//w:t[position()>1]", p)) {
    (extraText as Element).textContent = "";
  }

  (t as Element).textContent = text;
  try {
    (t as Element).setAttribute("xml:space", "preserve");
  } catch {}
}

const PREVIOUS_STEPS_TITLE =
  "Requisitos y Trabajos que deben estar completados previo a la implementación del cambio";
const BACKUP_OBJECTS_TITLE = "Respaldo de Objetos";
const INSTALLATION_STEPS_TITLE = "Pasos requeridos para la Instalación";
const REVERSION_STEPS_TITLE = "Pasos requeridos para la reversión";
const FIX_IMPLEMENTATION_TITLE =
  "Pasos requeridos para la implementación de Bugfix / Hotfix";

function normalizeKey(s: string) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function hasRealBranchValue(value: string) {
  const normalized = normalizeKey(value);
  return Boolean(normalized) && normalized !== "n/a";
}

function isDefaultNAValue(value: string) {
  return normalizeKey(value) === "n/a";
}

function hasMeaningfulHtml(html: string | undefined) {
  const normalized = (html ?? "")
    .replace(/<p><br><\/p>/gi, "")
    .replace(/<p>\s*<\/p>/gi, "")
    .replace(/&nbsp;/gi, " ")
    .trim();
  return normalized.length > 0;
}

function resetParagraphContentKeepStyle(p: Node, doc: Document) {
  const children = Array.from(p.childNodes);
  for (const child of children) {
    if (
      child.nodeType === 1 &&
      (child as Element).localName === "pPr"
    ) {
      continue;
    }
    p.removeChild(child);
  }

  if (!xpNode("./w:r[1]", p)) {
    p.appendChild(doc.createElementNS(W_NS, "w:r"));
  }
}

function createRun(
  doc: Document,
  text: string,
  formatting?: {
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    strike?: boolean;
    subscript?: boolean;
    superscript?: boolean;
    highlight?: boolean;
  },
) {
  const run = doc.createElementNS(W_NS, "w:r");
  const rPr = doc.createElementNS(W_NS, "w:rPr");

  if (formatting?.bold) rPr.appendChild(doc.createElementNS(W_NS, "w:b"));
  if (formatting?.italic) rPr.appendChild(doc.createElementNS(W_NS, "w:i"));
  if (formatting?.underline) {
    const underline = doc.createElementNS(W_NS, "w:u");
    underline.setAttributeNS(W_NS, "w:val", "single");
    rPr.appendChild(underline);
  }
  if (formatting?.strike) rPr.appendChild(doc.createElementNS(W_NS, "w:strike"));
  if (formatting?.subscript || formatting?.superscript) {
    const vertAlign = doc.createElementNS(W_NS, "w:vertAlign");
    vertAlign.setAttributeNS(
      W_NS,
      "w:val",
      formatting.subscript ? "subscript" : "superscript",
    );
    rPr.appendChild(vertAlign);
  }
  if (formatting?.highlight) {
    const highlight = doc.createElementNS(W_NS, "w:highlight");
    highlight.setAttributeNS(W_NS, "w:val", "yellow");
    rPr.appendChild(highlight);
  }

  if (rPr.childNodes.length > 0) {
    run.appendChild(rPr);
  }

  const textNode = doc.createElementNS(W_NS, "w:t");
  textNode.textContent = text;
  try {
    textNode.setAttribute("xml:space", "preserve");
  } catch {}
  run.appendChild(textNode);
  return run;
}

type RichTextSegment = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  subscript?: boolean;
  superscript?: boolean;
  highlight?: boolean;
};

type RichTextBlock = {
  textPrefix?: string;
  segments: RichTextSegment[];
};

function parseRichTextHtmlToBlocks(html: string): RichTextBlock[] {
  const safeHtml = `<root>${(html || "")
    .replace(/<hr>/gi, "<hr />")
    .replace(/<br>/gi, "<br />")}</root>`;
  const parsed = new DOMParser().parseFromString(safeHtml, "application/xml");
  const root = parsed.documentElement;

  function collectInlineSegments(
    node: Node,
    formatting: Omit<RichTextSegment, "text"> = {},
  ): RichTextSegment[] {
    if (node.nodeType === 3) {
      const text = node.nodeValue ?? "";
      return text ? [{ text, ...formatting }] : [];
    }

    if (node.nodeType !== 1) return [];

    const element = node as Element;
    const tag = element.tagName.toLowerCase();
    const nextFormatting = { ...formatting };

    if (["strong", "b"].includes(tag)) nextFormatting.bold = true;
    if (["em", "i"].includes(tag)) nextFormatting.italic = true;
    if (tag === "u") nextFormatting.underline = true;
    if (["s", "strike"].includes(tag)) nextFormatting.strike = true;
    if (tag === "sub") nextFormatting.subscript = true;
    if (tag === "sup") nextFormatting.superscript = true;
    if (tag === "mark") nextFormatting.highlight = true;

    if (tag === "br") return [{ text: "\n", ...nextFormatting }];

    const segments: RichTextSegment[] = [];
    for (const child of Array.from(element.childNodes)) {
      segments.push(...collectInlineSegments(child, nextFormatting));
    }
    return segments;
  }

  function blockFromNode(node: Node, orderedIndex = 0): RichTextBlock[] {
    if (node.nodeType !== 1) return [];

    const element = node as Element;
    const tag = element.tagName.toLowerCase();

    if (["p", "h1", "h2", "h3", "h4", "blockquote"].includes(tag)) {
      const segments = collectInlineSegments(element);
      if (["h1", "h2", "h3", "h4"].includes(tag)) {
        segments.forEach((segment) => {
          segment.bold = true;
        });
      }
      return segments.length ? [{ segments }] : [];
    }

    if (tag === "ul" || tag === "ol") {
      const items = Array.from(element.childNodes).filter(
        (child) => child.nodeType === 1 && (child as Element).tagName.toLowerCase() === "li",
      );
      return items.map((item, index) => ({
        textPrefix: tag === "ul" ? "• " : `${index + 1}. `,
        segments: collectInlineSegments(item),
      }));
    }

    if (tag === "hr") {
      return [{ segments: [{ text: "────────────────────────" }] }];
    }

    return Array.from(element.childNodes).flatMap((child) =>
      blockFromNode(child, orderedIndex),
    );
  }

  return Array.from(root.childNodes).flatMap((child, index) =>
    blockFromNode(child, index),
  );
}

function setParagraphFromRichTextBlock(
  paragraph: Node,
  block: RichTextBlock,
  doc: Document,
) {
  resetParagraphContentKeepStyle(paragraph, doc);
  const prefix = block.textPrefix ?? "";
  const segments =
    prefix.length > 0
      ? [{ text: prefix }, ...block.segments]
      : block.segments;

  const normalizedSegments =
    segments.length > 0 ? segments : [{ text: "" }];

  for (const segment of normalizedSegments) {
    const parts = segment.text.split("\n");
    parts.forEach((part, index) => {
      if (index > 0) {
        const runBreak = doc.createElementNS(W_NS, "w:r");
        runBreak.appendChild(doc.createElementNS(W_NS, "w:br"));
        paragraph.appendChild(runBreak);
      }
      if (!part.length && parts.length > 1) return;
      paragraph.appendChild(
        createRun(doc, part, {
          bold: segment.bold,
          italic: segment.italic,
          underline: segment.underline,
          strike: segment.strike,
          subscript: segment.subscript,
          superscript: segment.superscript,
          highlight: segment.highlight,
        }),
      );
    });
  }
}

function repositoryCellText(row: CommunicationMatrixRow): string {
  const raw = (row.repositoriesInput ?? "").trim();
  if (raw) return raw;
  return (row.repositories ?? []).join(", ");
}
function sameKey(a: string, b: string) {
  return normalizeKey(a) === normalizeKey(b);
}
function valOf(sections: UISection[], key: string, def = ""): string {
  for (const s of sections) {
    const f = s.fields.find((x) => sameKey(x.key, key));
    if (f) return ((f.value as any) ?? "").toString().trim();
  }
  return def;
}
function valOfAny(sections: UISection[], keys: string[], def = ""): string {
  for (const k of keys) {
    const v = valOf(sections, k);
    if (v !== "") return v;
  }
  return def;
}
function yn(v: string): "SI" | "NO" {
  const u = (v || "").toUpperCase().replace("SÍ", "SI");
  return u === "SI" ? "SI" : "NO";
}

/* ===================== localizar filas/columnas (JS) ==================== */

function findTableByRowLabel(root: Document, needle: string): Node | null {
  const tables = xpNodes("//w:tbl", root);
  for (const tbl of tables) {
    const rows = xpNodes(".//w:tr", tbl);
    for (const tr of rows) {
      const txt = getTextDeep(tr);
      if (txt.includes(needle)) return tbl;
    }
  }
  return null;
}

function findParagraphByText(root: Document, containsText: string): Node | null {
  const target = normalizeKey(containsText);
  const paragraphs = xpNodes("//w:p", root);
  for (const paragraph of paragraphs) {
    if (normalizeKey(getTextDeep(paragraph)).includes(target)) return paragraph;
  }
  return null;
}

function findParagraphByTextAfter(
  afterParagraph: Node | null,
  containsText: string,
): Node | null {
  if (!afterParagraph) return null;
  const target = normalizeKey(containsText);

  let cursor = afterParagraph.nextSibling;
  while (cursor) {
    if (
      cursor.nodeType === 1 &&
      (cursor as Element).localName === "p" &&
      normalizeKey(getTextDeep(cursor)).includes(target)
    ) {
      return cursor;
    }
    cursor = cursor.nextSibling;
  }
  return null;
}

function findRowInTableByText(table: Node, containsText: string): Node | null {
  const rows = xpNodes(".//w:tr", table);
  for (const tr of rows) {
    if (getTextDeep(tr).includes(containsText)) return tr;
  }
  return null;
}

function findColumnIndexByHeader(headerRow: Node, headerText: string): number {
  const cells = xpNodes("./w:tc", headerRow);
  for (let i = 0; i < cells.length; i++) {
    const txt = getTextDeep(cells[i]);
    if (txt.includes(headerText)) return i + 1;
  }
  return 0;
}

function findRespuestaColumnIndex(table: Node): number {
  const rows = xpNodes(".//w:tr", table);
  for (const tr of rows) {
    const txt = getTextDeep(tr);
    if (
      txt.includes("Afectación a otras áreas") &&
      txt.includes("Respuesta: SI/NO")
    ) {
      const idx = findColumnIndexByHeader(tr, "Respuesta: SI/NO");
      if (idx > 0) return idx;
    }
  }
  const anyRow = xpNode(".//w:tr[1]", table);
  const cols = anyRow ? xpNum("count(./w:tc)", anyRow) : 0;
  return cols > 0 ? cols : 0;
}

/* ================== escritores para SI/NO, Otros, País =================== */

function setYesNoByLabel(
  doc: Document,
  root: Document,
  labelContains: string,
  value: "SI" | "NO"
) {
  const table = findTableByRowLabel(root, labelContains);
  if (!table) return;

  const row = findRowInTableByText(table, labelContains);
  if (!row) return;

  const respuestaCol = findRespuestaColumnIndex(table);
  if (!respuestaCol) return;

  const cells = xpNodes("./w:tc", row);
  const targetCell = cells[respuestaCol - 1] ?? cells[cells.length - 1] ?? null;

  setCellTextKeepParagraph(targetCell, value, doc);
}

function setOtros(doc: Document, root: Document, value: string) {
  const table = findTableByRowLabel(root, "Otros");
  if (!table) return;
  const row = findRowInTableByText(table, "Otros");
  if (!row) return;

  const cells = xpNodes("./w:tc", row);
  if (cells.length >= 2) {
    setCellTextKeepParagraph(cells[1], value, doc);
  } else if (cells.length >= 1) {
    const first = cells[0];
    const current = getTextDeep(first);
    const newText = /^\s*Otros\s*:?\s*/i.test(current)
      ? current.replace(/^\s*Otros\s*:?\s*/i, `Otros: ${value}`)
      : `Otros: ${value}`;
    setCellTextKeepParagraph(first, newText, doc);
  }
}

/* -------------------- País afectado: múltiple, sin cambiar altura ------ */

type CountryCode = "REG" | "HN" | "GT" | "PA" | "NI";

function toCountryCodes(input: string | string[]): CountryCode[] {
  const raw = Array.isArray(input)
    ? input
    : String(input)
        .split(/[,\s/;|]+/)
        .filter(Boolean);

  const out = new Set<CountryCode>();
  for (const s0 of raw) {
    const s = normalizeKey(s0).toUpperCase();
    if (s.includes("honduras") || /\bHN\b/.test(s)) out.add("HN");
    else if (s.includes("nicaragua") || /\bNI\b/.test(s)) out.add("NI");
    else if (s.includes("guatemala") || /\bGT\b/.test(s)) out.add("GT");
    else if (s.includes("panama") || s.includes("panamá") || /\bPA\b/.test(s))
      out.add("PA");
    else if (s.includes("reg")) out.add("REG");
    else {
      const m = s0.match(/\(([A-Z]{2,3})\)\s*$/);
      const code = m?.[1] as CountryCode | undefined;
      if (code && ["REG", "HN", "GT", "PA", "NI"].includes(code)) out.add(code);
    }
  }
  return out.size ? Array.from(out) : ["REG"];
}

/**
 * Escribe "X" dentro de la celda SIN crear nuevos <w:p> cuando ya existe uno.
 * Esto evita que varíe la altura de la fila y respeta la centralización que trae la plantilla.
 */
function setCountryX(
  doc: Document,
  root: Document,
  uiValue: string | string[]
) {
  const codes = toCountryCodes(uiValue);

  const table = findTableByRowLabel(root, "Seleccionar país afectado");
  if (!table) return;

  // localizar cabecera con REG/HN/GT/PA/NI
  let headerRow: Node | null = null;
  const rows = xpNodes(".//w:tr", table);
  for (const tr of rows) {
    const tx = getTextDeep(tr);
    if (["REG", "HN", "GT", "PA", "NI"].every((w) => tx.includes(w))) {
      headerRow = tr;
      break;
    }
  }
  if (!headerRow) return;

  const selectRow = xpNode("./following-sibling::w:tr[1]", headerRow);
  if (!selectRow) return;

  const idx: Record<CountryCode, number> = {
    REG: findColumnIndexByHeader(headerRow, "REG"),
    HN: findColumnIndexByHeader(headerRow, "HN"),
    GT: findColumnIndexByHeader(headerRow, "GT"),
    PA: findColumnIndexByHeader(headerRow, "PA"),
    NI: findColumnIndexByHeader(headerRow, "NI"),
  };

  // Limpiar celdas (sin crear p nuevos)
  (Object.keys(idx) as CountryCode[]).forEach((k) => {
    const i = idx[k];
    if (i > 0) {
      const tc = xpNode(`./w:tc[${i}]`, selectRow);
      setCellTextKeepParagraph(tc, "", doc);
    }
  });

  // Colocar X en seleccionados (también sin crear p nuevos si ya existen)
  for (const code of codes) {
    const i = idx[code] || 0;
    if (!i) continue;
    const target = xpNode(`./w:tc[${i}]`, selectRow);
    setCellTextKeepParagraph(target, "X", doc);
  }
}

function sanitizeList(values: string[]): string[] {
  return (values ?? [])
    .map((v) => String(v ?? "").trim())
    .filter((v) => v.length > 0);
}

function setSingleCellRowText(doc: Document, row: Node, text: string) {
  const cells = xpNodes("./w:tc", row);
  if (!cells.length) return;
  setCellTextKeepParagraph(cells[0], text, doc);
  for (let i = 1; i < cells.length; i++) {
    setCellTextKeepParagraph(cells[i], "", doc);
  }
}

function adjustRowsBeforeIndex(
  table: Node,
  startIndex: number,
  beforeIndex: number,
  targetCount: number,
): Node[] {
  const tblEl = table as Element;
  let rows = xpNodes("./w:tr", table);
  let sectionRows = rows.slice(startIndex, beforeIndex);
  const sectionTemplate = sectionRows[0]?.cloneNode(true) ?? null;

  while (sectionRows.length < targetCount && sectionTemplate) {
    const areaTitleRow = xpNodes("./w:tr", table)[beforeIndex] ?? null;
    const cloned = sectionTemplate.cloneNode(true);
    if (areaTitleRow) tblEl.insertBefore(cloned, areaTitleRow);
    else tblEl.appendChild(cloned);
    rows = xpNodes("./w:tr", table);
    sectionRows = rows.slice(startIndex, startIndex + targetCount);
  }

  while (sectionRows.length > targetCount) {
    const last = sectionRows.pop();
    if (last?.parentNode === tblEl) tblEl.removeChild(last);
    rows = xpNodes("./w:tr", table);
    sectionRows = rows.slice(startIndex, startIndex + targetCount);
  }

  return sectionRows;
}

function adjustRowsAfterIndex(
  table: Node,
  startIndex: number,
  targetCount: number,
): Node[] {
  const tblEl = table as Element;
  let rows = xpNodes("./w:tr", table);
  let sectionRows = rows.slice(startIndex);
  const sectionTemplate = sectionRows[0]?.cloneNode(true) ?? null;

  while (sectionRows.length < targetCount && sectionTemplate) {
    const cloned = sectionTemplate.cloneNode(true);
    tblEl.appendChild(cloned);
    rows = xpNodes("./w:tr", table);
    sectionRows = rows.slice(startIndex);
  }

  while (sectionRows.length > targetCount) {
    const last = sectionRows.pop();
    if (last?.parentNode === tblEl) tblEl.removeChild(last);
    rows = xpNodes("./w:tr", table);
    sectionRows = rows.slice(startIndex);
  }

  return sectionRows;
}

function fillServicesAndAffectedAreas(
  doc: Document,
  root: Document,
  servicesProducts: string[],
  affectedAreas: string[],
) {
  const tables = xpNodes("//w:tbl", root);
  const servicesNeedle = normalizeKey(
    "Listar Servicios/Productos que están relacionados y que se verán impactados",
  );
  const areasNeedle = normalizeKey(
    "Listar áreas que se verán impactadas",
  );

  const cleanServices = sanitizeList(servicesProducts);
  const cleanAreas = sanitizeList(affectedAreas);
  const servicesTargetRows = Math.max(2, cleanServices.length);
  const areasTargetRows = Math.max(2, cleanAreas.length);

  for (const table of tables) {
    const rows = xpNodes("./w:tr", table);
    let servicesTitleIndex = -1;
    let areasTitleIndex = -1;

    for (let i = 0; i < rows.length; i++) {
      const rowText = normalizeKey(getTextDeep(rows[i]));
      if (servicesTitleIndex === -1 && rowText.includes(servicesNeedle)) {
        servicesTitleIndex = i;
      }
      if (areasTitleIndex === -1 && rowText.includes(areasNeedle)) {
        areasTitleIndex = i;
      }
    }

    if (servicesTitleIndex === -1 || areasTitleIndex === -1) continue;
    if (areasTitleIndex <= servicesTitleIndex) continue;

    const servicesStart = servicesTitleIndex + 1;
    const servicesRows = adjustRowsBeforeIndex(
      table,
      servicesStart,
      areasTitleIndex,
      servicesTargetRows,
    );

    const recomputedRows = xpNodes("./w:tr", table);
    const newAreasTitleIndex = recomputedRows.findIndex((row) =>
      normalizeKey(getTextDeep(row)).includes(areasNeedle),
    );
    if (newAreasTitleIndex === -1) return;

    const areasRows = adjustRowsAfterIndex(
      table,
      newAreasTitleIndex + 1,
      areasTargetRows,
    );

    for (let i = 0; i < servicesRows.length; i++) {
      setSingleCellRowText(doc, servicesRows[i], cleanServices[i] ?? "");
    }
    for (let i = 0; i < areasRows.length; i++) {
      setSingleCellRowText(doc, areasRows[i], cleanAreas[i] ?? "");
    }
    return;
  }
}

/* =================== Líneas con label en la primera fila ================ */

/**
 * Rellena un “label: valor” dentro de la MISMA celda que contiene el label.
 * Tolera asterisco inicial, NBSP y splits en varios <w:t>.
 * Busca cualquier <w:tc> cuyo texto contenga el label base (sin asterisco) y
 * sobrescribe el PRIMER <w:t> con `"{labelCanonical}{valor}"`.
 */
function setInlineValueInCellByLabel(
  doc: Document,
  labelBase: string,
  value: string
) {
  if (value == null) value = "";
  const labelCanon = labelBase.replace(/\s+/g, " ").trim() + " ";

  const cells = xpNodes("//w:tc", doc);
  for (const tc of cells) {
    const txt = getTextDeep(tc)
      .replace(/\*/g, "")
      .replace(/\u00A0/g, " ");
    if (normalizeKey(txt).includes(normalizeKey(labelBase))) {
      // Sobrescribe el primer w:t de la celda con "Label: valor"
      //const firstT = xpNode(".//w:t[1]", tc);
      const labelPrefix = txt.includes(":")
        ? txt.split(":")[0] + ": "
        : labelCanon;
      const finalText = `${labelPrefix}${value}`;
      setCellTextKeepParagraph(tc, finalText, doc);
      return;
    }
  }
}

/* ========================= Piezas detalladas writer ===================== */

function hasPiecesHeaderText(text: string) {
  const n = normalizeKey(text);
  return (
    n.includes("nombre") &&
    n.includes("tipo") &&
    (n.includes("nuevo o modificado") ||
      (n.includes("nuevo") && n.includes("modificado")))
  );
}

function mapHeaderColumnsInRow(row: Node): {
  nombre: number;
  tipo: number;
  estado: number;
} | null {
  const cells = xpNodes("./w:tc", row);
  let nombre = -1;
  let tipo = -1;
  let estado = -1;

  for (let i = 0; i < cells.length; i++) {
    const txt = normalizeKey(getTextDeep(cells[i]));
    if (txt === "nombre") nombre = i;
    else if (txt === "tipo") tipo = i;
    else if (
      txt.includes("nuevo o modificado") ||
      txt === "nuevo" ||
      txt === "modificado"
    ) {
      estado = i;
    }
  }

  return nombre >= 0 && tipo >= 0 && estado >= 0
    ? { nombre, tipo, estado }
    : null;
}

function findPiecesHeaderInfo(table: Node): {
  headerRowIndex: number;
  cols: { nombre: number; tipo: number; estado: number };
} | null {
  const rows = xpNodes("./w:tr", table);
  for (let i = 0; i < rows.length; i++) {
    const rowText = getTextDeep(rows[i]);
    if (!hasPiecesHeaderText(rowText)) continue;
    const cols = mapHeaderColumnsInRow(rows[i]);
    if (cols) return { headerRowIndex: i, cols };
  }
  return null;
}

function setRowItemByColumns(
  doc: Document,
  row: Node,
  item: { nombre: string; tipo: string; estado: string },
  cols: { nombre: number; tipo: number; estado: number }
) {
  const cells = xpNodes("./w:tc", row);
  if (!cells.length) return;
  setCellTextKeepParagraph(cells[cols.nombre] ?? null, item.nombre ?? "", doc, {
    bold: true,
  });
  setCellTextKeepParagraph(cells[cols.tipo] ?? null, item.tipo ?? "", doc, {
    bold: true,
  });
  setCellTextKeepParagraph(cells[cols.estado] ?? null, item.estado ?? "", doc, {
    bold: true,
  });
}

function setParagraphTextKeepRuns(
  p: Node | null,
  text: string,
  doc: Document,
  opts?: { bold?: boolean }
) {
  if (!p) return;
  let r = xpNode("./w:r[1]", p);
  if (!r) r = (p as Element).appendChild(doc.createElementNS(W_NS, "w:r"));
  let t = xpNode("./w:t[1]", r);
  if (!t) t = (r as Element).appendChild(doc.createElementNS(W_NS, "w:t"));

  if (opts?.bold) {
    let rPr = xpNode("./w:rPr[1]", r);
    if (!rPr) rPr = (r as Element).appendChild(doc.createElementNS(W_NS, "w:rPr"));

    let b = xpNode("./w:b[1]", rPr);
    if (!b) b = (rPr as Element).appendChild(doc.createElementNS(W_NS, "w:b"));
    (b as Element).setAttributeNS(W_NS, "w:val", "1");

    let bCs = xpNode("./w:bCs[1]", rPr);
    if (!bCs) bCs = (rPr as Element).appendChild(doc.createElementNS(W_NS, "w:bCs"));
    (bCs as Element).setAttributeNS(W_NS, "w:val", "1");
  }

  (t as Element).textContent = text;
  try {
    (t as Element).setAttribute("xml:space", "preserve");
  } catch {}
}

function ensureBlankParagraphBefore(
  container: Element,
  node: Node,
  doc: Document
) {
  const prev = node.previousSibling;
  const hasBlankBefore =
    prev &&
    prev.nodeType === 1 &&
    (prev as Element).localName === "p" &&
    !getTextDeep(prev).trim();

  if (hasBlankBefore) return;

  const blank = doc.createElementNS(W_NS, "w:p");
  container.insertBefore(blank, node);
}

type PieceBlock = { titleP: Node | null; table: Node };

function getPiecesBlocksFromCell(tc: Node): PieceBlock[] {
  const blocks: PieceBlock[] = [];
  let prevP: Node | null = null;
  let child: Node | null = tc.firstChild;

  while (child) {
    if (child.nodeType === 1) {
      const el = child as Element;
      if (el.localName === "p") {
        prevP = el;
      } else if (el.localName === "tbl") {
        blocks.push({ titleP: prevP, table: el });
        prevP = null;
      }
    }
    child = child.nextSibling;
  }

  return blocks;
}

function ensureDataRowsCount(
  table: Node,
  headerRowIndex: number,
  targetCount: number
): Node[] {
  const tblEl = table as Element;
  let rows = xpNodes("./w:tr", table);
  let dataRows = rows.slice(headerRowIndex + 1);

  if (targetCount <= 0) {
    for (const r of dataRows) tblEl.removeChild(r);
    return [];
  }

  if (!dataRows.length) {
    const headerRow = rows[headerRowIndex];
    if (!headerRow) return [];
    const cloned = headerRow.cloneNode(true);
    tblEl.appendChild(cloned);
    rows = xpNodes("./w:tr", table);
    dataRows = rows.slice(headerRowIndex + 1);
  }

  const templateRow = (dataRows[0] ?? null)?.cloneNode(true) ?? null;
  while (dataRows.length < targetCount && templateRow) {
    const cloned = templateRow.cloneNode(true);
    tblEl.appendChild(cloned);
    dataRows.push(cloned);
  }

  while (dataRows.length > targetCount) {
    const last = dataRows.pop();
    if (last?.parentNode === tblEl) tblEl.removeChild(last);
  }

  return dataRows;
}

function findCommunicationMatrixTable(root: Document): Node | null {
  const tables = xpNodes("//w:tbl", root);
  for (const table of tables) {
    const rows = xpNodes("./w:tr", table);
    const headerRow = rows[0] ?? null;
    if (!headerRow) continue;
    const headerText = normalizeKey(getTextDeep(headerRow));
    if (
      headerText.includes("pais") &&
      headerText.includes("desarrollador") &&
      headerText.includes("aplicacion") &&
      headerText.includes("jefe")
    ) {
      return table;
    }
  }
  return null;
}

function mapCommunicationMatrixColumns(headerRow: Node) {
  const cells = xpNodes("./w:tc", headerRow);
  let country = -1;
  let developerName = -1;
  let developerContact = -1;
  let application = -1;
  let bossName = -1;
  let bossContact = -1;

  for (let i = 0; i < cells.length; i += 1) {
    const text = normalizeKey(getTextDeep(cells[i]));
    if (text === "pais") country = i;
    else if (text.includes("desarrollador")) developerName = i;
    else if (text.includes("aplicacion")) application = i;
    else if (text.includes("jefe")) bossName = i;
    else if (text.includes("numero de contacto")) {
      if (developerContact === -1) developerContact = i;
      else bossContact = i;
    }
  }

  return { country, developerName, developerContact, application, bossName, bossContact };
}

function fillRepositoryNames(
  doc: Document,
  root: Document,
  repositoryNames: string[],
) {
  if (!repositoryNames.length) return;

  const placeholder = findParagraphByText(
    root,
    "[Nombre del repositorio de acuerdo a la Herramienta de Control de Versiones.]",
  );
  if (!placeholder?.parentNode) return;

  const parent = placeholder.parentNode;
  const nextSibling = placeholder.nextSibling;
  const templateParagraph = placeholder.cloneNode(true);

  setParagraphTextKeepStyle(placeholder, repositoryNames[0] ?? "", doc);

  for (let i = 1; i < repositoryNames.length; i += 1) {
    const clone = templateParagraph.cloneNode(true);
    setParagraphTextKeepStyle(clone, repositoryNames[i], doc);
    parent.insertBefore(clone, nextSibling);
  }
}

function fillCommunicationMatrix(
  doc: Document,
  root: Document,
  communicationMatrix: CommunicationMatrixRow[],
) {
  if (!communicationMatrix.length) return;

  const table = findCommunicationMatrixTable(root);
  if (!table) return;

  const rows = xpNodes("./w:tr", table);
  const headerRow = rows[0] ?? null;
  if (!headerRow) return;

  const cols = mapCommunicationMatrixColumns(headerRow);
  if (
    cols.country === -1 ||
    cols.developerName === -1 ||
    cols.developerContact === -1 ||
    cols.application === -1 ||
    cols.bossName === -1 ||
    cols.bossContact === -1
  ) {
    return;
  }

  const dataRows = ensureDataRowsCount(table, 0, communicationMatrix.length);
  for (let i = 0; i < dataRows.length; i += 1) {
    const row = communicationMatrix[i] ?? {
      country: "",
      developerName: "",
      developerContact: "",
      repositories: [],
      repositoriesInput: "",
      pickerRepositories: [],
      bossName: "",
      bossContact: "",
    };
    const cells = xpNodes("./w:tc", dataRows[i]);
    setCellTextKeepParagraph(cells[cols.country] ?? null, row.country ?? "", doc);
    setCellTextKeepParagraph(
      cells[cols.developerName] ?? null,
      row.developerName ?? "",
      doc,
    );
    setCellTextKeepParagraph(
      cells[cols.developerContact] ?? null,
      row.developerContact ?? "",
      doc,
    );
    setCellTextKeepParagraph(
      cells[cols.application] ?? null,
      repositoryCellText(row),
      doc,
    );
    setCellTextKeepParagraph(cells[cols.bossName] ?? null, row.bossName ?? "", doc);
    setCellTextKeepParagraph(
      cells[cols.bossContact] ?? null,
      row.bossContact ?? "",
      doc,
    );
  }
}

function fillPreviousStepsSection(
  doc: Document,
  root: Document,
  previousStepsHtml: string,
) {
  if (!hasMeaningfulHtml(previousStepsHtml)) return;

  const body = xpNode("/w:document/w:body", root);
  const startParagraph = findParagraphByText(root, PREVIOUS_STEPS_TITLE);
  const endParagraph = findParagraphByText(root, "Respaldo de Objetos");
  if (!body || !startParagraph || !endParagraph || !startParagraph.parentNode) return;

  let cursor = startParagraph.nextSibling;
  const removableNodes: Node[] = [];
  let templateParagraph: Node | null = null;

  while (cursor && cursor !== endParagraph) {
    const next = cursor.nextSibling;
    if (cursor.nodeType === 1) {
      const element = cursor as Element;
      if (!templateParagraph && element.localName === "p") {
        templateParagraph = cursor.cloneNode(true);
      }
      removableNodes.push(cursor);
    }
    cursor = next;
  }

  for (const node of removableNodes) {
    if (node.parentNode === body) {
      body.removeChild(node);
    }
  }

  const fallbackParagraph =
    templateParagraph?.cloneNode(true) ?? doc.createElementNS(W_NS, "w:p");

  const finalBlocks = parseRichTextHtmlToBlocks(previousStepsHtml);

  for (const block of finalBlocks) {
    const paragraph = fallbackParagraph.cloneNode(true);
    setParagraphFromRichTextBlock(paragraph, block, doc);
    body.insertBefore(paragraph, endParagraph);
  }
}

function hasBackupHeaderOneText(text: string) {
  const normalized = normalizeKey(text);
  return (
    normalized.includes("equipo encargado de respaldo") &&
    normalized.includes("base de datos/directorio") &&
    normalized.includes("aplicativo")
  );
}

function hasBackupHeaderTwoText(text: string) {
  const normalized = normalizeKey(text);
  return normalized.includes("paso") && normalized.includes("objeto a respaldar");
}

function hasBackupHeaderThreeText(text: string) {
  const normalized = normalizeKey(text);
  return (
    normalized.includes("servidor") &&
    normalized.includes("nombre, ip") &&
    normalized.includes("comentarios adicionales")
  );
}

function findBackupTableRegion(root: Document) {
  const body = xpNode("/w:document/w:body", root);
  const previousStepsParagraph = findParagraphByText(root, PREVIOUS_STEPS_TITLE);
  if (!body || !previousStepsParagraph) return null;

  const startParagraph = (() => {
    let cursor = previousStepsParagraph.nextSibling;
    while (cursor) {
      if (
        cursor.nodeType === 1 &&
        (cursor as Element).localName === "p" &&
        getTextDeep(cursor).includes(BACKUP_OBJECTS_TITLE)
      ) {
        return cursor;
      }
      cursor = cursor.nextSibling;
    }
    return null;
  })();

  if (!startParagraph) return null;

  const endParagraph = (() => {
    let cursor = startParagraph.nextSibling;
    while (cursor) {
      if (
        cursor.nodeType === 1 &&
        (cursor as Element).localName === "p" &&
        getTextDeep(cursor).includes(INSTALLATION_STEPS_TITLE)
      ) {
        return cursor;
      }
      cursor = cursor.nextSibling;
    }
    return null;
  })();

  if (!endParagraph) return null;

  return { body, startParagraph, endParagraph };
}

function findBackupTableAnchorsInRegion(startParagraph: Node, endParagraph: Node) {
  const tables: Node[] = [];
  let cursor = startParagraph.nextSibling;
  while (cursor && cursor !== endParagraph) {
    if (
      cursor.nodeType === 1 &&
      (cursor as Element).localName === "tbl" &&
      hasBackupHeaderOneText(getTextDeep(cursor))
    ) {
      tables.push(cursor);
    }
    cursor = cursor.nextSibling;
  }
  return tables;
}

function mapBackupTableRows(table: Node) {
  const rows = xpNodes("./w:tr", table);
  const headerOneIndex = rows.findIndex((row) =>
    hasBackupHeaderOneText(getTextDeep(row)),
  );
  const headerTwoIndex = rows.findIndex(
    (row, index) => index > headerOneIndex && hasBackupHeaderTwoText(getTextDeep(row)),
  );
  const headerThreeIndex = rows.findIndex(
    (row, index) => index > headerTwoIndex && hasBackupHeaderThreeText(getTextDeep(row)),
  );

  if (headerOneIndex === -1 || headerTwoIndex === -1 || headerThreeIndex === -1) {
    return null;
  }

  return {
    headerOneIndex,
    headerTwoIndex,
    headerThreeIndex,
  };
}

function mapFixBackupTableRows(table: Node) {
  const rows = xpNodes("./w:tr", table);
  const headerOneIndex = rows.findIndex((row) =>
    hasBackupHeaderOneText(getTextDeep(row)),
  );
  const headerTwoIndex = rows.findIndex(
    (row, index) => index > headerOneIndex && hasBackupHeaderTwoText(getTextDeep(row)),
  );
  const headerThreeIndex = rows.findIndex(
    (row, index) =>
      index > headerTwoIndex &&
      normalizeKey(getTextDeep(row)).includes("aplicativo a implementar") &&
      normalizeKey(getTextDeep(row)).includes("comentarios adicionales"),
  );

  if (headerOneIndex === -1 || headerTwoIndex === -1 || headerThreeIndex === -1) {
    return null;
  }

  return {
    headerOneIndex,
    headerTwoIndex,
    headerThreeIndex,
  };
}

function fillBackupTable(
  doc: Document,
  table: Node,
  group: BackupTableGroup,
) {
  const rowMap = mapBackupTableRows(table);
  if (!rowMap) return;

  const rows = xpNodes("./w:tr", table);
  const headerOneDataRow = rows[rowMap.headerOneIndex + 1] ?? null;
  const headerThreeDataRows = adjustRowsAfterIndex(table, rowMap.headerThreeIndex + 1, 1);
  const procedureRows = adjustRowsBeforeIndex(
    table,
    rowMap.headerTwoIndex + 1,
    rowMap.headerThreeIndex,
    Math.max(1, group.procedureRows.length),
  );

  if (headerOneDataRow) {
    const cells = xpNodes("./w:tc", headerOneDataRow);
    setCellTextKeepParagraph(
      cells[0] ?? null,
      group.headerOne.responsibleTeam ?? "",
      doc,
      { bold: true, align: "center", verticalAlign: "center" },
    );
    setCellTextKeepParagraph(
      cells[1] ?? null,
      group.headerOne.databaseOrDirectory ?? "",
      doc,
      { bold: true, align: "center", verticalAlign: "center" },
    );
    setCellTextKeepParagraph(
      cells[2] ?? null,
      group.headerOne.application ?? "",
      doc,
      { bold: true, align: "center", verticalAlign: "center" },
    );
  }

  for (let i = 0; i < procedureRows.length; i += 1) {
    const item = group.procedureRows[i] ?? { step: "", objectToBackup: "" };
    const cells = xpNodes("./w:tc", procedureRows[i]);
    setCellTextKeepParagraph(cells[0] ?? null, item.step ?? "", doc, {
      align: "center",
      verticalAlign: "center",
    });
    setCellTextKeepParagraph(cells[1] ?? null, item.objectToBackup ?? "", doc, {
      align: "center",
      verticalAlign: "center",
    });
    if (cells.length > 2) {
      for (let j = 2; j < cells.length; j += 1) {
        setCellTextKeepParagraph(cells[j], "", doc, {
          align: "center",
          verticalAlign: "center",
        });
      }
    }
  }

  const footerRow = headerThreeDataRows[0] ?? null;
  if (footerRow) {
    const cells = xpNodes("./w:tc", footerRow);
    setCellTextKeepParagraph(cells[0] ?? null, group.headerThree.server ?? "", doc, {
      align: "center",
      verticalAlign: "center",
    });
    setCellTextKeepParagraph(
      cells[1] ?? null,
      group.headerThree.additionalComments ?? "",
      doc,
      { align: "center", verticalAlign: "center" },
    );
    if (cells.length > 2) {
      for (let j = 2; j < cells.length; j += 1) {
        setCellTextKeepParagraph(cells[j], "", doc, {
          align: "center",
          verticalAlign: "center",
        });
      }
    }
  }
}

function fillFixBackupTable(
  doc: Document,
  table: Node,
  group: BackupTableGroup,
) {
  const rowMap = mapFixBackupTableRows(table);
  if (!rowMap) return;

  const rows = xpNodes("./w:tr", table);
  const headerOneDataRow = rows[rowMap.headerOneIndex + 1] ?? null;
  const headerThreeDataRows = adjustRowsAfterIndex(table, rowMap.headerThreeIndex + 1, 1);
  const procedureRows = adjustRowsBeforeIndex(
    table,
    rowMap.headerTwoIndex + 1,
    rowMap.headerThreeIndex,
    Math.max(1, group.procedureRows.length),
  );

  if (headerOneDataRow) {
    const cells = xpNodes("./w:tc", headerOneDataRow);
    setCellTextKeepParagraph(
      cells[0] ?? null,
      group.headerOne.responsibleTeam ?? "",
      doc,
      { bold: true, align: "center", verticalAlign: "center" },
    );
    setCellTextKeepParagraph(
      cells[1] ?? null,
      group.headerOne.databaseOrDirectory ?? "",
      doc,
      { bold: true, align: "center", verticalAlign: "center" },
    );
    setCellTextKeepParagraph(
      cells[2] ?? null,
      group.headerOne.application ?? "",
      doc,
      { bold: true, align: "center", verticalAlign: "center" },
    );
  }

  for (let i = 0; i < procedureRows.length; i += 1) {
    const item = group.procedureRows[i] ?? { step: "", objectToBackup: "" };
    const cells = xpNodes("./w:tc", procedureRows[i]);
    setCellTextKeepParagraph(cells[0] ?? null, item.step ?? "", doc, {
      align: "center",
      verticalAlign: "center",
    });
    setCellTextKeepParagraph(cells[1] ?? null, item.objectToBackup ?? "", doc, {
      align: "center",
      verticalAlign: "center",
    });
    if (cells.length > 2) {
      for (let j = 2; j < cells.length; j += 1) {
        setCellTextKeepParagraph(cells[j], "", doc, {
          align: "center",
          verticalAlign: "center",
        });
      }
    }
  }

  const footerRow = headerThreeDataRows[0] ?? null;
  if (footerRow) {
    const cells = xpNodes("./w:tc", footerRow);
    setCellTextKeepParagraph(cells[0] ?? null, group.headerThree.server ?? "", doc, {
      align: "center",
      verticalAlign: "center",
    });
    setCellTextKeepParagraph(
      cells[1] ?? null,
      group.headerThree.additionalComments ?? "",
      doc,
      { align: "center", verticalAlign: "center" },
    );
    if (cells.length > 2) {
      for (let j = 2; j < cells.length; j += 1) {
        setCellTextKeepParagraph(cells[j], "", doc, {
          align: "center",
          verticalAlign: "center",
        });
      }
    }
  }
}

function fillBackupObjectsSection(
  doc: Document,
  root: Document,
  backupTables: BackupTableGroup[],
) {
  if (!backupTables.length) return;

  const region = findBackupTableRegion(root);
  if (!region) return;

  const { body, startParagraph, endParagraph } = region;
  const existingTables = findBackupTableAnchorsInRegion(startParagraph, endParagraph);
  const templateTable = existingTables[0]?.cloneNode(true) ?? null;
  if (!templateTable) return;

  let cursor = startParagraph.nextSibling;
  const removableNodes: Node[] = [];
  while (cursor && cursor !== endParagraph) {
    const next = cursor.nextSibling;
    if (cursor.nodeType === 1) {
      removableNodes.push(cursor);
    }
    cursor = next;
  }

  for (const node of removableNodes) {
    if (node.parentNode === body) {
      body.removeChild(node);
    }
  }

  for (let i = 0; i < backupTables.length; i += 1) {
    const tableNode =
      i === 0 ? templateTable.cloneNode(true) : templateTable.cloneNode(true);
    fillBackupTable(doc, tableNode, backupTables[i]);
    body.insertBefore(tableNode, endParagraph);
    body.insertBefore(doc.createElementNS(W_NS, "w:p"), endParagraph);
  }
}

function fillBackupFixObjectsSection(
  doc: Document,
  root: Document,
  backupFixTables: BackupTableGroup[],
) {
  if (!backupFixTables.length) return;

  const region = findFixBackupTableRegion(root);
  if (!region) return;

  const { body, startParagraph, endParagraph } = region;
  const existingTables = findBackupTableAnchorsInRegion(startParagraph, endParagraph);
  const templateTable = existingTables[0]?.cloneNode(true) ?? null;
  if (!templateTable) return;

  let cursor = startParagraph.nextSibling;
  const removableNodes: Node[] = [];
  while (cursor && cursor !== endParagraph) {
    const next = cursor.nextSibling;
    if (cursor.nodeType === 1) {
      removableNodes.push(cursor);
    }
    cursor = next;
  }

  for (const node of removableNodes) {
    if (node.parentNode === body) {
      body.removeChild(node);
    }
  }

  for (const group of backupFixTables) {
    const tableNode = templateTable.cloneNode(true);
    fillFixBackupTable(doc, tableNode, group);
    body.insertBefore(tableNode, endParagraph);
    body.insertBefore(doc.createElementNS(W_NS, "w:p"), endParagraph);
  }
}

function hasInstallationHeaderOneText(text: string) {
  const normalized = normalizeKey(text);
  return (
    normalized.includes("equipo implementador") &&
    normalized.includes("rama de integracion") &&
    normalized.includes("repositorio")
  );
}

function hasInstallationHeaderTwoText(text: string) {
  const normalized = normalizeKey(text);
  return (
    normalized.includes("paso") &&
    normalized.includes("objeto a instalar") &&
    normalized.includes("ruta en versionador")
  );
}

function hasInstallationHeaderThreeText(text: string) {
  const normalized = normalizeKey(text);
  return (
    normalized.includes("base de datos/directorio") &&
    normalized.includes("servidor") &&
    normalized.includes("nombre, ip")
  );
}

function hasInstallationHeaderFourText(text: string) {
  const normalized = normalizeKey(text);
  return (
    normalized.includes("aplicativo a implementar") &&
    normalized.includes("comentarios adicionales")
  );
}

function findInstallationTableRegion(root: Document) {
  const body = xpNode("/w:document/w:body", root);
  const previousStepsParagraph = findParagraphByText(root, PREVIOUS_STEPS_TITLE);
  if (!body || !previousStepsParagraph) return null;

  const startParagraph = (() => {
    let cursor = previousStepsParagraph.nextSibling;
    while (cursor) {
      if (cursor.nodeType !== 1 || (cursor as Element).localName !== "p") {
        cursor = cursor.nextSibling;
        continue;
      }

      const text = normalizeKey(getTextDeep(cursor));

      if (text.includes(normalizeKey(FIX_IMPLEMENTATION_TITLE))) {
        return null;
      }

      if (text.includes(normalizeKey(INSTALLATION_STEPS_TITLE))) {
        return cursor;
      }

      cursor = cursor.nextSibling;
    }
    return null;
  })();

  if (!startParagraph) return null;

  const endParagraph = (() => {
    let cursor = startParagraph.nextSibling;
    while (cursor) {
      if (cursor.nodeType !== 1 || (cursor as Element).localName !== "p") {
        cursor = cursor.nextSibling;
        continue;
      }

      const text = normalizeKey(getTextDeep(cursor));

      if (text.includes(normalizeKey(FIX_IMPLEMENTATION_TITLE))) {
        return null;
      }

      if (text.includes(normalizeKey(REVERSION_STEPS_TITLE))) {
        return cursor;
      }

      cursor = cursor.nextSibling;
    }
    return null;
  })();

  if (!endParagraph) return null;

  return { body, startParagraph, endParagraph };
}

function findReversionTableRegion(root: Document) {
  const body = xpNode("/w:document/w:body", root);
  const previousStepsParagraph = findParagraphByText(root, PREVIOUS_STEPS_TITLE);
  if (!body || !previousStepsParagraph) return null;

  const startParagraph = (() => {
    let cursor = previousStepsParagraph.nextSibling;
    while (cursor) {
      if (cursor.nodeType !== 1 || (cursor as Element).localName !== "p") {
        cursor = cursor.nextSibling;
        continue;
      }

      const text = normalizeKey(getTextDeep(cursor));
      if (text.includes(normalizeKey(REVERSION_STEPS_TITLE))) {
        return cursor;
      }
      if (text.includes(normalizeKey(FIX_IMPLEMENTATION_TITLE))) {
        return null;
      }
      cursor = cursor.nextSibling;
    }
    return null;
  })();

  if (!startParagraph) return null;

  const endParagraph = (() => {
    let cursor = startParagraph.nextSibling;
    while (cursor) {
      if (cursor.nodeType !== 1 || (cursor as Element).localName !== "p") {
        cursor = cursor.nextSibling;
        continue;
      }

      const text = normalizeKey(getTextDeep(cursor));
      if (text.includes(normalizeKey(FIX_IMPLEMENTATION_TITLE))) {
        return cursor;
      }
      cursor = cursor.nextSibling;
    }
    return null;
  })();

  if (!endParagraph) return null;

  return { body, startParagraph, endParagraph };
}

function findFixBackupTableRegion(root: Document) {
  const body = xpNode("/w:document/w:body", root);
  const fixImplementationParagraph = findParagraphByText(root, FIX_IMPLEMENTATION_TITLE);
  if (!body || !fixImplementationParagraph) return null;

  const startParagraph = findParagraphByTextAfter(
    fixImplementationParagraph,
    BACKUP_OBJECTS_TITLE,
  );
  const endParagraph = findParagraphByTextAfter(
    fixImplementationParagraph,
    INSTALLATION_STEPS_TITLE,
  );

  if (!startParagraph || !endParagraph) return null;
  return { body, startParagraph, endParagraph };
}

function findFixInstallationTableRegion(root: Document) {
  const body = xpNode("/w:document/w:body", root);
  const fixImplementationParagraph = findParagraphByText(root, FIX_IMPLEMENTATION_TITLE);
  if (!body || !fixImplementationParagraph) return null;

  const startParagraph = findParagraphByTextAfter(
    fixImplementationParagraph,
    INSTALLATION_STEPS_TITLE,
  );
  const endParagraph = findParagraphByTextAfter(
    fixImplementationParagraph,
    REVERSION_STEPS_TITLE,
  );

  if (!startParagraph || !endParagraph) return null;
  return { body, startParagraph, endParagraph };
}

function findFixReversionTableRegion(root: Document) {
  const body = xpNode("/w:document/w:body", root);
  const fixImplementationParagraph = findParagraphByText(root, FIX_IMPLEMENTATION_TITLE);
  if (!body || !fixImplementationParagraph) return null;

  const startParagraph = findParagraphByTextAfter(
    fixImplementationParagraph,
    REVERSION_STEPS_TITLE,
  );
  const endParagraph =
    findParagraphByTextAfter(
      fixImplementationParagraph,
      "Para uso exclusivo del Banco Ficohsa",
    ) ?? findParagraphByTextAfter(fixImplementationParagraph, "Detallar Fecha:");

  if (!startParagraph || !endParagraph) return null;
  return { body, startParagraph, endParagraph };
}

function findInstallationTableAnchorsInRegion(
  startParagraph: Node,
  endParagraph: Node,
) {
  const tables: Node[] = [];
  let cursor = startParagraph.nextSibling;
  while (cursor && cursor !== endParagraph) {
    if (
      cursor.nodeType === 1 &&
      (cursor as Element).localName === "tbl" &&
      hasInstallationHeaderOneText(getTextDeep(cursor))
    ) {
      tables.push(cursor);
    }
    cursor = cursor.nextSibling;
  }
  return tables;
}

function mapInstallationTableRows(table: Node) {
  const rows = xpNodes("./w:tr", table);
  const headerOneIndex = rows.findIndex((row) =>
    hasInstallationHeaderOneText(getTextDeep(row)),
  );
  const headerTwoIndex = rows.findIndex(
    (row, index) =>
      index > headerOneIndex && hasInstallationHeaderTwoText(getTextDeep(row)),
  );
  const headerThreeIndex = rows.findIndex(
    (row, index) =>
      index > headerTwoIndex && hasInstallationHeaderThreeText(getTextDeep(row)),
  );
  const headerFourIndex = rows.findIndex(
    (row, index) =>
      index > headerThreeIndex && hasInstallationHeaderFourText(getTextDeep(row)),
  );

  if (
    headerOneIndex === -1 ||
    headerTwoIndex === -1 ||
    headerThreeIndex === -1 ||
    headerFourIndex === -1
  ) {
    return null;
  }

  return {
    headerOneIndex,
    headerTwoIndex,
    headerThreeIndex,
    headerFourIndex,
  };
}

function fillInstallationTable(
  doc: Document,
  table: Node,
  group: InstallationTableGroup,
) {
  const rowMap = mapInstallationTableRows(table);
  if (!rowMap) return;

  const rows = xpNodes("./w:tr", table);
  const headerOneDataRow = rows[rowMap.headerOneIndex + 1] ?? null;
  const headerThreeDataRow = adjustRowsBeforeIndex(
    table,
    rowMap.headerThreeIndex + 1,
    rowMap.headerFourIndex,
    1,
  )[0] ?? null;
  const headerFourDataRow = adjustRowsAfterIndex(
    table,
    rowMap.headerFourIndex + 1,
    1,
  )[0] ?? null;
  const procedureRows = adjustRowsBeforeIndex(
    table,
    rowMap.headerTwoIndex + 1,
    rowMap.headerThreeIndex,
    Math.max(1, group.procedureRows.length),
  );

  if (headerOneDataRow) {
    const cells = xpNodes("./w:tc", headerOneDataRow);
    setCellTextKeepParagraph(
      cells[0] ?? null,
      group.headerOne.implementingTeam ?? "",
      doc,
      { bold: true, align: "center", verticalAlign: "center" },
    );
    setCellTextKeepParagraph(
      cells[1] ?? null,
      group.headerOne.integrationBranch ?? "",
      doc,
      {
        bold: true,
        italic: hasRealBranchValue(group.headerOne.integrationBranch ?? ""),
        align: "center",
        verticalAlign: "center",
      },
    );
    setCellTextKeepParagraph(
      cells[2] ?? null,
      group.headerOne.repository ?? "",
      doc,
      {
        bold: true,
        align: "center",
        verticalAlign: "center",
      },
    );
  }

  for (let i = 0; i < procedureRows.length; i += 1) {
    const item = group.procedureRows[i] ?? {
      step: "",
      objectToInstall: "",
      versionerPath: "",
    };
    const cells = xpNodes("./w:tc", procedureRows[i]);
    setCellTextKeepParagraph(cells[0] ?? null, item.step ?? "", doc, {
      bold: isDefaultNAValue(item.step ?? ""),
      align: "center",
      verticalAlign: "center",
    });
    setCellTextKeepParagraph(cells[1] ?? null, item.objectToInstall ?? "", doc, {
      bold: isDefaultNAValue(item.objectToInstall ?? ""),
      align: "center",
      verticalAlign: "center",
    });
    setCellTextKeepParagraph(cells[2] ?? null, item.versionerPath ?? "", doc, {
      bold: isDefaultNAValue(item.versionerPath ?? ""),
      align: "center",
      verticalAlign: "center",
    });
  }

  if (headerThreeDataRow) {
    const cells = xpNodes("./w:tc", headerThreeDataRow);
    setCellTextKeepParagraph(
      cells[0] ?? null,
      group.headerThree.databaseOrDirectory ?? "",
      doc,
      {
        bold: isDefaultNAValue(group.headerThree.databaseOrDirectory ?? ""),
        align: "center",
        verticalAlign: "center",
      },
    );
    setCellTextKeepParagraph(cells[1] ?? null, group.headerThree.server ?? "", doc, {
      bold: isDefaultNAValue(group.headerThree.server ?? ""),
      align: "center",
      verticalAlign: "center",
    });
    if (cells.length > 2) {
      for (let i = 2; i < cells.length; i += 1) {
        setCellTextKeepParagraph(cells[i], "", doc, {
          align: "center",
          verticalAlign: "center",
        });
      }
    }
  }

  if (headerFourDataRow) {
    const cells = xpNodes("./w:tc", headerFourDataRow);
    setCellTextKeepParagraph(
      cells[0] ?? null,
      group.headerFour.applicationToImplement ?? "",
      doc,
      {
        bold: isDefaultNAValue(group.headerFour.applicationToImplement ?? ""),
        align: "center",
        verticalAlign: "center",
      },
    );
    setCellTextKeepParagraph(
      cells[1] ?? null,
      group.headerFour.additionalComments ?? "",
      doc,
      {
        bold: isDefaultNAValue(group.headerFour.additionalComments ?? ""),
        align: "center",
        verticalAlign: "center",
      },
    );
    if (cells.length > 2) {
      for (let i = 2; i < cells.length; i += 1) {
        setCellTextKeepParagraph(cells[i], "", doc, {
          align: "center",
          verticalAlign: "center",
        });
      }
    }
  }
}

function fillInstallationStepsSection(
  doc: Document,
  root: Document,
  installationTables: InstallationTableGroup[],
) {
  if (!installationTables.length) return;

  const region = findInstallationTableRegion(root);
  if (!region) return;

  const { body, startParagraph, endParagraph } = region;
  const existingTables = findInstallationTableAnchorsInRegion(
    startParagraph,
    endParagraph,
  );
  const templateTable = existingTables[0]?.cloneNode(true) ?? null;
  if (!templateTable) return;

  let cursor = startParagraph.nextSibling;
  const removableNodes: Node[] = [];
  while (cursor && cursor !== endParagraph) {
    const next = cursor.nextSibling;
    if (cursor.nodeType === 1) {
      removableNodes.push(cursor);
    }
    cursor = next;
  }

  for (const node of removableNodes) {
    if (node.parentNode === body) {
      body.removeChild(node);
    }
  }

  for (const group of installationTables) {
    const tableNode = templateTable.cloneNode(true);
    fillInstallationTable(doc, tableNode, group);
    body.insertBefore(tableNode, endParagraph);
    body.insertBefore(doc.createElementNS(W_NS, "w:p"), endParagraph);
  }
}

function fillReversionStepsSection(
  doc: Document,
  root: Document,
  reversionTables: InstallationTableGroup[],
) {
  if (!reversionTables.length) return;

  const region = findReversionTableRegion(root);
  if (!region) return;

  const { body, startParagraph, endParagraph } = region;
  const existingTables = findInstallationTableAnchorsInRegion(
    startParagraph,
    endParagraph,
  );
  const templateTable = existingTables[0]?.cloneNode(true) ?? null;
  if (!templateTable) return;

  let cursor = startParagraph.nextSibling;
  const removableNodes: Node[] = [];
  while (cursor && cursor !== endParagraph) {
    const next = cursor.nextSibling;
    if (cursor.nodeType === 1) {
      removableNodes.push(cursor);
    }
    cursor = next;
  }

  for (const node of removableNodes) {
    if (node.parentNode === body) {
      body.removeChild(node);
    }
  }

  for (const group of reversionTables) {
    const tableNode = templateTable.cloneNode(true);
    fillInstallationTable(doc, tableNode, group);
    body.insertBefore(tableNode, endParagraph);
    body.insertBefore(doc.createElementNS(W_NS, "w:p"), endParagraph);
  }
}

function fillFixInstallationStepsSection(
  doc: Document,
  root: Document,
  installationFixTables: InstallationTableGroup[],
) {
  if (!installationFixTables.length) return;

  const region = findFixInstallationTableRegion(root);
  if (!region) return;

  const { body, startParagraph, endParagraph } = region;
  const existingTables = findInstallationTableAnchorsInRegion(
    startParagraph,
    endParagraph,
  );
  const templateTable = existingTables[0]?.cloneNode(true) ?? null;
  if (!templateTable) return;

  let cursor = startParagraph.nextSibling;
  const removableNodes: Node[] = [];
  while (cursor && cursor !== endParagraph) {
    const next = cursor.nextSibling;
    if (cursor.nodeType === 1) {
      removableNodes.push(cursor);
    }
    cursor = next;
  }

  for (const node of removableNodes) {
    if (node.parentNode === body) {
      body.removeChild(node);
    }
  }

  for (const group of installationFixTables) {
    const tableNode = templateTable.cloneNode(true);
    fillInstallationTable(doc, tableNode, group);
    body.insertBefore(tableNode, endParagraph);
    body.insertBefore(doc.createElementNS(W_NS, "w:p"), endParagraph);
  }
}

function fillFixReversionStepsSection(
  doc: Document,
  root: Document,
  reversionFixTables: InstallationTableGroup[],
) {
  if (!reversionFixTables.length) return;

  const region = findFixReversionTableRegion(root);
  if (!region) return;

  const { body, startParagraph, endParagraph } = region;
  const existingTables = findInstallationTableAnchorsInRegion(
    startParagraph,
    endParagraph,
  );
  const templateTable = existingTables[0]?.cloneNode(true) ?? null;
  if (!templateTable) return;

  let cursor = startParagraph.nextSibling;
  const removableNodes: Node[] = [];
  while (cursor && cursor !== endParagraph) {
    const next = cursor.nextSibling;
    if (cursor.nodeType === 1) {
      removableNodes.push(cursor);
    }
    cursor = next;
  }

  for (const node of removableNodes) {
    if (node.parentNode === body) {
      body.removeChild(node);
    }
  }

  for (const group of reversionFixTables) {
    const tableNode = templateTable.cloneNode(true);
    fillInstallationTable(doc, tableNode, group);
    body.insertBefore(tableNode, endParagraph);
    body.insertBefore(doc.createElementNS(W_NS, "w:p"), endParagraph);
  }
}

function hasFixPiecesHeaderText(text: string) {
  const n = normalizeKey(text);
  return (
    n.includes("nombre") &&
    n.includes("tipo") &&
    n.includes("identificador") &&
    n.includes("fecha") &&
    n.includes("hora") &&
    (n.includes("nuevo o modificado") ||
      (n.includes("nuevo") && n.includes("modificado")))
  );
}

function mapFixHeaderColumnsInRow(row: Node): {
  nombre: number;
  tipo: number;
  identificador: number;
  fechaHoraModificacion: number;
  estado: number;
} | null {
  const cells = xpNodes("./w:tc", row);
  let nombre = -1;
  let tipo = -1;
  let identificador = -1;
  let fechaHoraModificacion = -1;
  let estado = -1;

  for (let i = 0; i < cells.length; i++) {
    const txt = normalizeKey(getTextDeep(cells[i]));
    if (txt === "nombre") nombre = i;
    else if (txt === "tipo") tipo = i;
    else if (txt.includes("identificador")) identificador = i;
    else if (txt.includes("fecha") && txt.includes("hora")) {
      fechaHoraModificacion = i;
    } else if (
      txt.includes("nuevo o modificado") ||
      txt === "nuevo" ||
      txt === "modificado"
    ) {
      estado = i;
    }
  }

  return nombre >= 0 &&
    tipo >= 0 &&
    identificador >= 0 &&
    fechaHoraModificacion >= 0 &&
    estado >= 0
    ? { nombre, tipo, identificador, fechaHoraModificacion, estado }
    : null;
}

function findFixPiecesHeaderInfo(table: Node): {
  headerRowIndex: number;
  cols: {
    nombre: number;
    tipo: number;
    identificador: number;
    fechaHoraModificacion: number;
    estado: number;
  };
} | null {
  const rows = xpNodes("./w:tr", table);
  for (let i = 0; i < rows.length; i++) {
    const rowText = getTextDeep(rows[i]);
    if (!hasFixPiecesHeaderText(rowText)) continue;
    const cols = mapFixHeaderColumnsInRow(rows[i]);
    if (cols) return { headerRowIndex: i, cols };
  }
  return null;
}

function setRowFixItemByColumns(
  doc: Document,
  row: Node,
  item: {
    nombre: string;
    tipo: string;
    identificador?: string;
    fechaHoraModificacion?: string;
    estado: string;
  },
  cols: {
    nombre: number;
    tipo: number;
    identificador: number;
    fechaHoraModificacion: number;
    estado: number;
  },
) {
  const cells = xpNodes("./w:tc", row);
  if (!cells.length) return;
  setCellTextKeepParagraph(cells[cols.nombre] ?? null, item.nombre ?? "", doc, {
    bold: true,
  });
  setCellTextKeepParagraph(cells[cols.tipo] ?? null, item.tipo ?? "", doc, {
    bold: true,
  });
  setCellTextKeepParagraph(
    cells[cols.identificador] ?? null,
    item.identificador ?? "",
    doc,
    { bold: true },
  );
  setCellTextKeepParagraph(
    cells[cols.fechaHoraModificacion] ?? null,
    item.fechaHoraModificacion ?? "",
    doc,
    { bold: true },
  );
  setCellTextKeepParagraph(cells[cols.estado] ?? null, item.estado ?? "", doc, {
    bold: true,
  });
}

type PiecesSectionMode = "standard" | "fixes";

function fillDetailedPiecesSection(
  doc: Document,
  mainTable: Node,
  sectionTitle: string,
  groups: PiezasGrupo[],
  mode: PiecesSectionMode,
) {
  if (!groups.length) return;

  const rows = xpNodes("./w:tr", mainTable);
  let sectionHeaderIndex = -1;
  const sectionTitleNorm = normalizeKey(sectionTitle);
  for (let i = 0; i < rows.length; i++) {
    const tx = normalizeKey(getTextDeep(rows[i]));
    if (tx.includes(sectionTitleNorm)) {
      sectionHeaderIndex = i;
      break;
    }
  }
  if (sectionHeaderIndex < 0) return;

  const contentRow = rows[sectionHeaderIndex + 1] ?? null;
  if (!contentRow) return;
  const contentCell = xpNode("./w:tc[1]", contentRow);
  if (!contentCell) return;

  let blocks = getPiecesBlocksFromCell(contentCell);
  if (!blocks.length) return;

  const trailingEmptyP = (() => {
    const ps = xpNodes("./w:p", contentCell);
    for (let i = ps.length - 1; i >= 0; i--) {
      if (!getTextDeep(ps[i]).trim()) return ps[i];
    }
    return null;
  })();

  const contentCellEl = contentCell as Element;

  if (groups.length > blocks.length) {
    const last = blocks[blocks.length - 1];
    for (let i = blocks.length; i < groups.length; i++) {
      const titleClone = last.titleP ? last.titleP.cloneNode(true) : null;
      const tableClone = last.table.cloneNode(true);
      if (titleClone) {
        if (trailingEmptyP) contentCellEl.insertBefore(titleClone, trailingEmptyP);
        else contentCellEl.appendChild(titleClone);
      }
      if (trailingEmptyP) contentCellEl.insertBefore(tableClone, trailingEmptyP);
      else contentCellEl.appendChild(tableClone);
      blocks.push({ titleP: titleClone, table: tableClone });
    }
  }

  if (groups.length < blocks.length) {
    for (let i = blocks.length - 1; i >= groups.length; i--) {
      const b = blocks[i];
      if (b.table.parentNode === contentCellEl) contentCellEl.removeChild(b.table);
      if (b.titleP && b.titleP.parentNode === contentCellEl) contentCellEl.removeChild(b.titleP);
    }
    blocks = blocks.slice(0, groups.length);
  }

  for (let i = 0; i < groups.length; i++) {
    const group = groups[i];
    const block = blocks[i];
    const standardHeaderInfo = mode === "standard" ? findPiecesHeaderInfo(block.table) : null;
    const fixHeaderInfo = mode === "fixes" ? findFixPiecesHeaderInfo(block.table) : null;

    if (mode === "standard" && !standardHeaderInfo) continue;
    if (mode === "fixes" && !fixHeaderInfo) continue;

    if (!block.titleP) {
      const newP = doc.createElementNS(W_NS, "w:p");
      contentCellEl.insertBefore(newP, block.table);
      block.titleP = newP;
    }

    if (block.titleP) {
      if (i > 0) {
        ensureBlankParagraphBefore(contentCellEl, block.titleP, doc);
      }
      setParagraphTextKeepRuns(
        block.titleP,
        group.grupo || `Grupo ${i + 1}`,
        doc,
        { bold: true },
      );
    }

    if (mode === "standard" && standardHeaderInfo) {
      const dataRows = ensureDataRowsCount(
        block.table,
        standardHeaderInfo.headerRowIndex,
        group.items.length,
      );
      for (let j = 0; j < dataRows.length; j++) {
        const item = group.items[j] ?? { nombre: "", tipo: "", estado: "" };
        setRowItemByColumns(doc, dataRows[j], item, standardHeaderInfo.cols);
      }
    } else if (mode === "fixes" && fixHeaderInfo) {
      const dataRows = ensureDataRowsCount(
        block.table,
        fixHeaderInfo.headerRowIndex,
        group.items.length,
      );
      for (let j = 0; j < dataRows.length; j++) {
        const item = group.items[j] ?? {
          nombre: "",
          tipo: "",
          identificador: "",
          fechaHoraModificacion: "",
          estado: "",
        };
        setRowFixItemByColumns(doc, dataRows[j], item, fixHeaderInfo.cols);
      }
    }
  }
}

async function fillDetailedPieces(
  template: Uint8Array,
  piezasDetalladas: PiezasGrupo[],
  detailedFixPieces: PiezasGrupo[] = [],
): Promise<Uint8Array> {
  if (!piezasDetalladas.length && !detailedFixPieces.length) return template;

  const zip = await JSZip.loadAsync(template);
  const xml = await zip.file("word/document.xml")?.async("string");
  if (!xml) throw new Error("No se encontró word/document.xml");

  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const mainTable = xpNodes("//w:tbl", doc).find((tbl) => {
    const tx = normalizeKey(getTextDeep(tbl));
    return (
      tx.includes("listado de piezas detalladas (nuevos / modificados)") &&
      tx.includes("listado de piezas detalladas para bugfix")
    );
  });
  if (!mainTable) return template;
  fillDetailedPiecesSection(
    doc,
    mainTable,
    "listado de piezas detalladas (nuevos / modificados)",
    piezasDetalladas,
    "standard",
  );
  fillDetailedPiecesSection(
    doc,
    mainTable,
    "listado de piezas detalladas para bugfix / hotfix / incidencia (nuevos / modificados)",
    detailedFixPieces,
    "fixes",
  );

  const outXml = new XMLSerializer().serializeToString(doc);
  zip.file("word/document.xml", outXml);
  return await zip.generateAsync({ type: "uint8array" });
}

/* ================================ Public API ============================ */

export async function fillInfoGeneral(
  template: Uint8Array,
  sections: UISection[],
  backupTables: BackupTableGroup[] = [],
  backupFixTables: BackupTableGroup[] = [],
  installationTables: InstallationTableGroup[] = [],
  reversionTables: InstallationTableGroup[] = [],
  installationFixTables: InstallationTableGroup[] = [],
  reversionFixTables: InstallationTableGroup[] = [],
  servicesProducts: string[] = [],
  affectedAreas: string[] = [],
  repositoryNames: string[] = [],
  communicationMatrix: CommunicationMatrixRow[] = [],
  previousStepsHtml = "",
): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(template);
  const xml = await zip.file("word/document.xml")?.async("string");
  if (!xml) throw new Error("No se encontró word/document.xml");

  const doc = new DOMParser().parseFromString(xml, "application/xml");

  // Cabeceras en primera fila
  const idCambio = valOfAny(sections, ["id-cambio", "id de cambio"]);
  const tipoReq = valOfAny(sections, [
    "tipo-de-requerimiento",
    "tipo de requerimiento",
    "tipo-requerimiento",
  ]);

  if (idCambio) {
    setInlineValueInCellByLabel(doc, "ID de Cambio:", idCambio);
  }
  // Tolera "*Tipo de Requerimiento:" o "Tipo de Requerimiento:"
  setInlineValueInCellByLabel(doc, "Tipo de Requerimiento:", tipoReq);

  // Bloque “Afectación a otras áreas” (todas las filas SI/NO)
  setYesNoByLabel(
    doc,
    doc,
    "Afecta DWH",
    yn(valOfAny(sections, ["afecta-dwh", "afecta dwh"])) as "SI" | "NO"
  );
  setYesNoByLabel(
    doc,
    doc,
    "Afecta Cierre",
    yn(valOfAny(sections, ["afecta-cierre", "afecta cierre"])) as "SI" | "NO"
  );
  setYesNoByLabel(
    doc,
    doc,
    "Afecta Robot",
    yn(valOfAny(sections, ["afecta-robot", "afecta robot"])) as "SI" | "NO"
  );
  setYesNoByLabel(
    doc,
    doc,
    "Notificó al NOC sobre los servicios a monitorear",
    yn(
      valOfAny(sections, [
        "notificó-al-noc-sobre-los-servicios-a-monitorear",
        "notificó al noc sobre los servicios a monitorear",
      ])
    ) as "SI" | "NO"
  );
  setYesNoByLabel(
    doc,
    doc,
    "Es Regulatorio",
    yn(valOfAny(sections, ["es-regulatorio", "es regulatorio"])) as "SI" | "NO"
  );

  // Otros
  const otros = valOfAny(sections, ["otros", "otros:"]);
  if (otros) setOtros(doc, doc, otros);

  // País afectado (múltiple)
  const paisField = sections
    .flatMap((s) => s.fields)
    .find((f) =>
      ["pais-afectado", "país-afectado"].includes(normalizeKey(f.key))
    );
  const paisValue = paisField?.value as any; // string | string[]
  setCountryX(
    doc,
    doc,
    Array.isArray(paisValue) ? paisValue : paisValue ?? "REG"
  );

  // Participa Proveedor
  setYesNoByLabel(
    doc,
    doc,
    "Participa Proveedor",
    yn(valOfAny(sections, ["participa-proveedor", "participa proveedor"])) as
      | "SI"
      | "NO"
  );

  fillServicesAndAffectedAreas(doc, doc, servicesProducts, affectedAreas);
  fillRepositoryNames(doc, doc, repositoryNames);
  fillCommunicationMatrix(doc, doc, communicationMatrix);
  fillPreviousStepsSection(doc, doc, previousStepsHtml);
  fillBackupObjectsSection(doc, doc, backupTables);
  fillBackupFixObjectsSection(doc, doc, backupFixTables);
  fillInstallationStepsSection(doc, doc, installationTables);
  fillReversionStepsSection(doc, doc, reversionTables);
  fillFixInstallationStepsSection(doc, doc, installationFixTables);
  fillFixReversionStepsSection(doc, doc, reversionFixTables);

  const outXml = new XMLSerializer().serializeToString(doc);
  zip.file("word/document.xml", outXml);
  return await zip.generateAsync({ type: "uint8array" });
}

export async function fillManual(
  template: Uint8Array,
  sections: UISection[],
  piezasDetalladas: PiezasGrupo[],
  detailedFixPieces: PiezasGrupo[] = [],
  backupTables: BackupTableGroup[] = [],
  backupFixTables: BackupTableGroup[] = [],
  installationTables: InstallationTableGroup[] = [],
  reversionTables: InstallationTableGroup[] = [],
  installationFixTables: InstallationTableGroup[] = [],
  reversionFixTables: InstallationTableGroup[] = [],
  servicesProducts: string[] = [],
  affectedAreas: string[] = [],
  repositoryNames: string[] = [],
  communicationMatrix: CommunicationMatrixRow[] = [],
  previousStepsHtml = "",
): Promise<Uint8Array> {
  const withInfo = await fillInfoGeneral(
    template,
    sections,
    backupTables,
    backupFixTables,
    installationTables,
    reversionTables,
    installationFixTables,
    reversionFixTables,
    servicesProducts,
    affectedAreas,
    repositoryNames,
    communicationMatrix,
    previousStepsHtml,
  );
  return await fillDetailedPieces(withInfo, piezasDetalladas, detailedFixPieces);
}
