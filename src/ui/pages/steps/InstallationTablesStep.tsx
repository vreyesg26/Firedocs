import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActionIcon,
  Button,
  Card,
  Divider,
  Flex,
  Modal,
  Popover,
  Radio,
  ScrollArea,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  Textarea,
  ThemeIcon,
  Title,
} from "@mantine/core";
import {
  IconArrowDown,
  IconArrowUp,
  IconArrowsSort,
  IconEdit,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import { useManual } from "@/context/ManualContext";
import { mainColor } from "@/lib/utils";
import type {
  InstallationHeaderFourRow,
  InstallationHeaderOneRow,
  InstallationHeaderThreeRow,
  InstallationProcedureRow,
  InstallationTableGroup,
  PiezasGrupo,
} from "@/types/manual";
import { moveListItem } from "./piecesStepUtils";

const EMPTY_HEADER_ONE: InstallationHeaderOneRow = {
  implementingTeam: "",
  integrationBranch: "",
  repository: "",
};

const EMPTY_PROCEDURE_ROW: InstallationProcedureRow = {
  step: "",
  objectToInstall: "",
  versionerPath: "",
};

const EMPTY_HEADER_THREE: InstallationHeaderThreeRow = {
  databaseOrDirectory: "",
  server: "",
};

const EMPTY_HEADER_FOUR: InstallationHeaderFourRow = {
  applicationToImplement: "",
  additionalComments: "",
};

const DEFAULT_EMPTY_FIELD_VALUE = "N/A";
const VORTEX_DEFAULT_COMMENT =
  "Se versiona para homologar los fuentes en el repositorio de Vortex de OSB12c";

type ModalMode = "create" | "edit";
type PickerMode = "branch" | "repository";
type TableFlowMode =
  | "installation"
  | "reversion"
  | "installation-fix"
  | "reversion-fix";

const centeredTextInputStyles = {
  input: {
    textAlign: "center" as const,
  },
};

const centeredTextareaStyles = {
  input: {
    textAlign: "center" as const,
    paddingTop: "calc(var(--mantine-spacing-sm) + 2px)",
    paddingBottom: "calc(var(--mantine-spacing-sm) + 2px)",
    minHeight: 96,
    height: 96,
    overflowY: "auto" as const,
    resize: "none" as const,
  },
};

function buildSequentialInstallationTitles(groups: InstallationTableGroup[]) {
  return groups.map((group, index) => ({
    ...group,
    title: `Tabla ${index + 1}`,
  }));
}

function getTableLabel(group: InstallationTableGroup, fallbackIndex: number) {
  return group.title?.trim() || `Tabla ${fallbackIndex + 1}`;
}

function getTableNumber(group: InstallationTableGroup, fallbackIndex: number) {
  const match = getTableLabel(group, fallbackIndex).match(/(\d+)$/);
  return match?.[1] ?? String(fallbackIndex + 1);
}

function normalizeOption(value: string) {
  return value.trim();
}

function toRepositoryPickerLabel(repositoryName: string) {
  const trimmed = repositoryName.trim();
  if (!trimmed.includes("/")) return trimmed;

  const parts = trimmed
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean);

  return parts[parts.length - 1] || trimmed;
}

type FileSearchOption = {
  fileName: string;
  fullPath: string;
  repository: string;
  groupName: string;
};

function normalizeSourcePath(sourcePath: string) {
  const cleanSourcePath = sourcePath.trim().replace(/^\/+/, "");
  return cleanSourcePath;
}

function getDirectoryFromPath(path: string) {
  const normalized = normalizeSourcePath(path);
  if (!normalized.includes("/")) return "";
  return normalized.slice(0, normalized.lastIndexOf("/")).replaceAll("/", "\\");
}

