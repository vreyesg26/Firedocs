import { useMemo, useState } from "react";
import { parseDocxArrayBuffer } from "@/lib/docx-parser";
import { fillManual } from "@/lib/docx-writer";
import type {
  ManualExtract,
  UISection,
  UIField,
  PiezasGrupo,
  CommunicationMatrixRow,
  BackupTableGroup,
  InstallationTableGroup,
} from "@/types/manual";
import type { RepoStatus } from "@/types/git";
import { countryOptions, getDefaultVisibleStepKeys } from "@/lib/constants";

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
  backupTables: BackupTableGroup[];
  backupFixTables: BackupTableGroup[];
  installationTables: InstallationTableGroup[];
  reversionTables: InstallationTableGroup[];
  installationFixTables: InstallationTableGroup[];
  reversionFixTables: InstallationTableGroup[];
  visibleStepKeys: string[];
  servicesProducts: string[];
  affectedAreas: string[];
  repositoryNames: string[];
  communicationMatrix: CommunicationMatrixRow[];
  previousStepsHtml: string;
}) {
  return JSON.stringify({
    manualTitle: (input.manualTitle || "").trim(),
    activeStep: Number.isFinite(input.activeStep) ? input.activeStep : 0,
    sections: input.sections ?? [],
    detailedPieces: input.detailedPieces ?? [],
    detailedFixPieces: input.detailedFixPieces ?? [],
    backupTables: input.backupTables ?? [],
    backupFixTables: input.backupFixTables ?? [],
    installationTables: input.installationTables ?? [],
    reversionTables: input.reversionTables ?? [],
    installationFixTables: input.installationFixTables ?? [],
    reversionFixTables: input.reversionFixTables ?? [],
    visibleStepKeys: input.visibleStepKeys ?? getDefaultVisibleStepKeys(),
    servicesProducts: input.servicesProducts ?? [],
    affectedAreas: input.affectedAreas ?? [],
    repositoryNames: input.repositoryNames ?? [],
    communicationMatrix: input.communicationMatrix ?? [],
    previousStepsHtml: input.previousStepsHtml ?? "",
  });
}

function buildDraftContentSnapshot(input: Omit<Parameters<typeof buildDraftSnapshot>[0], "activeStep">) {
  return JSON.stringify({
    manualTitle: (input.manualTitle || "").trim(),
    sections: input.sections ?? [],
    detailedPieces: input.detailedPieces ?? [],
    detailedFixPieces: input.detailedFixPieces ?? [],
    backupTables: input.backupTables ?? [],
    backupFixTables: input.backupFixTables ?? [],
    installationTables: input.installationTables ?? [],
    reversionTables: input.reversionTables ?? [],
    installationFixTables: input.installationFixTables ?? [],
    reversionFixTables: input.reversionFixTables ?? [],
    visibleStepKeys: input.visibleStepKeys ?? getDefaultVisibleStepKeys(),
    servicesProducts: input.servicesProducts ?? [],
    affectedAreas: input.affectedAreas ?? [],
    repositoryNames: input.repositoryNames ?? [],
    communicationMatrix: input.communicationMatrix ?? [],
    previousStepsHtml: input.previousStepsHtml ?? "",
  });
}

function titleFromFilePath(filePath: string) {
  const name = filePath.split(/[\\/]/).pop() || filePath;
  return name.replace(/\.[^.]+$/, "").trim() || "Sin título";
}

