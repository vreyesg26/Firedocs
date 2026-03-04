import { useMemo, useState } from "react";
import { parseDocxArrayBuffer } from "@/lib/docx-parser";
import { fillManual } from "@/lib/docx-writer";
import type {
  ManualExtract,
  UISection,
  UIField,
  PiezasGrupo,
  CommunicationMatrixRow,
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

function buildDraftSnapshot(input: {
  manualTitle: string;
  activeStep: number;
  sections: UISection[] | null;
  detailedPieces: PiezasGrupo[];
  detailedFixPieces: PiezasGrupo[];
  servicesProducts: string[];
  affectedAreas: string[];
  repositoryNames: string[];
  communicationMatrix: CommunicationMatrixRow[];
}) {
  return JSON.stringify({
    manualTitle: (input.manualTitle || "").trim(),
    activeStep: Number.isFinite(input.activeStep) ? input.activeStep : 0,
    sections: input.sections ?? [],
    detailedPieces: input.detailedPieces ?? [],
    detailedFixPieces: input.detailedFixPieces ?? [],
    servicesProducts: input.servicesProducts ?? [],
    affectedAreas: input.affectedAreas ?? [],
    repositoryNames: input.repositoryNames ?? [],
    communicationMatrix: input.communicationMatrix ?? [],
  });
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
      const indexed = input as { length?: unknown; [key: string]: unknown };
      const arr = Array.from(
        { length: Number(indexed.length ?? keys.length) },
        (_, i) => Number(indexed[String(i)] ?? 0)
      );
      return Uint8Array.from(arr);
    }
  }

  if (typeof input === "string" && /^[A-Za-z0-9+/=]+$/.test(input))
    return b64ToUint8(input);

  return null;
}

function sanitizeTextList(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return values
    .map((value) => String(value ?? "").trim())
    .filter((value) => value.length > 0);
}

function sanitizeCommunicationMatrix(values: unknown): CommunicationMatrixRow[] {
  if (!Array.isArray(values)) return [];

  return values
    .map((value) => {
      const row = (value ?? {}) as Record<string, unknown>;
      return {
        country: String(row.country ?? "").trim().toUpperCase(),
        developerName: String(row.developerName ?? "").trim(),
        developerContact: String(row.developerContact ?? "").trim(),
        repositories: sanitizeTextList(row.repositories),
        bossName: String(row.bossName ?? "").trim(),
        bossContact: String(row.bossContact ?? "").trim(),
      } satisfies CommunicationMatrixRow;
    })
    .filter(
      (row) =>
        row.developerName ||
        row.developerContact ||
        row.repositories.length > 0 ||
        row.bossName ||
        row.bossContact,
    );
}

