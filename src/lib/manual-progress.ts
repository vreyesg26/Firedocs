import { getDefaultVisibleStepKeys } from "@/lib/constants";
import type {
  CommunicationMatrixRow,
  UIField,
  UISection,
} from "@/types/manual";

export type ManualProgressState = {
  sections?: UISection[] | null;
  detailedPieces?: unknown[];
  detailedFixPieces?: unknown[];
  servicesProducts?: string[];
  affectedAreas?: string[];
  repositoryNames?: string[];
  communicationMatrix?: CommunicationMatrixRow[];
  installationTables?: unknown[];
  reversionTables?: unknown[];
  backupFixTables?: unknown[];
  installationFixTables?: unknown[];
  reversionFixTables?: unknown[];
  visibleStepKeys?: string[];
};

const optionalStepKeys = new Set(["prevsteps", "backup"]);

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeTextList(values: unknown) {
  if (!Array.isArray(values)) return [];
  return values.map((value) => normalizeText(value)).filter(Boolean);
}

function findSectionField(
  sections: UISection[] | null | undefined,
  sectionId: string,
  fieldKey: string,
): UIField | null {
  const section = (sections ?? []).find((item) => item.id === sectionId);
  if (!section) return null;
  return (
    section.fields.find((field) => field.key === fieldKey) ??
    section.fields.find(
      (field) => normalizeText(field.key) === normalizeText(fieldKey),
    ) ??
    null
  );
}

function getFieldTextValue(field: UIField | null) {
  if (!field || Array.isArray(field.value)) return "";
  return normalizeText(field.value);
}

function getFieldListValue(field: UIField | null) {
  if (!field) return [];
  return Array.isArray(field.value)
    ? normalizeTextList(field.value)
    : normalizeText(field.value)
      ? [normalizeText(field.value)]
      : [];
}

function hasAtLeastOneNonEmptyValue(values: string[] | undefined) {
  return (values ?? []).some((value) => normalizeText(value).length > 0);
}

function isCommunicationMatrixRowComplete(
  row: CommunicationMatrixRow | null | undefined,
) {
  if (!row) return false;
  return (
    normalizeText(row.developerName).length > 0 &&
    normalizeText(row.developerContact).length > 0 &&
    normalizeText(row.bossName).length > 0 &&
    normalizeText(row.bossContact).length > 0 &&
    normalizeTextList(row.repositories).length > 0
  );
}

export function buildManualCompletionByStepKey(
  state: ManualProgressState,
): Record<string, boolean> {
  const tipoRequerimiento = getFieldTextValue(
    findSectionField(state.sections, "informacion-general", "tipo-requerimiento"),
  );
  const paisAfectado = getFieldListValue(
    findSectionField(state.sections, "informacion-general", "pais-afectado"),
  );

  return {
    general: tipoRequerimiento.length > 0 && paisAfectado.length > 0,
    pieces: (state.detailedPieces ?? []).length > 0,
    "pieces-fixes": (state.detailedFixPieces ?? []).length > 0,
    services:
      hasAtLeastOneNonEmptyValue(state.servicesProducts) &&
      hasAtLeastOneNonEmptyValue(state.affectedAreas),
    repos:
      hasAtLeastOneNonEmptyValue(state.repositoryNames) &&
      (state.communicationMatrix ?? []).some((row) =>
        isCommunicationMatrixRowComplete(row),
      ),
    prevsteps: true,
    backup: true,
    installation: (state.installationTables ?? []).length > 0,
    reversion: (state.reversionTables ?? []).length > 0,
    "backup-fix": (state.backupFixTables ?? []).length > 0,
    "installation-fix": (state.installationFixTables ?? []).length > 0,
    "reversion-fix": (state.reversionFixTables ?? []).length > 0,
  };
}

export function getManualProgress(state: ManualProgressState) {
  const visibleStepKeys =
    Array.isArray(state.visibleStepKeys) && state.visibleStepKeys.length > 0
      ? state.visibleStepKeys
      : getDefaultVisibleStepKeys();

  const completionByStepKey = buildManualCompletionByStepKey(state);
  const relevantVisibleStepKeys = visibleStepKeys.filter(
    (stepKey) => !optionalStepKeys.has(stepKey),
  );

  if (relevantVisibleStepKeys.length === 0) {
    return {
      percent: 100,
      completed: true,
      completionByStepKey,
      relevantVisibleStepKeys,
    };
  }

  const completedCount = relevantVisibleStepKeys.filter(
    (stepKey) => completionByStepKey[stepKey],
  ).length;
  const percent = Math.round(
    (completedCount / relevantVisibleStepKeys.length) * 100,
  );

  return {
    percent,
    completed: percent >= 100,
    completionByStepKey,
    relevantVisibleStepKeys,
  };
}