function toSafeDocxFileName(title: string) {
  const trimmed = (title || "").trim();
  const baseName =
    trimmed
      .replace(/[<>:"/\\|?*\u0000-\u001F]/g, " ")
      .replace(/\s+/g, " ")
      .trim() || "Manual-actualizado";

  return baseName.toLowerCase().endsWith(".docx")
    ? baseName
    : `${baseName}.docx`;
}

function bytesFromUnknown(input: unknown): Uint8Array | null {
  if (!input) return null;
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (ArrayBuffer.isView(input)) {
    const view = input as ArrayBufferView;
    return new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  }

  if (typeof input === "object") {
    const obj = input as Record<string, unknown>;
    if (obj.type === "Buffer" && Array.isArray(obj.data)) {
      return Uint8Array.from(obj.data as number[]);
    }
  }

  return null;
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
        repositoriesInput: String(
          row.repositoriesInput ?? sanitizeTextList(row.repositories).join(", "),
        ),
        pickerRepositories: sanitizeTextList(row.pickerRepositories),
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

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function uniqueByJson<T>(values: T[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = JSON.stringify(value);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function mergeManualSections(sectionsList: UISection[][]) {
  const bySection = new Map<string, UISection>();

  for (const sections of sectionsList) {
    for (const section of sections) {
      const current = bySection.get(section.id);
      if (!current) {
        bySection.set(section.id, {
          ...section,
          fields: section.fields.map((field) => ({ ...field })),
        });
        continue;
      }

      const fieldMap = new Map(current.fields.map((field) => [field.key, field]));
      for (const field of section.fields) {
        const existing = fieldMap.get(field.key);
        if (!existing) {
          current.fields.push({ ...field });
          fieldMap.set(field.key, current.fields[current.fields.length - 1]);
          continue;
        }

        if (Array.isArray(existing.value) || Array.isArray(field.value)) {
          const merged = Array.from(
            new Set([
              ...(Array.isArray(existing.value) ? existing.value : [existing.value]),
              ...(Array.isArray(field.value) ? field.value : [field.value]),
            ].map((value) => normalizeText(value)).filter(Boolean)),
          );
          existing.value = merged;
          continue;
        }

        if (!normalizeText(existing.value) && normalizeText(field.value)) {
          existing.value = field.value;
        }
      }
    }
  }

  return Array.from(bySection.values());
}

function mergePreviousStepsHtml(values: string[]) {
  const uniqueBlocks = Array.from(
    new Set(values.map((value) => value.trim()).filter(Boolean)),
  );
  return uniqueBlocks.join("");
}

function buildInformationGeneralSignature(sections: UISection[] | undefined) {
  const section = (sections ?? []).find(
    (item) => item.id === "informacion-general",
  );
  if (!section) return "";

  const normalizedFields = section.fields.map((field) => {
    const normalizedValue = Array.isArray(field.value)
      ? [...field.value].map((value) => normalizeText(value)).sort()
      : normalizeText(field.value);

    return {
      key: field.key,
      value: normalizedValue,
    };
  });

  return JSON.stringify(
    normalizedFields.sort((a, b) => a.key.localeCompare(b.key)),
  );
}

export function useManualManager() {
  const [data, setData] = useState<ManualExtract | null>(null);
  const [sections, setSections] = useState<UISection[] | null>(null);
  const [templateBytes, setTemplateBytes] = useState<Uint8Array | null>(null);
  const [manualTitle, setManualTitle] = useState("Sin título");
  const [activeStep, setActiveStep] = useState(0);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [lastSavedDraftContentSnapshot, setLastSavedDraftContentSnapshot] = useState<
    string | null
  >(null);

  const [gitModalOpen, setGitModalOpen] = useState(false);
  const [gitLoading, setGitLoading] = useState(false);
  const [gitData, setGitData] = useState<RepoStatus[]>([]);

  const [detailedPieces, setDetailedPieces] = useState<PiezasGrupo[]>([]);
  const [detailedFixPieces, setDetailedFixPieces] = useState<PiezasGrupo[]>(
    [],
  );
  const [backupTables, setBackupTables] = useState<BackupTableGroup[]>([]);
  const [backupFixTables, setBackupFixTables] = useState<BackupTableGroup[]>([]);
  const [installationTables, setInstallationTables] = useState<
    InstallationTableGroup[]
  >([]);
  const [reversionTables, setReversionTables] = useState<
    InstallationTableGroup[]
  >([]);
  const [installationFixTables, setInstallationFixTables] = useState<
    InstallationTableGroup[]
  >([]);
  const [reversionFixTables, setReversionFixTables] = useState<
    InstallationTableGroup[]
  >([]);
  const [visibleStepKeys, setVisibleStepKeys] = useState<string[]>(
    getDefaultVisibleStepKeys(),
  );
  const [servicesProducts, setServicesProducts] = useState<string[]>([""]);
  const [affectedAreas, setAffectedAreas] = useState<string[]>([""]);
  const [repositoryNames, setRepositoryNames] = useState<string[]>([]);
  const [communicationMatrix, setCommunicationMatrix] = useState<
    CommunicationMatrixRow[]
  >([]);
  const [previousStepsHtml, setPreviousStepsHtml] = useState("");

  const currentDraftContentSnapshot = useMemo(
    () =>
      buildDraftContentSnapshot({
        manualTitle,
        sections,
        detailedPieces,
        detailedFixPieces,
        backupTables,
        backupFixTables,
        installationTables,
        reversionTables,
        installationFixTables,
        reversionFixTables,
        visibleStepKeys,
        servicesProducts,
        affectedAreas,
        repositoryNames,
        communicationMatrix,
        previousStepsHtml,
      }),
    [
      manualTitle,
      sections,
      detailedPieces,
      detailedFixPieces,
      backupTables,
      backupFixTables,
      installationTables,
      reversionTables,
      installationFixTables,
      reversionFixTables,
      visibleStepKeys,
      servicesProducts,
      affectedAreas,
      repositoryNames,
      communicationMatrix,
      previousStepsHtml,
    ],
  );

  const hasUnsavedChanges = draftId
    ? currentDraftContentSnapshot !== lastSavedDraftContentSnapshot
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
    setBackupTables(parsed.backupTables ?? []);
    setBackupFixTables(parsed.backupFixTables ?? []);
    setInstallationTables(parsed.installationTables ?? []);
    setReversionTables(parsed.reversionTables ?? []);
    setInstallationFixTables(parsed.installationFixTables ?? []);
    setReversionFixTables(parsed.reversionFixTables ?? []);
    setVisibleStepKeys(getDefaultVisibleStepKeys());
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
    setPreviousStepsHtml(parsed.previousStepsHtml ?? "");
    setManualTitle("Sin título");
    setActiveStep(0);
    setDraftId(null);
    setLastSavedDraftContentSnapshot(null);
    return true;
  }

  async function handleOpenUnion() {
    try {
      const selected = await window.ipc.selectMultipleDocx();
      if (!selected?.length) return false;
      if (selected.length < 2) {
        alert(
          "Se deben cargar minimo 2 manuales para poder utilizar esta caracteristica del sistema.",
        );
        return false;
      }

      const parsedList = await Promise.all(
        selected.map(async (item: { filePath: string; bytes: Uint8Array }) => ({
          bytes: item.bytes,
          parsed: await parseDocxArrayBuffer(item.bytes),
        })),
      );

      const infoGeneralSignatures = parsedList.map(({ parsed }) =>
        buildInformationGeneralSignature(parsed.seccionesReconocidas),
      );
      const baseSignature = infoGeneralSignatures[0] ?? "";
      const hasDifferentInformationGeneral = infoGeneralSignatures.some(
        (signature) => signature !== baseSignature,
      );

      if (hasDifferentInformationGeneral) {
        alert(
          "Los manuales deben ser de la misma iniciativa o proyecto y tener la misma informacion general.",
        );
        return false;
      }

      const mergedSections = mergeManualSections(
        parsedList.map(({ parsed }) => parsed.seccionesReconocidas ?? []),
      );
      const mergedData: ManualExtract = {
        camposDetectados: uniqueByJson(
          parsedList.flatMap(({ parsed }) => parsed.camposDetectados ?? []),
        ),
        piezasDetalladas: uniqueByJson(
          parsedList.flatMap(({ parsed }) => parsed.piezasDetalladas ?? []),
        ),
        detailedFixPieces: uniqueByJson(
          parsedList.flatMap(({ parsed }) => parsed.detailedFixPieces ?? []),
        ),
        backupTables: parsedList.flatMap(({ parsed }) => parsed.backupTables ?? []),
        backupFixTables: parsedList.flatMap(
          ({ parsed }) => parsed.backupFixTables ?? [],
        ),
        installationTables: parsedList.flatMap(
          ({ parsed }) => parsed.installationTables ?? [],
        ),
        reversionTables: parsedList.flatMap(
          ({ parsed }) => parsed.reversionTables ?? [],
        ),
        installationFixTables: parsedList.flatMap(
          ({ parsed }) => parsed.installationFixTables ?? [],
        ),
        reversionFixTables: parsedList.flatMap(
          ({ parsed }) => parsed.reversionFixTables ?? [],
        ),
        servicesProducts: Array.from(
          new Set(
            parsedList.flatMap(({ parsed }) => parsed.servicesProducts ?? []),
          ),
        ),
        affectedAreas: Array.from(
          new Set(parsedList.flatMap(({ parsed }) => parsed.affectedAreas ?? [])),
        ),
        repositoryNames: Array.from(
          new Set(parsedList.flatMap(({ parsed }) => parsed.repositoryNames ?? [])),
        ),
        communicationMatrix: uniqueByJson(
          parsedList.flatMap(({ parsed }) => parsed.communicationMatrix ?? []),
        ),
        previousStepsHtml: mergePreviousStepsHtml(
          parsedList.map(({ parsed }) => parsed.previousStepsHtml ?? ""),
        ),
        seccionesReconocidas: mergedSections,
        raw: {
          paragraphs: parsedList.flatMap(({ parsed }) => parsed.raw?.paragraphs ?? []),
          tables: parsedList.flatMap(({ parsed }) => parsed.raw?.tables ?? []),
        },
      };

      setTemplateBytes(parsedList[0]?.bytes ?? null);
      setData(mergedData);
      setSections(mergedSections);
      setDetailedPieces(mergedData.piezasDetalladas ?? []);
      setDetailedFixPieces(mergedData.detailedFixPieces ?? []);
      setBackupTables(mergedData.backupTables ?? []);
      setBackupFixTables(mergedData.backupFixTables ?? []);
      setInstallationTables(mergedData.installationTables ?? []);
      setReversionTables(mergedData.reversionTables ?? []);
      setInstallationFixTables(mergedData.installationFixTables ?? []);
      setReversionFixTables(mergedData.reversionFixTables ?? []);
      setServicesProducts(
        mergedData.servicesProducts?.length ? mergedData.servicesProducts : [""],
      );
      setAffectedAreas(
        mergedData.affectedAreas?.length ? mergedData.affectedAreas : [""],
      );
      setRepositoryNames(mergedData.repositoryNames ?? []);
      setCommunicationMatrix(
        sanitizeCommunicationMatrix(mergedData.communicationMatrix),
      );
      setPreviousStepsHtml(mergedData.previousStepsHtml ?? "");
      setManualTitle("Sin título");
      setActiveStep(0);
      setDraftId(null);
      setLastSavedDraftContentSnapshot(null);
      return true;
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : String(e));
      return false;
    }
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
    await window.ipc.saveDocx(out, toSafeDocxFileName(manualTitle));
  }

  async function buildCurrentManualDocx() {
    if (!templateBytes) throw new Error("Primero carga un DOCX.");
    if (!sections || sections.length === 0) {
      throw new Error("No hay datos de Información general para exportar.");
    }

    return fillManual(
      templateBytes,
      sections,
      detailedPieces,
      detailedFixPieces,
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
  }

  async function previewCurrentManualPdf() {
    const docxBytes = await buildCurrentManualDocx();
    const preview = await window.ipc.previewDocxPdf(
      docxBytes,
      toSafeDocxFileName(manualTitle),
    );

    if (!preview) {
      throw new Error("No fue posible generar la vista previa.");
    }
    if ("error" in preview) {
      throw new Error(preview.error);
    }

    const bytes = bytesFromUnknown(preview.bytes);
    if (!bytes) {
      throw new Error("No fue posible leer el PDF de vista previa.");
    }

    return {
      bytes,
      mimeType: preview.mimeType,
      fileName: preview.fileName,
    };
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
        backupTables,
        backupFixTables,
        installationTables,
        reversionTables,
        installationFixTables,
        reversionFixTables,
        visibleStepKeys,
        servicesProducts: cleanedServicesProducts,
        affectedAreas: cleanedAffectedAreas,
        repositoryNames: cleanedRepositoryNames,
        communicationMatrix: cleanedCommunicationMatrix,
        previousStepsHtml,
        templateBytesBase64: templateBytes ? uint8ToB64(templateBytes) : null,
      },
    };

    const saved = await window.ipc.draftSave(payload);
    if (saved?.id) {
      setDraftId(saved.id);
      setLastSavedDraftContentSnapshot(
        buildDraftContentSnapshot({
          manualTitle: rawTitle,
          sections,
          detailedPieces,
          detailedFixPieces,
          backupTables,
          backupFixTables,
          installationTables,
          reversionTables,
          installationFixTables,
          reversionFixTables,
          visibleStepKeys,
          servicesProducts: cleanedServicesProducts,
          affectedAreas: cleanedAffectedAreas,
          repositoryNames: cleanedRepositoryNames,
          communicationMatrix: cleanedCommunicationMatrix,
          previousStepsHtml,
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
      backupTables?: unknown;
      backupFixTables?: unknown;
      installationTables?: unknown;
      reversionTables?: unknown;
      installationFixTables?: unknown;
      reversionFixTables?: unknown;
      visibleStepKeys?: unknown;
      servicesProducts?: unknown;
      affectedAreas?: unknown;
      repositoryNames?: unknown;
      communicationMatrix?: unknown;
      previousStepsHtml?: unknown;
      templateBytesBase64?: string | null;
    };
    setData((state.data as ManualExtract | null) ?? null);
    setSections((state.sections as UISection[] | null) ?? null);
    setDetailedPieces((state.detailedPieces as PiezasGrupo[]) ?? []);
    setDetailedFixPieces((state.detailedFixPieces as PiezasGrupo[]) ?? []);
    setBackupTables((state.backupTables as BackupTableGroup[]) ?? []);
    setBackupFixTables((state.backupFixTables as BackupTableGroup[]) ?? []);
    setInstallationTables(
      (state.installationTables as InstallationTableGroup[]) ?? [],
    );
    setReversionTables((state.reversionTables as InstallationTableGroup[]) ?? []);
    setInstallationFixTables(
      (state.installationFixTables as InstallationTableGroup[]) ?? [],
    );
    setReversionFixTables(
      (state.reversionFixTables as InstallationTableGroup[]) ?? [],
    );
    setVisibleStepKeys(
      Array.isArray(state.visibleStepKeys) && state.visibleStepKeys.length > 0
        ? (state.visibleStepKeys as string[])
        : getDefaultVisibleStepKeys(),
    );
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
    setPreviousStepsHtml(String(state.previousStepsHtml ?? ""));
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
    setLastSavedDraftContentSnapshot(
      buildDraftContentSnapshot({
        manualTitle: (state.manualTitle || "Sin título").trim() || "Sin título",
        sections: (state.sections as UISection[] | null) ?? null,
        detailedPieces: (state.detailedPieces as PiezasGrupo[]) ?? [],
        detailedFixPieces: (state.detailedFixPieces as PiezasGrupo[]) ?? [],
        backupTables: (state.backupTables as BackupTableGroup[]) ?? [],
        backupFixTables: (state.backupFixTables as BackupTableGroup[]) ?? [],
        installationTables:
          (state.installationTables as InstallationTableGroup[]) ?? [],
        reversionTables:
          (state.reversionTables as InstallationTableGroup[]) ?? [],
        installationFixTables:
          (state.installationFixTables as InstallationTableGroup[]) ?? [],
        reversionFixTables:
          (state.reversionFixTables as InstallationTableGroup[]) ?? [],
        visibleStepKeys:
          (Array.isArray(state.visibleStepKeys) && state.visibleStepKeys.length > 0
            ? (state.visibleStepKeys as string[])
            : getDefaultVisibleStepKeys()),
        servicesProducts: loadedServicesProducts,
        affectedAreas: loadedAffectedAreas,
        repositoryNames: loadedRepositoryNames,
        communicationMatrix: loadedCommunicationMatrix,
        previousStepsHtml: String(state.previousStepsHtml ?? ""),
      }),
    );
    return true;
  }

  async function deleteDraftById(id: string) {
    const ok = await window.ipc.draftDelete(id);
    if (ok && draftId === id) {
      setDraftId(null);
      setLastSavedDraftContentSnapshot(null);
    }
    return ok;
  }

  return {
    data,
    sections,
    detailedPieces,
    detailedFixPieces,
    backupTables,
    backupFixTables,
    installationTables,
    reversionTables,
    installationFixTables,
    reversionFixTables,
    visibleStepKeys,
    servicesProducts,
    affectedAreas,
    repositoryNames,
    communicationMatrix,
    previousStepsHtml,
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
    setBackupTables,
    setBackupFixTables,
    setInstallationTables,
    setReversionTables,
    setInstallationFixTables,
    setReversionFixTables,
    setVisibleStepKeys,
    setServicesProducts,
    setAffectedAreas,
    setRepositoryNames,
    setCommunicationMatrix,
    setPreviousStepsHtml,
    setManualTitle,
    setActiveStep,
    setGitData,
    setGitModalOpen,
    setGitLoading,

    handleOpen,
    handleOpenUnion,
    loadFromTemplateBytes,
    handleExport,
    buildCurrentManualDocx,
    previewCurrentManualPdf,
    listDrafts,
    saveCurrentDraft,
    loadDraftById,
    deleteDraftById,
  };
}
