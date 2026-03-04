import { useState } from "react";
import { parseDocxArrayBuffer } from "@/lib/docx-parser";
import { fillManual } from "@/lib/docx-writer";
import type {
  ManualExtract,
  UISection,
  UIField,
  PiezasGrupo,
} from "@/types/manual";
import type { RepoStatus } from "@/types/git";
import { countryOptions } from "@/lib/constants";

function b64ToUint8(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function uint8ToB64(bytes: Uint8Array) {
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += String.fromCharCode(bytes[i]);
  return btoa(out);
}

function titleFromFilePath(filePath: string) {
  const name = filePath.split(/[\\/]/).pop() || filePath;
  return name.replace(/\.[^.]+$/, "").trim() || "Sin título";
}

function anyToUint8(input: unknown): Uint8Array | null {
  if (!input) return null;
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (ArrayBuffer.isView(input))
    return new Uint8Array((input as ArrayBufferView).buffer);

  const obj = input as
    | { type?: string; data?: unknown; length?: unknown; [key: string]: unknown }
    | undefined;

  if (obj?.type === "Buffer" && Array.isArray(obj.data))
    return Uint8Array.from(obj.data as number[]);

  if (typeof input === "object") {
    const keys = Object.keys(input);
    const looksIndexed =
      keys.length > 0 && keys.every((k) => /^\d+$/.test(k) || k === "length");
    if (looksIndexed) {
      const arr = Array.from(
        { length: Number(input.length ?? keys.length) },
        (_, i) => Number(input[i] ?? 0)
      );
      return Uint8Array.from(arr);
    }
  }

  if (typeof input === "string" && /^[A-Za-z0-9+/=]+$/.test(input))
    return b64ToUint8(input);

  return null;
}

export function useManualManager() {
  const [data, setData] = useState<ManualExtract | null>(null);
  const [sections, setSections] = useState<UISection[] | null>(null);
  const [templateBytes, setTemplateBytes] = useState<Uint8Array | null>(null);
  const [manualTitle, setManualTitle] = useState("Sin título");
  const [activeStep, setActiveStep] = useState(0);
  const [draftId, setDraftId] = useState<string | null>(null);

  const [gitModalOpen, setGitModalOpen] = useState(false);
  const [gitLoading, setGitLoading] = useState(false);
  const [gitData, setGitData] = useState<RepoStatus[]>([]);

  const [detailedPieces, setDetailedPieces] = useState<PiezasGrupo[]>([]);

  async function loadFromTemplateBytes(bytes: Uint8Array) {
    const parsed = await parseDocxArrayBuffer(bytes);

    const normKey = (s: string) =>
      (s || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ")
        .trim();

    const toCountryCodes = (v: string | string[]) => {
      const raw = Array.isArray(v)
        ? v
        : String(v ?? "")
            .split(/[,\s/;|]+/)
            .filter(Boolean);

      const out = new Set<string>();
      for (const s0 of raw) {
        const s = normKey(s0).toUpperCase();
        if (s.includes("HONDURAS") || /\bHN\b/.test(s)) out.add("HN");
        else if (s.includes("NICARAGUA") || /\bNI\b/.test(s)) out.add("NI");
        else if (s.includes("GUATEMALA") || /\bGT\b/.test(s)) out.add("GT");
        else if (s.includes("PANAMA") || /\bPA\b/.test(s)) out.add("PA");
        else if (s.includes("REG")) out.add("REG");
      }
      return Array.from(out.size ? out : ["REG"]);
    };

    const asYesNo = (v: unknown) => {
      const u = String(v ?? "")
        .toUpperCase()
        .replace("SÍ", "SI");
      return u === "SI" ? "SI" : "NO";
    };

    const dedup: UISection[] = Array.from(
      (parsed.seccionesReconocidas || [])
        .reduce((m, s) => {
          m.set(s.id, s);
          return m;
        }, new Map<string, UISection>())
        .values()
    );

    const norm: UISection[] = dedup.map((sec) => {
      if (sec.id !== "informacion-general") return sec;

      const fields: UIField[] = sec.fields.map((f0) => {
        const key = normKey(f0.key);

        if (key.includes("pais-afectado"))
          return {
            key: f0.key,
            label: f0.label,
            kind: "multiselect",
            options: [...countryOptions],
            value: toCountryCodes(f0.value),
          };

        if (key === "otros" || key === "otros:") {
          const txt = typeof f0.value === "string" ? f0.value : "";
          let clean = txt.replace(/^\s*otros\s*:?\s*/i, "");
          if (/^\s*[:]*\s*$/.test(clean)) clean = "";
          return {
            key: f0.key,
            label: f0.label,
            kind: "text",
            value: clean,
          };
        }

        const isYesNo =
          key.includes("afecta dwh") ||
          key.includes("afecta cierre") ||
          key.includes("afecta robot") ||
          key.includes("notifico al noc") ||
          key.includes("es regulatorio") ||
          key.includes("participa proveedor");

        if (isYesNo)
          return {
            key: f0.key,
            label: f0.label,
            kind: "select",
            options: [
              { value: "SI", label: "SI" },
              { value: "NO", label: "NO" },
            ],
            value: asYesNo(f0.value),
          };

        return {
          key: f0.key,
          label: f0.label,
          kind: f0.kind ?? "text",
          options: f0.options,
          value: f0.value,
        };
      });

      return { ...sec, fields };
    });

    setTemplateBytes(bytes);
    setData(parsed);
    setSections(norm);
    setDetailedPieces(parsed.piezasDetalladas ?? []);
    setManualTitle("Sin título");
    setActiveStep(0);
    setDraftId(null);
    return true;
  }

  async function handleOpen() {
    try {
      const res = await window.ipc.selectDocx();
      if (!res) return;
      const rawRes = res as Record<string, unknown>;

      const bytes =
        anyToUint8(rawRes.bytes) ??
        anyToUint8(rawRes.buffer) ??
        anyToUint8(rawRes.base64);

      if (!bytes) throw new Error("No se recibió un buffer válido del IPC");
      await loadFromTemplateBytes(bytes);
      if (typeof rawRes.filePath === "string" && rawRes.filePath.trim()) {
        setManualTitle(titleFromFilePath(rawRes.filePath));
      }

      return true;
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : String(e));
      return false;
    }
  }

  async function handleExport() {
    if (!templateBytes) throw new Error("Primero carga un DOCX.");
    if (!sections || sections.length === 0)
      throw new Error("No hay datos de Información general para exportar.");

    const out = await fillManual(templateBytes, sections, detailedPieces);
    await window.ipc.saveDocx(out, "Manual-actualizado.docx");
  }

  async function listDrafts() {
    const list = await window.ipc.draftList();
    return list ?? [];
  }

  async function saveCurrentDraft() {
    const payload = {
      id: draftId ?? undefined,
      name: manualTitle.trim() || "Sin título",
      state: {
        manualTitle: manualTitle.trim() || "Sin título",
        activeStep,
        data,
        sections,
        detailedPieces,
        templateBytesBase64: templateBytes ? uint8ToB64(templateBytes) : null,
      },
    };

    const saved = await window.ipc.draftSave(payload);
    if (saved?.id) {
      setDraftId(saved.id);
    }
    return saved;
  }

  async function loadDraftById(id: string) {
    const draft = await window.ipc.draftRead(id);
    if (!draft?.state) return false;

    const state = draft.state;
    setData((state.data as ManualExtract | null) ?? null);
    setSections((state.sections as UISection[] | null) ?? null);
    setDetailedPieces((state.detailedPieces as PiezasGrupo[]) ?? []);
    setTemplateBytes(
      state.templateBytesBase64 ? b64ToUint8(state.templateBytesBase64) : null,
    );
    setManualTitle((state.manualTitle || "Sin título").trim() || "Sin título");
    setActiveStep(
      Number.isFinite(state.activeStep)
        ? Math.max(0, Number(state.activeStep))
        : 0,
    );
    setDraftId(draft.id);
    return true;
  }

  async function deleteDraftById(id: string) {
    const ok = await window.ipc.draftDelete(id);
    if (ok && draftId === id) {
      setDraftId(null);
    }
    return ok;
  }

  return {
    data,
    sections,
    detailedPieces,
    templateBytes,
    manualTitle,
    activeStep,
    draftId,
    gitModalOpen,
    gitLoading,
    gitData,

    setSections,
    setDetailedPieces,
    setManualTitle,
    setActiveStep,
    setGitData,
    setGitModalOpen,
    setGitLoading,

    handleOpen,
    loadFromTemplateBytes,
    handleExport,
    listDrafts,
    saveCurrentDraft,
    loadDraftById,
    deleteDraftById,
  };
}