export function useManualManager() {
  const [data, setData] = useState<ManualExtract | null>(null);
  const [sections, setSections] = useState<UISection[] | null>(null);
  const [templateBytes, setTemplateBytes] = useState<Uint8Array | null>(null);
  const [manualTitle, setManualTitle] = useState("Sin título");
  const [activeStep, setActiveStep] = useState(0);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [lastSavedDraftSnapshot, setLastSavedDraftSnapshot] = useState<
    string | null
  >(null);

  const [gitModalOpen, setGitModalOpen] = useState(false);
  const [gitLoading, setGitLoading] = useState(false);
  const [gitData, setGitData] = useState<RepoStatus[]>([]);

  const [detailedPieces, setDetailedPieces] = useState<PiezasGrupo[]>([]);
  const [detailedFixPieces, setDetailedFixPieces] = useState<PiezasGrupo[]>(
    [],
  );
  const [servicesProducts, setServicesProducts] = useState<string[]>([""]);
  const [affectedAreas, setAffectedAreas] = useState<string[]>([""]);
  const [repositoryNames, setRepositoryNames] = useState<string[]>([]);
  const [communicationMatrix, setCommunicationMatrix] = useState<
    CommunicationMatrixRow[]
  >([]);

  const currentDraftSnapshot = useMemo(
    () =>
      buildDraftSnapshot({
        manualTitle,
        activeStep,
        sections,
        detailedPieces,
        detailedFixPieces,
        servicesProducts,
        affectedAreas,
        repositoryNames,
        communicationMatrix,
      }),
    [
      manualTitle,
      activeStep,
      sections,
      detailedPieces,
      detailedFixPieces,
      servicesProducts,
      affectedAreas,
      repositoryNames,
      communicationMatrix,
    ],
  );

  const hasUnsavedChanges = draftId
    ? currentDraftSnapshot !== lastSavedDraftSnapshot
    : true;

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
    setDetailedFixPieces(parsed.detailedFixPieces ?? []);
    setServicesProducts(
      Array.isArray(parsed.servicesProducts) && parsed.servicesProducts.length > 0
        ? parsed.servicesProducts
        : [""],
    );
    setAffectedAreas(
      Array.isArray(parsed.affectedAreas) && parsed.affectedAreas.length > 0
        ? parsed.affectedAreas
        : [""],
    );
    setRepositoryNames(sanitizeTextList(parsed.repositoryNames));
    setCommunicationMatrix(
      sanitizeCommunicationMatrix(parsed.communicationMatrix),
    );
    setManualTitle("Sin título");
    setActiveStep(0);
    setDraftId(null);
    setLastSavedDraftSnapshot(null);
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

    const out = await fillManual(
      templateBytes,
      sections,
      detailedPieces,
      detailedFixPieces,
      servicesProducts,
      affectedAreas,
    );
    await window.ipc.saveDocx(out, "Manual-actualizado.docx");
  }

  async function listDrafts() {
    const list = await window.ipc.draftList();
    return list ?? [];
  }

  async function saveCurrentDraft() {
    const rawTitle = manualTitle.trim();
    const normalizedTitle = rawTitle
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

    if (!rawTitle || normalizedTitle === "sin titulo") {
      throw new Error("El título del borrador es requerido.");
    }

    const cleanedServicesProducts = sanitizeTextList(servicesProducts);
    const cleanedAffectedAreas = sanitizeTextList(affectedAreas);
    const cleanedRepositoryNames = sanitizeTextList(repositoryNames);
    const cleanedCommunicationMatrix =
      sanitizeCommunicationMatrix(communicationMatrix);

    setServicesProducts(cleanedServicesProducts);
    setAffectedAreas(cleanedAffectedAreas);
    setRepositoryNames(cleanedRepositoryNames);
    setCommunicationMatrix(cleanedCommunicationMatrix);

    const payload = {
      id: draftId ?? undefined,
      name: rawTitle,
      state: {
        manualTitle: rawTitle,
        activeStep,
        data,
        sections,
        detailedPieces,
        detailedFixPieces,
        servicesProducts: cleanedServicesProducts,
        affectedAreas: cleanedAffectedAreas,
        repositoryNames: cleanedRepositoryNames,
        communicationMatrix: cleanedCommunicationMatrix,
        templateBytesBase64: templateBytes ? uint8ToB64(templateBytes) : null,
      },
    };

    const saved = await window.ipc.draftSave(payload);
    if (saved?.id) {
      setDraftId(saved.id);
      setLastSavedDraftSnapshot(
        buildDraftSnapshot({
          manualTitle: rawTitle,
          activeStep,
          sections,
          detailedPieces,
          detailedFixPieces,
          servicesProducts: cleanedServicesProducts,
          affectedAreas: cleanedAffectedAreas,
          repositoryNames: cleanedRepositoryNames,
          communicationMatrix: cleanedCommunicationMatrix,
        }),
      );
    }
    return saved;
  }

  async function loadDraftById(id: string) {
    const draft = await window.ipc.draftRead(id);
    if (!draft?.state) return false;

    const state = draft.state as {
      manualTitle?: string;
      activeStep?: number;
      data?: unknown;
      sections?: unknown;
      detailedPieces?: unknown;
      detailedFixPieces?: unknown;
      servicesProducts?: unknown;
      affectedAreas?: unknown;
      repositoryNames?: unknown;
      communicationMatrix?: unknown;
      templateBytesBase64?: string | null;
    };
    setData((state.data as ManualExtract | null) ?? null);
    setSections((state.sections as UISection[] | null) ?? null);
    setDetailedPieces((state.detailedPieces as PiezasGrupo[]) ?? []);
    setDetailedFixPieces((state.detailedFixPieces as PiezasGrupo[]) ?? []);
    const loadedServicesProducts = sanitizeTextList(state.servicesProducts);
    const loadedAffectedAreas = sanitizeTextList(state.affectedAreas);
    const loadedRepositoryNames = sanitizeTextList(state.repositoryNames);
    const loadedCommunicationMatrix = sanitizeCommunicationMatrix(
      state.communicationMatrix,
    );
    setServicesProducts(loadedServicesProducts);
    setAffectedAreas(loadedAffectedAreas);
    setRepositoryNames(loadedRepositoryNames);
    setCommunicationMatrix(loadedCommunicationMatrix);
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
    setLastSavedDraftSnapshot(
      buildDraftSnapshot({
        manualTitle: (state.manualTitle || "Sin título").trim() || "Sin título",
        activeStep: Number.isFinite(state.activeStep)
          ? Math.max(0, Number(state.activeStep))
          : 0,
        sections: (state.sections as UISection[] | null) ?? null,
        detailedPieces: (state.detailedPieces as PiezasGrupo[]) ?? [],
        detailedFixPieces: (state.detailedFixPieces as PiezasGrupo[]) ?? [],
        servicesProducts: loadedServicesProducts,
        affectedAreas: loadedAffectedAreas,
        repositoryNames: loadedRepositoryNames,
        communicationMatrix: loadedCommunicationMatrix,
      }),
    );
    return true;
  }

  async function deleteDraftById(id: string) {
    const ok = await window.ipc.draftDelete(id);
    if (ok && draftId === id) {
      setDraftId(null);
      setLastSavedDraftSnapshot(null);
    }
    return ok;
  }

  return {
    data,
    sections,
    detailedPieces,
    detailedFixPieces,
    servicesProducts,
    affectedAreas,
    repositoryNames,
    communicationMatrix,
    templateBytes,
    manualTitle,
    activeStep,
    draftId,
    hasUnsavedChanges,
    gitModalOpen,
    gitLoading,
    gitData,

    setSections,
    setDetailedPieces,
    setDetailedFixPieces,
    setServicesProducts,
    setAffectedAreas,
    setRepositoryNames,
    setCommunicationMatrix,
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