function normalizeSearchValue(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function findMentionAtCursor(value: string, cursor: number | null) {
  if (cursor === null) return null;

  const slice = value.slice(0, cursor);
  const match = slice.match(/(^|\s)@([^\s@]*)$/);
  if (!match) return null;

  const query = match[2] ?? "";
  const tokenStart = slice.length - query.length - 1;

  return {
    query,
    tokenStart,
    tokenEnd: cursor,
  };
}

function isSuggestionNavigationKey(key: string) {
  return key === "ArrowDown" || key === "ArrowUp" || key === "Enter" || key === "Escape";
}

function normalizeTableValue(value: string) {
  const trimmed = value.trim();
  return trimmed || DEFAULT_EMPTY_FIELD_VALUE;
}

function isDefaultNA(value: string) {
  return value.trim().toUpperCase() === DEFAULT_EMPTY_FIELD_VALUE;
}

function getValueFontWeight(value: string) {
  return isDefaultNA(value) ? 700 : undefined;
}

function normalizeHeaderOneValue(value: string) {
  return normalizeTableValue(value);
}

function isOsbRepository(repository: string) {
  return repository.trim().toLowerCase() === "osb";
}

function isVortexRepository(repository: string) {
  return repository.trim().toLowerCase() === "vortex";
}

function buildVortexGroupFromOsb(
  osbGroup: InstallationTableGroup,
  fallbackTitle: string,
): InstallationTableGroup {
  return {
    title: fallbackTitle,
    headerOne: {
      implementingTeam: osbGroup.headerOne.implementingTeam,
      integrationBranch: osbGroup.headerOne.integrationBranch,
      repository: "Vortex",
    },
    procedureRows: [{ ...EMPTY_PROCEDURE_ROW }],
    headerThree: {
      databaseOrDirectory: DEFAULT_EMPTY_FIELD_VALUE,
      server: DEFAULT_EMPTY_FIELD_VALUE,
    },
    headerFour: {
      applicationToImplement: DEFAULT_EMPTY_FIELD_VALUE,
      additionalComments: VORTEX_DEFAULT_COMMENT,
    },
  };
}

export function InstallationTablesStep({
  mode = "installation",
}: {
  mode?: TableFlowMode;
}) {
  const manual = useManual() as {
    installationTables?: InstallationTableGroup[];
    reversionTables?: InstallationTableGroup[];
    installationFixTables?: InstallationTableGroup[];
    reversionFixTables?: InstallationTableGroup[];
    setInstallationTables: (
      value:
        | InstallationTableGroup[]
        | ((prev: InstallationTableGroup[]) => InstallationTableGroup[]),
    ) => void;
    setReversionTables: (
      value:
        | InstallationTableGroup[]
        | ((prev: InstallationTableGroup[]) => InstallationTableGroup[]),
    ) => void;
    setInstallationFixTables: (
      value:
        | InstallationTableGroup[]
        | ((prev: InstallationTableGroup[]) => InstallationTableGroup[]),
    ) => void;
    setReversionFixTables: (
      value:
        | InstallationTableGroup[]
        | ((prev: InstallationTableGroup[]) => InstallationTableGroup[]),
    ) => void;
    detailedPieces?: PiezasGrupo[];
    detailedFixPieces?: PiezasGrupo[];
  };

  const isFixMode =
    mode === "installation-fix" || mode === "reversion-fix";
  const isInstallationMode =
    mode === "installation" || mode === "installation-fix";
  const detailedPieces = isFixMode
    ? manual.detailedFixPieces
    : manual.detailedPieces;
  const groups =
    mode === "installation"
      ? manual.installationTables ?? []
      : mode === "reversion"
        ? manual.reversionTables ?? []
        : mode === "installation-fix"
          ? manual.installationFixTables ?? []
          : manual.reversionFixTables ?? [];
  const setGroups =
    mode === "installation"
      ? manual.setInstallationTables
      : mode === "reversion"
        ? manual.setReversionTables
        : mode === "installation-fix"
          ? manual.setInstallationFixTables
          : manual.setReversionFixTables;
  const sectionTitle =
    mode === "installation"
      ? "Pasos requeridos para la instalación"
      : mode === "reversion"
        ? "Pasos requeridos para la reversión"
        : mode === "installation-fix"
          ? "Pasos requeridos para la instalación - Fixes"
          : "Pasos requeridos para la reversión - Fixes";
  const emptyStateText =
    mode === "installation"
      ? "Las tablas de instalación se mostrarán aquí"
      : mode === "reversion"
        ? "Las tablas de reversión se mostrarán aquí"
        : mode === "installation-fix"
          ? "Las tablas de instalación de fixes se mostrarán aquí"
          : "Las tablas de reversión de fixes se mostrarán aquí";
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>("create");
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [groupToDeleteIndex, setGroupToDeleteIndex] = useState<number | null>(
    null,
  );
  const [orderModalOpen, setOrderModalOpen] = useState(false);
  const [orderDraft, setOrderDraft] = useState<InstallationTableGroup[]>([]);
  const [pickerMode, setPickerMode] = useState<PickerMode | null>(null);
  const [pickerSelection, setPickerSelection] = useState("");
  const [headerOne, setHeaderOne] = useState<InstallationHeaderOneRow>({
    ...EMPTY_HEADER_ONE,
  });
  const [procedureRows, setProcedureRows] = useState<InstallationProcedureRow[]>(
    [{ ...EMPTY_PROCEDURE_ROW }],
  );
  const [headerThree, setHeaderThree] = useState<InstallationHeaderThreeRow>({
    ...EMPTY_HEADER_THREE,
  });
  const [headerFour, setHeaderFour] = useState<InstallationHeaderFourRow>({
    ...EMPTY_HEADER_FOUR,
  });
  const [scrollToLastGroup, setScrollToLastGroup] = useState(false);
  const groupRefs = useRef<Array<HTMLDivElement | null>>([]);
  const objectToInstallRefs = useRef<Array<HTMLTextAreaElement | null>>([]);
  const suggestionOptionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [activeObjectMention, setActiveObjectMention] = useState<{
    rowIndex: number;
    query: string;
    tokenStart: number;
    tokenEnd: number;
  } | null>(null);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState<
    number | null
  >(null);

  const branchOptions = useMemo(
    () =>
      Array.from(
        new Set(
          (detailedPieces ?? [])
            .map((group) => normalizeOption(group.sourceBranch ?? ""))
            .filter(Boolean),
        ),
      ),
    [detailedPieces],
  );

  const repositoryOptions = useMemo(() => {
    const fromDetailedPieces = (detailedPieces ?? [])
      .map((group) => toRepositoryPickerLabel(group.grupo ?? ""))
      .map((value) => normalizeOption(value))
      .filter(Boolean);

    return Array.from(new Set(fromDetailedPieces));
  }, [detailedPieces]);

  const fileSearchOptions = useMemo(() => {
    const unique = new Map<string, FileSearchOption>();

    (detailedPieces ?? []).forEach((group) => {
      const repository = normalizeOption(group.sourceRepository ?? "");

      group.items.forEach((item) => {
        const sourcePath = normalizeOption(item.sourcePath ?? "");
        const fileName =
          normalizeOption(item.nombre ?? "") ||
          sourcePath.split("/").pop()?.trim() ||
          "";

        if (!sourcePath || !fileName) return;

        const fullPath = normalizeSourcePath(sourcePath);
        if (!fullPath) return;

        if (!unique.has(fullPath)) {
          unique.set(fullPath, {
            fileName,
            fullPath,
            repository,
            groupName: group.grupo ?? "",
          });
        }
      });
    });

    return Array.from(unique.values()).sort((a, b) =>
      a.fileName.localeCompare(b.fileName),
    );
  }, [detailedPieces]);

  const filteredFileSearchOptions = useMemo(() => {
    if (!activeObjectMention) return [];

    const query = normalizeSearchValue(activeObjectMention.query);
    const filtered = !query
      ? fileSearchOptions
      : fileSearchOptions.filter((option) => {
          const fileName = normalizeSearchValue(option.fileName);
          return fileName.includes(query);
        });

    return filtered.slice(0, 8);
  }, [activeObjectMention, fileSearchOptions]);

  useEffect(() => {
    suggestionOptionRefs.current = [];
    setActiveSuggestionIndex(null);
  }, [activeObjectMention?.rowIndex, activeObjectMention?.query]);

  useEffect(() => {
    if (activeSuggestionIndex === null) return;
    const target = suggestionOptionRefs.current[activeSuggestionIndex];
    target?.scrollIntoView({ block: "nearest" });
  }, [activeSuggestionIndex]);

  useEffect(() => {
    if (!scrollToLastGroup || groups.length === 0) return;

    const target = groupRefs.current[groups.length - 1];
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    setScrollToLastGroup(false);
  }, [groups.length, scrollToLastGroup]);

  function resetForm() {
    setModalMode("create");
    setEditingIndex(null);
    setHeaderOne({ ...EMPTY_HEADER_ONE });
    setProcedureRows([{ ...EMPTY_PROCEDURE_ROW }]);
    setHeaderThree({ ...EMPTY_HEADER_THREE });
    setHeaderFour({ ...EMPTY_HEADER_FOUR });
    setActiveObjectMention(null);
    setActiveSuggestionIndex(null);
    handleClosePicker();
  }

  function handleCloseModal() {
    setModalOpen(false);
    resetForm();
  }

  function handleOpenCreate() {
    resetForm();
    setModalMode("create");
    setModalOpen(true);
  }

  function handleOpenEdit(index: number) {
    const group = groups[index];
    if (!group) return;

    setModalMode("edit");
    setEditingIndex(index);
    setHeaderOne({ ...group.headerOne });
    setProcedureRows(
      group.procedureRows.length
        ? group.procedureRows.map((row) => ({ ...row }))
        : [{ ...EMPTY_PROCEDURE_ROW }],
    );
    setHeaderThree({ ...group.headerThree });
    setHeaderFour({ ...group.headerFour });
    handleClosePicker();
    setModalOpen(true);
  }

  function handleOpenDelete(index: number) {
    setGroupToDeleteIndex(index);
    setDeleteModalOpen(true);
  }

  function handleCloseDeleteModal() {
    setDeleteModalOpen(false);
    setGroupToDeleteIndex(null);
  }

  function handleConfirmDelete() {
    if (groupToDeleteIndex === null) return;

    setGroups((prev) =>
      buildSequentialInstallationTitles(
        prev.filter((_, index) => index !== groupToDeleteIndex),
      ),
    );
    handleCloseDeleteModal();
  }

  function handleOpenOrderModal() {
    setOrderDraft([...groups]);
    setOrderModalOpen(true);
  }

  function handleCloseOrderModal() {
    setOrderModalOpen(false);
    setOrderDraft([]);
  }

  function moveOrderDraft(from: number, to: number) {
    setOrderDraft((prev) => moveListItem(prev, from, to));
  }

  function handleApplyOrder() {
    setGroups(buildSequentialInstallationTitles(orderDraft));
    handleCloseOrderModal();
  }

  function handleClosePicker() {
    setPickerMode(null);
    setPickerSelection("");
  }

  function handleOpenPicker(mode: PickerMode) {
    setPickerMode(mode);
    setPickerSelection(
      mode === "branch" ? headerOne.integrationBranch : headerOne.repository,
    );
  }

  function handleApplyPickerSelection() {
    if (!pickerMode || !pickerSelection.trim()) return;

    if (pickerMode === "branch") {
      handleHeaderOneChange("integrationBranch", pickerSelection);
    } else {
      handleHeaderOneChange("repository", pickerSelection);
    }

    handleClosePicker();
  }

  function handlePickerKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Enter") return;
    if (!pickerSelection.trim()) return;

    event.preventDefault();
    handleApplyPickerSelection();
  }

  function handleHeaderOneChange<K extends keyof InstallationHeaderOneRow>(
    key: K,
    value: InstallationHeaderOneRow[K],
  ) {
    setHeaderOne((prev) => ({ ...prev, [key]: value }));
  }

  function handleProcedureRowChange<K extends keyof InstallationProcedureRow>(
    index: number,
    key: K,
    value: InstallationProcedureRow[K],
  ) {
    setProcedureRows((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [key]: value };
      return next;
    });
  }

  function updateObjectMentionState(
    index: number,
    value: string,
    cursor: number | null,
  ) {
    const mention = findMentionAtCursor(value, cursor);
    if (!mention) {
      setActiveObjectMention((current) =>
        current?.rowIndex === index ? null : current,
      );
      setActiveSuggestionIndex(null);
      return;
    }

    setActiveObjectMention({
      rowIndex: index,
      query: mention.query,
      tokenStart: mention.tokenStart,
      tokenEnd: mention.tokenEnd,
    });
  }

  function handleObjectToInstallChange(index: number, value: string, cursor: number) {
    handleProcedureRowChange(index, "objectToInstall", value);
    updateObjectMentionState(index, value, cursor);
  }

  function handleSelectObjectSuggestion(option: FileSearchOption) {
    if (!activeObjectMention) return;

    const { rowIndex, tokenStart, tokenEnd } = activeObjectMention;
    const currentRow = procedureRows[rowIndex];
    if (!currentRow) return;

    const nextObjectToInstall = `${currentRow.objectToInstall.slice(0, tokenStart)}${option.fileName}${currentRow.objectToInstall.slice(tokenEnd)}`;
    const nextVersionerPath = getDirectoryFromPath(option.fullPath);

    setProcedureRows((prev) => {
      const next = [...prev];
      const current = next[rowIndex];
      if (!current) return prev;
      next[rowIndex] = {
        ...current,
        objectToInstall: nextObjectToInstall,
        versionerPath: nextVersionerPath,
      };
      return next;
    });
    setActiveObjectMention(null);
    setActiveSuggestionIndex(null);

    window.requestAnimationFrame(() => {
      const target = objectToInstallRefs.current[rowIndex];
      if (!target) return;
      const nextCursor = tokenStart + option.fileName.length;
      target.focus();
      target.setSelectionRange(nextCursor, nextCursor);
    });
  }

  function handleObjectToInstallKeyDown(
    event: React.KeyboardEvent<HTMLTextAreaElement>,
  ) {
    if (!activeObjectMention) return;

    if (event.key === "ArrowDown") {
      if (!filteredFileSearchOptions.length) return;
      event.preventDefault();
      setActiveSuggestionIndex((current) => {
        if (current === null) return 0;
        return Math.min(current + 1, filteredFileSearchOptions.length - 1);
      });
      return;
    }

    if (event.key === "ArrowUp") {
      if (!filteredFileSearchOptions.length) return;
      event.preventDefault();
      setActiveSuggestionIndex((current) => {
        if (current === null) return filteredFileSearchOptions.length - 1;
        return Math.max(current - 1, 0);
      });
      return;
    }

    if (event.key === "Enter") {
      if (activeSuggestionIndex === null) return;
      const option = filteredFileSearchOptions[activeSuggestionIndex];
      if (!option) return;
      event.preventDefault();
      handleSelectObjectSuggestion(option);
      return;
    }

    if (event.key === "Escape") {
      setActiveObjectMention(null);
      setActiveSuggestionIndex(null);
    }
  }

  function handleHeaderThreeChange<K extends keyof InstallationHeaderThreeRow>(
    key: K,
    value: InstallationHeaderThreeRow[K],
  ) {
    setHeaderThree((prev) => ({ ...prev, [key]: value }));
  }

  function handleHeaderFourChange<K extends keyof InstallationHeaderFourRow>(
    key: K,
    value: InstallationHeaderFourRow[K],
  ) {
    setHeaderFour((prev) => ({ ...prev, [key]: value }));
  }

  function handleAddProcedureRow() {
    setProcedureRows((prev) => [...prev, { ...EMPTY_PROCEDURE_ROW }]);
  }

  function handleRemoveProcedureRow(index: number) {
    setProcedureRows((prev) => {
      if (prev.length === 1) return [{ ...EMPTY_PROCEDURE_ROW }];
      return prev.filter((_, currentIndex) => currentIndex !== index);
    });
  }

  function moveProcedureRow(from: number, to: number) {
    setProcedureRows((prev) => moveListItem(prev, from, to));
  }

  function isProcedureRowValid() {
    return true;
  }

  function isTableValid() {
    return procedureRows.every(isProcedureRowValid);
  }

  function handleSubmit() {
    if (!isTableValid()) return;

    const baseTitle =
      modalMode === "edit" && editingIndex !== null
        ? groups[editingIndex]?.title || `Tabla ${editingIndex + 1}`
        : `Tabla ${groups.length + 1}`;

    const nextGroup: InstallationTableGroup = {
      title: baseTitle,
      headerOne: {
        implementingTeam: normalizeHeaderOneValue(headerOne.implementingTeam),
        integrationBranch: normalizeHeaderOneValue(headerOne.integrationBranch),
        repository: normalizeHeaderOneValue(headerOne.repository),
      },
      procedureRows: procedureRows.map((row) => ({
        step: normalizeTableValue(row.step),
        objectToInstall: normalizeTableValue(row.objectToInstall),
        versionerPath: normalizeTableValue(row.versionerPath),
      })),
      headerThree: {
        databaseOrDirectory: normalizeTableValue(
          headerThree.databaseOrDirectory,
        ),
        server: normalizeTableValue(headerThree.server),
      },
      headerFour: {
        applicationToImplement: normalizeTableValue(
          headerFour.applicationToImplement,
        ),
        additionalComments: normalizeTableValue(headerFour.additionalComments),
      },
    };

    if (modalMode === "edit" && editingIndex !== null) {
      setGroups((prev) => {
        const nextGroups = prev.map((group, index) =>
          index === editingIndex ? nextGroup : group,
        );

        if (!isInstallationMode || isFixMode || !isOsbRepository(nextGroup.headerOne.repository)) {
          return buildSequentialInstallationTitles(nextGroups);
        }

        const vortexIndex = nextGroups.findIndex((group, index) => {
          if (index === editingIndex) return false;
          return isVortexRepository(group.headerOne.repository);
        });

        if (vortexIndex >= 0) {
          nextGroups[vortexIndex] = buildVortexGroupFromOsb(
            nextGroup,
            nextGroups[vortexIndex]?.title || `Tabla ${vortexIndex + 1}`,
          );
        } else {
          nextGroups.push(
            buildVortexGroupFromOsb(nextGroup, `Tabla ${nextGroups.length + 1}`),
          );
        }

        return buildSequentialInstallationTitles(nextGroups);
      });
    } else {
      setScrollToLastGroup(true);
      setGroups((prev) => {
        const nextGroups = [...prev, nextGroup];

        if (
          !isInstallationMode ||
          isFixMode ||
          !isOsbRepository(nextGroup.headerOne.repository)
        ) {
          return buildSequentialInstallationTitles(nextGroups);
        }

        const vortexIndex = nextGroups.findIndex((group) =>
          isVortexRepository(group.headerOne.repository),
        );

        if (vortexIndex >= 0) {
          nextGroups[vortexIndex] = buildVortexGroupFromOsb(
            nextGroup,
            nextGroups[vortexIndex]?.title || `Tabla ${vortexIndex + 1}`,
          );
          return buildSequentialInstallationTitles(nextGroups);
        }

        return buildSequentialInstallationTitles([
          ...nextGroups,
          buildVortexGroupFromOsb(nextGroup, `Tabla ${nextGroups.length + 1}`),
        ]);
      });
    }

    handleCloseModal();
  }

  const selectedGroupName =
    groupToDeleteIndex !== null ? groups[groupToDeleteIndex]?.title ?? "" : "";
  const currentPickerOptions =
    pickerMode === "branch" ? branchOptions : repositoryOptions;
  const pickerTitle =
    pickerMode === "branch"
      ? "Agregar rama de integración"
      : "Agregar repositorio";

  return (
    <>
      <Flex align="center" justify="space-between">
        <Title order={2}>{sectionTitle}</Title>
        <Flex align="center" gap="xs">
          {groups.length > 1 && (
            <Button
              variant="outline"
              color="gray"
              leftSection={<IconArrowsSort size="1.1rem" />}
              onClick={handleOpenOrderModal}
            >
              Ordenar
            </Button>
          )}
          <Button
            leftSection={<IconPlus size="1.1rem" />}
            color={mainColor}
            onClick={handleOpenCreate}
          >
            Nueva tabla
          </Button>
        </Flex>
      </Flex>

      <Divider my="xs" />

      {groups.length === 0 ? (
        <Flex
          mt="md"
          mih="60vh"
          align="center"
          justify="center"
          style={{ width: "100%" }}
        >
          <Text c="dimmed" ta="center" size="md">
            {emptyStateText}
          </Text>
        </Flex>
      ) : (
        <SimpleGrid cols={{ base: 1, sm: 2 }} mt="md">
          {groups.map((group, index) => (
            <Flex
              key={`${group.title}-${index}`}
              direction="column"
              gap="xs"
              style={{ minWidth: 0 }}
              ref={(element) => {
                groupRefs.current[index] = element;
              }}
            >
              <Card radius="sm">
                <Stack gap="xs">
                  <Flex gap="xs" align="center" justify="space-between">
                    <Flex gap="xs" align="center" style={{ minWidth: 0 }}>
                      <ThemeIcon radius="sm" color={mainColor}>
                        <Text fw={700}>{getTableNumber(group, index)}</Text>
                      </ThemeIcon>
                      <Text truncate>{getTableLabel(group, index)}</Text>
                    </Flex>
                    <Flex gap="xs" align="center">
                      <ActionIcon
                        variant="filled"
                        color={mainColor}
                        size="lg"
                        onClick={() => handleOpenEdit(index)}
                        aria-label="Editar tabla"
                      >
                        <IconEdit size="1.1rem" />
                      </ActionIcon>
                      <ActionIcon
                        variant="filled"
                        color="red"
                        size="lg"
                        onClick={() => handleOpenDelete(index)}
                        aria-label="Eliminar tabla"
                      >
                        <IconTrash size="1.1rem" />
                      </ActionIcon>
                    </Flex>
                  </Flex>

                  <Table
                    withTableBorder
                    withColumnBorders
                    verticalSpacing="md"
                    horizontalSpacing="md"
                    style={{ tableLayout: "fixed" }}
                  >
                    <Table.Tbody>
                      <Table.Tr>
                        <Table.Th
                          style={{
                            background: mainColor,
                            color: "white",
                            textAlign: "center",
                            fontWeight: 700,
                          }}
                        >
                          Equipo Implementador:
                        </Table.Th>
                        <Table.Th
                          style={{
                            background: mainColor,
                            color: "white",
                            textAlign: "center",
                            fontWeight: 700,
                          }}
                        >
                          Rama de Integración:
                        </Table.Th>
                        <Table.Th
                          style={{
                            background: mainColor,
                            color: "white",
                            textAlign: "center",
                            fontWeight: 700,
                          }}
                        >
                          Repositorio:
                        </Table.Th>
                      </Table.Tr>

                      <Table.Tr>
                        <Table.Td
                          style={{
                            textAlign: "center",
                            fontWeight:
                              getValueFontWeight(group.headerOne.implementingTeam) ??
                              700,
                          }}
                        >
                          {group.headerOne.implementingTeam}
                        </Table.Td>
                        <Table.Td
                          style={{
                            textAlign: "center",
                            fontWeight:
                              getValueFontWeight(group.headerOne.integrationBranch) ??
                              700,
                            whiteSpace: "pre-wrap",
                            overflowWrap: "anywhere",
                            wordBreak: "break-word",
                          }}
                        >
                          {group.headerOne.integrationBranch}
                        </Table.Td>
                        <Table.Td
                          style={{
                            textAlign: "center",
                            fontWeight:
                              getValueFontWeight(group.headerOne.repository) ?? 700,
                          }}
                        >
                          {group.headerOne.repository}
                        </Table.Td>
                      </Table.Tr>

                      <Table.Tr>
                        <Table.Td
                          style={{
                            background: mainColor,
                            color: "white",
                            textAlign: "center",
                            fontWeight: 700,
                            width: 140,
                          }}
                        >
                          Paso
                        </Table.Td>
                        <Table.Td
                          style={{
                            background: mainColor,
                            color: "white",
                            textAlign: "center",
                            fontWeight: 700,
                          }}
                        >
                          Objeto a instalar
                        </Table.Td>
                        <Table.Td
                          style={{
                            background: mainColor,
                            color: "white",
                            textAlign: "center",
                            fontWeight: 700,
                          }}
                        >
                          Ruta en Versionador
                        </Table.Td>
                      </Table.Tr>

                      {group.procedureRows.map((row, rowIndex) => (
                        <Table.Tr key={`${group.title}-${rowIndex}`}>
                          <Table.Td
                            style={{
                              whiteSpace: "pre-wrap",
                              verticalAlign: "middle",
                              textAlign: "center",
                              fontWeight: getValueFontWeight(row.step),
                              overflowWrap: "anywhere",
                              wordBreak: "break-word",
                            }}
                          >
                            {row.step}
                          </Table.Td>
                          <Table.Td
                            style={{
                              whiteSpace: "pre-wrap",
                              verticalAlign: "middle",
                              textAlign: "center",
                              fontWeight: getValueFontWeight(row.objectToInstall),
                              overflowWrap: "anywhere",
                              wordBreak: "break-word",
                            }}
                          >
                            {row.objectToInstall}
                          </Table.Td>
                          <Table.Td
                            style={{
                              whiteSpace: "pre-wrap",
                              verticalAlign: "middle",
                              textAlign: "center",
                              fontWeight: getValueFontWeight(row.versionerPath),
                              overflowWrap: "anywhere",
                              wordBreak: "break-word",
                            }}
                          >
                            {row.versionerPath}
                          </Table.Td>
                        </Table.Tr>
                      ))}

                      <Table.Tr>
                        <Table.Td
                          style={{
                            background: mainColor,
                            color: "white",
                            textAlign: "center",
                            fontWeight: 700,
                          }}
                        >
                          Base de datos
                        </Table.Td>
                        <Table.Td
                          colSpan={2}
                          style={{
                            background: mainColor,
                            color: "white",
                            textAlign: "center",
                            fontWeight: 700,
                          }}
                        >
                          Servidor (Nombre, IP)
                        </Table.Td>
                      </Table.Tr>

                      <Table.Tr>
                        <Table.Td
                          style={{
                            whiteSpace: "pre-wrap",
                            verticalAlign: "middle",
                            textAlign: "center",
                            fontWeight: getValueFontWeight(
                              group.headerThree.databaseOrDirectory,
                            ),
                            overflowWrap: "anywhere",
                            wordBreak: "break-word",
                          }}
                        >
                          {group.headerThree.databaseOrDirectory}
                        </Table.Td>
                        <Table.Td
                          colSpan={2}
                          style={{
                            whiteSpace: "pre-wrap",
                            verticalAlign: "middle",
                            textAlign: "center",
                            fontWeight: getValueFontWeight(group.headerThree.server),
                            overflowWrap: "anywhere",
                            wordBreak: "break-word",
                          }}
                        >
                          {group.headerThree.server}
                        </Table.Td>
                      </Table.Tr>

                      <Table.Tr>
                        <Table.Td
                          style={{
                            background: mainColor,
                            color: "white",
                            textAlign: "center",
                            fontWeight: 700,
                          }}
                        >
                          Aplicativo a implementar
                        </Table.Td>
                        <Table.Td
                          colSpan={2}
                          style={{
                            background: mainColor,
                            color: "white",
                            textAlign: "center",
                            fontWeight: 700,
                          }}
                        >
                          Comentarios adicionales
                        </Table.Td>
                      </Table.Tr>

                      <Table.Tr>
                        <Table.Td
                          style={{
                            whiteSpace: "pre-wrap",
                            verticalAlign: "middle",
                            textAlign: "center",
                            fontWeight: getValueFontWeight(
                              group.headerFour.applicationToImplement,
                            ),
                            overflowWrap: "anywhere",
                            wordBreak: "break-word",
                          }}
                        >
                          {group.headerFour.applicationToImplement}
                        </Table.Td>
                        <Table.Td
                          colSpan={2}
                          style={{
                            whiteSpace: "pre-wrap",
                            verticalAlign: "middle",
                            textAlign: "center",
                            fontWeight: getValueFontWeight(
                              group.headerFour.additionalComments,
                            ),
                            overflowWrap: "anywhere",
                            wordBreak: "break-word",
                          }}
                        >
                          {group.headerFour.additionalComments}
                        </Table.Td>
                      </Table.Tr>
                    </Table.Tbody>
                  </Table>
                </Stack>
              </Card>
            </Flex>
          ))}
        </SimpleGrid>
      )}

      <Modal
        opened={modalOpen}
        onClose={handleCloseModal}
        title={modalMode === "edit" ? "Editar tabla" : "Nueva tabla"}
        centered
        radius="md"
        size={1100}
        withinPortal={false}
      >
        <Stack>
          <SimpleGrid cols={{ base: 1, sm: 3 }}>
            <TextInput
              label="Equipo Implementador"
              value={headerOne.implementingTeam}
              onChange={(event) =>
                handleHeaderOneChange("implementingTeam", event.currentTarget.value)
              }
              styles={centeredTextInputStyles}
            />

            <Flex align="flex-end" gap="xs">
              <TextInput
                label="Rama de Integración"
                value={headerOne.integrationBranch}
                onChange={(event) =>
                  handleHeaderOneChange(
                    "integrationBranch",
                    event.currentTarget.value,
                  )
                }
                styles={centeredTextInputStyles}
                style={{ flex: 1 }}
              />
              <ActionIcon
                variant="light"
                mb={4}
                onClick={() => handleOpenPicker("branch")}
                disabled={branchOptions.length === 0}
                aria-label="Agregar rama desde las tablas del paso 2"
              >
                <IconPlus size={16} />
              </ActionIcon>
            </Flex>

            <Flex align="flex-end" gap="xs">
              <TextInput
                label="Repositorio"
                value={headerOne.repository}  
                onChange={(event) =>
                  handleHeaderOneChange("repository", event.currentTarget.value)
                }
                styles={centeredTextInputStyles}
                style={{ flex: 1 }}
              />
              <ActionIcon
                variant="light"
                mb={4}
                onClick={() => handleOpenPicker("repository")}
                disabled={repositoryOptions.length === 0}
                aria-label="Agregar repositorio desde las tablas del paso 2"
              >
                <IconPlus size={16} />
              </ActionIcon>
            </Flex>
          </SimpleGrid>

          <Stack gap="xs">
            <Flex align="center" justify="flex-end">
              <Button variant="light" onClick={handleAddProcedureRow}>
                Agregar fila
              </Button>
            </Flex>

            <Stack gap="sm">
              {procedureRows.map((row, index) => (
                <Card key={index} withBorder radius="md" p="sm">
                  <Stack gap="sm">
                    <Flex align="center" justify="space-between">
                      <Text fw={500}>Fila {index + 1}</Text>
                      <Flex gap="xs">
                        <ActionIcon
                          variant="light"
                          color="gray"
                          onClick={() => moveProcedureRow(index, index - 1)}
                          disabled={index === 0}
                          aria-label="Subir fila"
                        >
                          <IconArrowUp size="1rem" />
                        </ActionIcon>
                        <ActionIcon
                          variant="light"
                          color="gray"
                          onClick={() => moveProcedureRow(index, index + 1)}
                          disabled={index === procedureRows.length - 1}
                          aria-label="Bajar fila"
                        >
                          <IconArrowDown size="1rem" />
                        </ActionIcon>
                        <ActionIcon
                          variant="light"
                          color="red"
                          onClick={() => handleRemoveProcedureRow(index)}
                          aria-label="Eliminar fila"
                        >
                          <IconTrash size="1rem" />
                        </ActionIcon>
                      </Flex>
                    </Flex>

                    <SimpleGrid cols={{ base: 1, sm: 3 }}>
                      <Textarea
                        label="Paso"
                        value={row.step}
                        onChange={(event) =>
                          handleProcedureRowChange(
                            index,
                            "step",
                            event.currentTarget.value,
                          )
                        }
                        styles={centeredTextareaStyles}
                      />
                      <Popover
                        opened={activeObjectMention?.rowIndex === index}
                        position="bottom-start"
                        middlewares={{ flip: false, shift: true }}
                        withArrow={false}
                        shadow="md"
                        width="target"
                        withinPortal
                        zIndex={1000}
                      >
                        <Popover.Target>
                          <div>
                            <Textarea
                              label="Objeto a instalar"
                              ref={(node) => {
                                objectToInstallRefs.current[index] = node;
                              }}
                              value={row.objectToInstall}
                              onChange={(event) =>
                                handleObjectToInstallChange(
                                  index,
                                  event.currentTarget.value,
                                  event.currentTarget.selectionStart ??
                                    event.currentTarget.value.length,
                                )
                              }
                              onFocus={(event) =>
                                updateObjectMentionState(
                                  index,
                                  event.currentTarget.value,
                                  event.currentTarget.selectionStart,
                                )
                              }
                              onClick={(event) =>
                                updateObjectMentionState(
                                  index,
                                  event.currentTarget.value,
                                  event.currentTarget.selectionStart,
                                )
                              }
                              onKeyUp={(event) =>
                                isSuggestionNavigationKey(event.key)
                                  ? undefined
                                  : updateObjectMentionState(
                                      index,
                                      event.currentTarget.value,
                                      event.currentTarget.selectionStart,
                                    )
                              }
                              onKeyDown={handleObjectToInstallKeyDown}
                              onBlur={() => {
                                window.setTimeout(() => {
                                  setActiveObjectMention((current) =>
                                    current?.rowIndex === index ? null : current,
                                  );
                                }, 150);
                              }}
                              styles={centeredTextareaStyles}
                            />
                          </div>
                        </Popover.Target>
                        <Popover.Dropdown p="xs">
                          <Stack gap={6}>
                            {fileSearchOptions.length === 0 ? (
                              <Text size="sm" c="dimmed">
                                No hay archivos indexados desde el paso 2. Debes
                                crear la tabla desde repositorio para que exista
                                una ruta real que buscar.
                              </Text>
                            ) : filteredFileSearchOptions.length === 0 ? (
                              <Text size="sm" c="dimmed">
                                No se encontro el archivo.
                              </Text>
                            ) : (
                              <ScrollArea.Autosize mah={220} offsetScrollbars>
                                <Stack gap={0}>
                                  {filteredFileSearchOptions.map((option, optionIndex) => (
                                    <Button
                                      key={option.fullPath}
                                      ref={(node) => {
                                        suggestionOptionRefs.current[optionIndex] = node;
                                      }}
                                      variant="transparent"
                                      color="gray"
                                      justify="flex-start"
                                      radius={0}
                                      style={{
                                        borderRadius: 8,
                                        border:
                                          activeSuggestionIndex === optionIndex
                                            ? "1px solid var(--mantine-color-blue-5)"
                                            : "1px solid transparent",
                                        backgroundColor:
                                          activeSuggestionIndex === optionIndex
                                            ? "rgba(34, 139, 230, 0.18)"
                                            : "transparent",
                                      }}
                                      styles={{
                                        root: {
                                          minHeight: 42,
                                        },
                                        inner: {
                                          justifyContent: "flex-start",
                                          width: "100%",
                                        },
                                        label: {
                                          width: "100%",
                                        },
                                      }}
                                      onMouseDown={(event) =>
                                        event.preventDefault()
                                      }
                                      onMouseEnter={() =>
                                        setActiveSuggestionIndex(optionIndex)
                                      }
                                      onClick={() => handleSelectObjectSuggestion(option)}
                                      >
                                      <Flex
                                        align="center"
                                        justify="flex-start"
                                        gap="xs"
                                        wrap="nowrap"
                                        style={{ width: "100%" }}
                                      >
                                        <Text
                                          size="sm"
                                          lh={1.2}
                                          ta="left"
                                          c={
                                            activeSuggestionIndex === optionIndex
                                              ? "blue.2"
                                              : undefined
                                          }
                                        >
                                          {option.fileName}
                                        </Text>
                                      </Flex>
                                    </Button>
                                  ))}
                                </Stack>
                              </ScrollArea.Autosize>
                            )}
                          </Stack>
                        </Popover.Dropdown>
                      </Popover>
                      <Textarea
                        label="Ruta en Versionador"
                        value={row.versionerPath}
                        onChange={(event) =>
                          handleProcedureRowChange(
                            index,
                            "versionerPath",
                            event.currentTarget.value,
                          )
                        }
                        styles={centeredTextareaStyles}
                      />
                    </SimpleGrid>
                  </Stack>
                </Card>
              ))}
            </Stack>
          </Stack>

          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            <Textarea
              label="Base de datos"
              value={headerThree.databaseOrDirectory}
              onChange={(event) =>
                handleHeaderThreeChange(
                  "databaseOrDirectory",
                  event.currentTarget.value,
                )
              }
              styles={centeredTextareaStyles}
            />
            <Textarea
              label="Servidor (Nombre, IP)"
              value={headerThree.server}
              onChange={(event) =>
                handleHeaderThreeChange("server", event.currentTarget.value)
              }
              styles={centeredTextareaStyles}
            />
          </SimpleGrid>

          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            <Textarea
              label="Aplicativo a implementar"
              value={headerFour.applicationToImplement}
              onChange={(event) =>
                handleHeaderFourChange(
                  "applicationToImplement",
                  event.currentTarget.value,
                )
              }
              styles={centeredTextareaStyles}
            />
            <Textarea
              label="Comentarios adicionales"
              value={headerFour.additionalComments}
              onChange={(event) =>
                handleHeaderFourChange(
                  "additionalComments",
                  event.currentTarget.value,
                )
              }
              styles={centeredTextareaStyles}
            />
          </SimpleGrid>

          <Flex justify="flex-end" gap="sm">
            <Button variant="default" onClick={handleCloseModal}>
              Cancelar
            </Button>
            <Button color={mainColor} onClick={handleSubmit}>
              {modalMode === "edit" ? "Guardar cambios" : "Crear tabla"}
            </Button>
          </Flex>
        </Stack>
      </Modal>

      <Modal
        opened={pickerMode !== null}
        onClose={handleClosePicker}
        title={pickerTitle}
        centered
        size="md"
        withinPortal={false}
      >
        <Stack gap="lg" onKeyDown={handlePickerKeyDown}>
          <Text size="sm" c="dimmed">
            Selecciona una opción existente o cierra este modal para continuar
            escribiendo manualmente.
          </Text>
          {currentPickerOptions.length > 0 ? (
            <ScrollArea.Autosize mah={260} offsetScrollbars>
              <Radio.Group value={pickerSelection} onChange={setPickerSelection}>
                <Stack gap="xs">
                  {currentPickerOptions.map((option) => (
                    <Radio key={option} value={option} label={option} />
                  ))}
                </Stack>
              </Radio.Group>
            </ScrollArea.Autosize>
          ) : (
            <Text size="sm" c="dimmed">
              No hay opciones disponibles para seleccionar.
            </Text>
          )}
          <Flex justify="flex-end" gap="sm">
            <Button variant="default" onClick={handleClosePicker}>
              Cancelar
            </Button>
            <Button
              onClick={handleApplyPickerSelection}
              disabled={!pickerSelection.trim()}
            >
              Agregar seleccionada
            </Button>
          </Flex>
        </Stack>
      </Modal>

      <Modal
        opened={deleteModalOpen}
        onClose={handleCloseDeleteModal}
        title="Eliminar tabla"
        centered
        radius="md"
        size="sm"
        withinPortal={false}
      >
        <Stack>
          <Text>
            ¿Eliminar la tabla <strong>{selectedGroupName || "sin nombre"}</strong>?
          </Text>
          <Flex justify="flex-end" gap="sm">
            <Button variant="default" onClick={handleCloseDeleteModal}>
              Cancelar
            </Button>
            <Button color="red" onClick={handleConfirmDelete}>
              Eliminar
            </Button>
          </Flex>
        </Stack>
      </Modal>

      <Modal
        opened={orderModalOpen}
        onClose={handleCloseOrderModal}
        title="Ordenar tablas"
        centered
        radius="md"
        size="md"
        withinPortal={false}
      >
        <Stack>
          {!orderDraft.length ? (
            <Text c="dimmed">No hay tablas para ordenar.</Text>
          ) : (
            <ScrollArea h={320} type="hover">
              <Stack gap="xs">
                {orderDraft.map((group, index) => (
                  <Flex
                    key={`${group.title}-${index}`}
                    justify="space-between"
                    align="center"
                    p="xs"
                    style={{
                      border: "1px solid var(--mantine-color-dark-4)",
                      borderRadius: 8,
                    }}
                  >
                    <Text truncate style={{ flex: 1, minWidth: 0 }}>
                      {index + 1}. {group.title}
                    </Text>
                    <Flex gap="xs">
                      <ActionIcon
                        variant="light"
                        color={mainColor}
                        onClick={() => moveOrderDraft(index, index - 1)}
                        disabled={index === 0}
                        aria-label="Mover arriba"
                      >
                        <IconArrowUp size={16} />
                      </ActionIcon>
                      <ActionIcon
                        variant="light"
                        color={mainColor}
                        onClick={() => moveOrderDraft(index, index + 1)}
                        disabled={index === orderDraft.length - 1}
                        aria-label="Mover abajo"
                      >
                        <IconArrowDown size={16} />
                      </ActionIcon>
                    </Flex>
                  </Flex>
                ))}
              </Stack>
            </ScrollArea>
          )}

          <Flex justify="flex-end" gap="xs">
            <Button variant="default" onClick={handleCloseOrderModal}>
              Cancelar
            </Button>
            <Button
              color={mainColor}
              onClick={handleApplyOrder}
              disabled={!orderDraft.length}
            >
              Ordenar
            </Button>
          </Flex>
        </Stack>
      </Modal>
    </>
  );
}
