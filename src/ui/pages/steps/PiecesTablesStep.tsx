import { useEffect, useRef, useState } from "react";
import {
  Accordion,
  ActionIcon,
  Button,
  Card,
  Divider,
  Flex,
  Group,
  Menu,
  Modal,
  ScrollArea,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  ThemeIcon,
  Title,
} from "@mantine/core";
import { GitChangesModal } from "@/components/ui/GitChangesModal";
import { useManual } from "@/context/ManualContext";
import type { RepoStatus, RepoChange } from "@/types/git";
import type { PiezasGrupo, PiezasItem } from "@/types/manual";
import {
  IconArrowDown,
  IconArrowUp,
  IconArrowsSort,
  IconBrandGithub,
  IconDots,
  IconEdit,
  IconPlus,
  IconRotateClockwise,
  IconTrash,
} from "@tabler/icons-react";
import { mainColor } from "@/lib/utils";
import { notifyError } from "@/lib/notifications";
import {
  errorMessage,
  extFromFileName,
  FIX_IDENTIFIER_OPTIONS,
  formatGitDateTime,
  toDateTimeDisplayValue,
  toDateTimeInputValue,
  inferIdentifierFromBranch,
  moveListItem,
  normalizeIdentifier,
  TruncatedNameCell,
} from "./piecesStepUtils";

type PiecesTablesStepVariant = "standard" | "fixes";
type NewTableView = "options" | "manual";
type ManualMode = "create" | "edit";
type GitTargetMode = "create" | "edit";
type RepoPick = { repoName: string; repoPath: string };

type ManualRow = {
  nombre: string;
  tipo: string;
  estado: "Nuevo" | "Modificado";
  tipoLocked: boolean;
  identificador: "Hotfix" | "Bugfix" | "Incidencia";
  fechaHoraModificacion: string;
  sourcePath: string;
};

const EMPTY_ROW: ManualRow = {
  nombre: "",
  tipo: "",
  estado: "Nuevo",
  tipoLocked: false,
  identificador: "Hotfix",
  fechaHoraModificacion: "",
  sourcePath: "",
};

function isRowEffectivelyEmpty(row: ManualRow) {
  return !row.nombre.trim() && !row.tipo.trim();
}

function mapEstadoFromChange(ch: RepoChange) {
  if (ch.kind === "added") return "Nuevo";
  if (ch.kind === "modified") return "Modificado";
  if (ch.kind === "deleted") return "Eliminado";
  if (ch.kind === "renamed") return "Modificado";
  return "Modificado";
}

function mapChangeToStandardItem(ch: RepoChange): PiezasItem {
  const name = ch.path.split(/[\\/]/).pop() || ch.path || "Objeto sin nombre";
  const tipo = extFromFileName(ch.ext || name) || "Archivo";

  return {
    nombre: name,
    tipo,
    estado: mapEstadoFromChange(ch),
    sourcePath: ch.path,
  };
}

function mapChangeToFixItem(
  ch: RepoChange,
  branch: string | undefined,
  lastModifiedAt: string | undefined,
): PiezasItem {
  const base = mapChangeToStandardItem(ch);
  return {
    ...base,
    identificador: inferIdentifierFromBranch(branch),
    fechaHoraModificacion: formatGitDateTime(lastModifiedAt),
  };
}

function mapItemToManualRow(
  item: PiezasItem,
  variant: PiecesTablesStepVariant,
): ManualRow {
  const estado = item.estado === "Nuevo" ? "Nuevo" : "Modificado";
  const inferredType = extFromFileName(item.nombre ?? "");
  const normalizedType =
    inferredType === "XQUERY" || inferredType === "BUSINESS"
      ? inferredType
      : item.tipo ?? "";

  return {
    nombre: item.nombre ?? "",
    tipo: normalizedType,
    estado,
    tipoLocked: Boolean(normalizedType.trim()),
    identificador:
      variant === "fixes" ? normalizeIdentifier(item.identificador) : "Hotfix",
    fechaHoraModificacion:
      variant === "fixes"
        ? toDateTimeInputValue(item.fechaHoraModificacion ?? "")
        : "",
    sourcePath: item.sourcePath ?? "",
  };
}

function toGroupsData(
  items: ManualRow[],
  variant: PiecesTablesStepVariant,
): PiezasItem[] {
  return items.map((row) => {
    const inferredType = extFromFileName(row.nombre);
    const normalizedType =
      inferredType === "XQUERY" || inferredType === "BUSINESS"
        ? inferredType
        : row.tipo.trim();
    const base: PiezasItem = {
      nombre: row.nombre.trim(),
      tipo: normalizedType,
      estado: row.estado,
    };

    if (row.sourcePath.trim()) {
      base.sourcePath = row.sourcePath.trim();
    }

    if (variant === "fixes") {
      base.identificador = row.identificador;
      base.fechaHoraModificacion = row.fechaHoraModificacion.trim();
    }

    return base;
  });
}

export function PiecesTablesStep({
  variant,
}: {
  variant: PiecesTablesStepVariant;
}) {
  const {
    data,
    detailedPieces,
    setDetailedPieces,
    detailedFixPieces,
    setDetailedFixPieces,
  } = useManual();

  const [newTableModalOpen, setNewTableModalOpen] = useState(false);
  const [newTableView, setNewTableView] = useState<NewTableView>("options");
  const [manualMode, setManualMode] = useState<ManualMode>("create");
  const [editingGroupIndex, setEditingGroupIndex] = useState<number | null>(
    null,
  );

  const [gitModalOpen, setGitModalOpen] = useState(false);
  const [repoSelectionLoading, setRepoSelectionLoading] = useState(false);
  const [commitRepoSelectionLoading, setCommitRepoSelectionLoading] =
    useState(false);
  const [commitScanLoading, setCommitScanLoading] = useState(false);
  const [gitData, setGitData] = useState<RepoStatus[]>([]);
  const [gitRepos, setGitRepos] = useState<string[]>([]);
  const [gitTargetMode, setGitTargetMode] = useState<GitTargetMode>("create");
  const [showCommitInput, setShowCommitInput] = useState(false);
  const [commitRepo, setCommitRepo] = useState<RepoPick | null>(null);
  const [commitId, setCommitId] = useState("");
  const [commitSubmitted, setCommitSubmitted] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [groupToDeleteIndex, setGroupToDeleteIndex] = useState<number | null>(
    null,
  );
  const [orderModalOpen, setOrderModalOpen] = useState(false);
  const [orderDraft, setOrderDraft] = useState<PiezasGrupo[]>([]);

  const [manualTableName, setManualTableName] = useState("");
  const [manualRows, setManualRows] = useState<ManualRow[]>([{ ...EMPTY_ROW }]);
  const [manualSubmitted, setManualSubmitted] = useState(false);
  const [scrollToLastGroup, setScrollToLastGroup] = useState(false);
  const groupRefs = useRef<Array<HTMLDivElement | null>>([]);

  const groups: PiezasGrupo[] =
    variant === "fixes" ? (detailedFixPieces ?? []) : (detailedPieces ?? []);

  const setGroups =
    variant === "fixes" ? setDetailedFixPieces : setDetailedPieces;

  const manualRowsCount = manualRows.length;
  const manualRowsCountLabel = `${manualRowsCount} ${
    manualRowsCount === 1 ? "registro" : "registros"
  }`;

  useEffect(() => {
    const parsedFixes =
      (data as { detailedFixPieces?: PiezasGrupo[] } | null)
        ?.detailedFixPieces ?? [];
    const source =
      variant === "fixes" ? parsedFixes : (data?.detailedPieces ?? []);

    if (source.length && !groups.length) {
      setGroups(source);
    }
  }, [data, groups.length, setGroups, variant]);

  useEffect(() => {
    if (!scrollToLastGroup || groups.length === 0) return;

    const target = groupRefs.current[groups.length - 1];
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    setScrollToLastGroup(false);
  }, [groups.length, scrollToLastGroup]);

  useEffect(() => {
    const unsubscribe = window.ipc.onGitWatchUpdate((statuses) => {
      setGitData(statuses ?? []);
    });

    return () => {
      unsubscribe?.();
      void window.ipc.stopGitWatch();
    };
  }, []);

  function resetNewTableModal() {
    setNewTableView("options");
    setManualMode("create");
    setEditingGroupIndex(null);
    setManualTableName("");
    setManualRows([{ ...EMPTY_ROW }]);
    setManualSubmitted(false);
    setShowCommitInput(false);
    setCommitRepo(null);
    setCommitId("");
    setCommitSubmitted(false);
    setCommitError(null);
  }

  function handleCloseNewTableModal() {
    setNewTableModalOpen(false);
    resetNewTableModal();
  }

  async function handlePickGithub(targetMode: GitTargetMode) {
    setRepoSelectionLoading(true);
    setCommitError(null);
    try {
      const picks = (await window.ipc.pickRepos()) as
        | RepoPick[]
        | null
        | undefined;
      const paths = (picks ?? []).map((p) => p.repoPath);
      if (!paths.length) return;

      if (gitRepos.length) {
        await window.ipc.stopGitWatch(gitRepos);
      }

      setGitRepos(paths);
      await window.ipc.startGitWatch(paths);

      const statuses = await window.ipc.scan(paths);
      setGitTargetMode(targetMode);
      setGitData(statuses ?? []);
      setGitModalOpen(true);
      if (targetMode === "create") {
        handleCloseNewTableModal();
      }
    } catch (error: unknown) {
      console.error(error);
      notifyError({
        title: "No se pudo cargar el repositorio",
        message: errorMessage(error),
      });
    } finally {
      setRepoSelectionLoading(false);
    }
  }

  async function handleSelectRepoForCommit() {
    setCommitRepoSelectionLoading(true);
    setCommitError(null);
    setCommitSubmitted(false);
    try {
      const picks = (await window.ipc.pickRepos()) as
        | RepoPick[]
        | null
        | undefined;
      const selected = (picks ?? [])[0] as RepoPick | undefined;
      if (!selected?.repoPath) return;
      setCommitRepo(selected);
      setShowCommitInput(true);
    } catch (error: unknown) {
      console.error(error);
      notifyError({
        title: "No se pudo seleccionar el repositorio",
        message: errorMessage(error),
      });
    } finally {
      setCommitRepoSelectionLoading(false);
    }
  }

  function handleClearCommitRepo() {
    setCommitRepo(null);
    setCommitId("");
    setCommitSubmitted(false);
    setCommitError(null);
    setShowCommitInput(false);
  }

  async function handlePickCommit(targetMode: GitTargetMode) {
    setCommitSubmitted(true);
    setCommitError(null);

    if (!commitRepo?.repoPath) {
      setCommitError("Selecciona un repositorio primero.");
      return;
    }

    const commitRef = commitId.trim();
    if (!commitRef) return;

    setCommitScanLoading(true);
    try {
      if (typeof window.ipc.scanCommit !== "function") {
        setCommitError(
          "La app necesita reiniciarse para habilitar la carga por commit.",
        );
        return;
      }

      const statuses = await window.ipc.scanCommit(
        [commitRepo.repoPath],
        commitRef,
      );
      const reposWithChanges = (statuses ?? []).filter(
        (status) => (status?.changes?.length ?? 0) > 0,
      );

      if (!reposWithChanges.length) {
        setCommitError(
          "No se encontraron archivos para ese commit en los repositorios seleccionados.",
        );
        return;
      }

      setGitTargetMode(targetMode);
      setGitData(reposWithChanges);
      setGitModalOpen(true);
      if (targetMode === "create") {
        handleCloseNewTableModal();
      }
    } catch (error: unknown) {
      console.error(error);
      notifyError({
        title: "No se pudo consultar el commit",
        message: errorMessage(error),
      });
    } finally {
      setCommitScanLoading(false);
    }
  }

  function handleOpenCreateManual() {
    setManualMode("create");
    setEditingGroupIndex(null);
    setNewTableView("manual");
    setManualSubmitted(false);
    setManualTableName("");
    setManualRows([{ ...EMPTY_ROW }]);
  }

  function handleOpenEditManual(groupIndex: number) {
    const group = groups[groupIndex];
    if (!group) return;

    setManualMode("edit");
    setEditingGroupIndex(groupIndex);
    setNewTableView("manual");
    setManualSubmitted(false);
    setManualTableName(group.grupo || "");
    const loadedRows = group.items.map((item) =>
      mapItemToManualRow(item, variant),
    );
    setManualRows(loadedRows.length ? loadedRows : [{ ...EMPTY_ROW }]);
    setNewTableModalOpen(true);
  }

  function handleOpenDeleteGroup(groupIndex: number) {
    setGroupToDeleteIndex(groupIndex);
    setDeleteModalOpen(true);
  }

  function handleCloseDeleteModal() {
    setDeleteModalOpen(false);
    setGroupToDeleteIndex(null);
  }

  function handleConfirmDeleteGroup() {
    if (groupToDeleteIndex === null) return;
    setGroups((prev: PiezasGrupo[]) =>
      prev.filter((_, index) => index !== groupToDeleteIndex),
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
    setGroups(orderDraft);
    handleCloseOrderModal();
  }

  const selectedGroupName =
    groupToDeleteIndex !== null
      ? (groups[groupToDeleteIndex]?.grupo ?? "")
      : "";

  function handleManualNameChange(index: number, value: string) {
    setManualRows((prev) => {
      const next = [...prev];
      const row = { ...next[index] };
      row.nombre = value;
      const inferredType = extFromFileName(value);

      if (
        inferredType === "XQUERY" ||
        inferredType === "BUSINESS" ||
        !row.tipoLocked
      ) {
        row.tipo = inferredType;
      }

      next[index] = row;
      return next;
    });
  }

  function handleManualFieldChange<K extends keyof ManualRow>(
    index: number,
    key: K,
    value: ManualRow[K],
  ) {
    setManualRows((prev) => {
      const next = [...prev];
      const row = { ...next[index], [key]: value };

      if (key === "tipo") {
        const tipoValue = String(value ?? "").trim();
        if (!row.nombre.trim() && tipoValue) {
          row.tipoLocked = true;
        }
      }

      next[index] = row;
      return next;
    });
  }

  function handleAddManualRow() {
    setManualSubmitted(false);
    setManualRows((prev) => [...prev, { ...EMPTY_ROW }]);
  }

  function moveManualRow(from: number, to: number) {
    setManualRows((prev) => moveListItem(prev, from, to));
  }

  function handleRemoveManualRow(index: number) {
    setManualRows((prev) => {
      if (prev.length === 1) return [{ ...EMPTY_ROW }];
      return prev.filter((_, i) => i !== index);
    });
  }

  function isManualTableValid() {
    const hasTitle = Boolean(manualTableName.trim());
    if (!hasTitle) return false;

    return manualRows.every((row) => {
      const baseValid = Boolean(row.nombre.trim()) && Boolean(row.tipo.trim());
      if (!baseValid) return false;
      if (variant !== "fixes") return true;
      return (
        Boolean(row.identificador.trim()) &&
        Boolean(row.fechaHoraModificacion.trim())
      );
    });
  }

  function handleSubmitManualTable() {
    setManualSubmitted(true);
    if (!isManualTableValid()) return;

    const items = toGroupsData(manualRows, variant);

    if (manualMode === "edit" && editingGroupIndex !== null) {
      setGroups((prev: PiezasGrupo[]) =>
        prev.map((group, index) =>
          index === editingGroupIndex
            ? { ...group, grupo: manualTableName.trim(), items }
            : group,
        ),
      );
    } else {
      const newGroup: PiezasGrupo = {
        grupo: manualTableName.trim(),
        items,
      };

      setScrollToLastGroup(true);
      setGroups((prev: PiezasGrupo[]) => [...prev, newGroup]);
    }

    handleCloseNewTableModal();
  }

  async function getLastModifiedByPath(repoPath: string, paths: string[]) {
    if (variant !== "fixes") return {} as Record<string, string>;
    if (typeof window.ipc.gitLastModified !== "function") return {};

    try {
      return await window.ipc.gitLastModified(repoPath, paths);
    } catch (error) {
      console.warn(
        "No se pudo obtener fecha/hora de modificación desde git",
        error,
      );
      return {};
    }
  }

  const pageTitle =
    variant === "fixes"
      ? "Listado de piezas detalladas (BF / HF / Incidencia)"
      : "Listado de piezas detalladas";

  return (
    <>
      <Flex align="center" justify="space-between">
        <Title order={2}>{pageTitle}</Title>
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
            onClick={() => setNewTableModalOpen(true)}
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
            Las tablas con las piezas detalladas se mostrarán aquí
          </Text>
        </Flex>
      ) : (
        <SimpleGrid cols={{ base: 1, sm: 2 }} mt="md">
          {groups.map((grupo: PiezasGrupo, index: number) => (
            <Flex
              key={grupo.grupo + index}
              direction="column"
              gap="xs"
              style={{ minWidth: 0 }}
              ref={(el) => {
                groupRefs.current[index] = el;
              }}
            >
              <Card radius="sm">
                <Stack gap="xs">
                  <Flex gap="xs" align="center" justify="space-between">
                    <Flex gap="xs" align="center">
                      <ThemeIcon radius="sm" color={mainColor}>
                        <Text fw={700}>{index + 1}</Text>
                      </ThemeIcon>
                      <Text>{grupo.grupo}</Text>
                    </Flex>
                    <Flex gap="xs" align="center">
                      <ActionIcon
                        variant="filled"
                        color={mainColor}
                        size="lg"
                        onClick={() => handleOpenEditManual(index)}
                        aria-label="Editar tabla"
                      >
                        <IconEdit size="1.1rem" />
                      </ActionIcon>
                      <ActionIcon
                        variant="filled"
                        color="red"
                        size="lg"
                        onClick={() => handleOpenDeleteGroup(index)}
                        aria-label="Eliminar tabla"
                      >
                        <IconTrash size="1.1rem" />
                      </ActionIcon>
                    </Flex>
                  </Flex>

                  <Table
                    withTableBorder
                    withColumnBorders
                    striped
                    style={{ tableLayout: "fixed" }}
                  >
                    <Table.Thead bg={mainColor} c="white">
                      <Table.Tr>
                        <Table.Th
                          style={{ width: variant === "fixes" ? "25%" : "45%" }}
                        >
                          Nombre
                        </Table.Th>
                        <Table.Th
                          style={{ width: variant === "fixes" ? "12%" : "25%" }}
                        >
                          Tipo
                        </Table.Th>
                        <Table.Th
                          style={{ width: variant === "fixes" ? "15%" : "30%" }}
                        >
                          {variant === "fixes"
                            ? "Incidencia"
                            : "Nuevo o modificado"}
                        </Table.Th>
                        {variant === "fixes" ? (
                          <>
                            <Table.Th style={{ width: "25%" }}>
                              Fecha/hora modificación
                            </Table.Th>
                            <Table.Th style={{ width: "22%" }}>
                              Nuevo o modificado
                            </Table.Th>
                          </>
                        ) : null}
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {grupo.items.map((item, i) => (
                        <Table.Tr key={i}>
                          <Table.Td style={{ minWidth: 0 }}>
                            <TruncatedNameCell value={item.nombre} />
                          </Table.Td>
                          <Table.Td>
                            <Text truncate size="sm">
                              {item.tipo}
                            </Text>
                          </Table.Td>
                          <Table.Td>
                            <Text truncate size="sm">
                              {variant === "fixes"
                                ? normalizeIdentifier(item.identificador)
                                : item.estado}
                            </Text>
                          </Table.Td>
                          {variant === "fixes" ? (
                            <>
                              <Table.Td>
                                <Text truncate size="sm">
                                  {toDateTimeDisplayValue(
                                    item.fechaHoraModificacion,
                                  ) || "-"}
                                </Text>
                              </Table.Td>
                              <Table.Td>
                                <Text truncate size="sm">
                                  {item.estado}
                                </Text>
                              </Table.Td>
                            </>
                          ) : null}
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </Stack>
              </Card>
            </Flex>
          ))}
        </SimpleGrid>
      )}

      <Modal
        opened={newTableModalOpen}
        onClose={handleCloseNewTableModal}
        title={manualMode === "edit" ? "Editar tabla" : "Nueva tabla"}
        centered
        radius="md"
        size={
          newTableView === "options" ? "sm" : variant === "fixes" ? 1040 : 720
        }
        withinPortal={false}
      >
        {newTableView === "options" ? (
          <Stack>
            <Accordion variant="separated" radius="sm">
              <Accordion.Item value="repo">
                <Accordion.Control icon={<IconBrandGithub size="1.1rem" />}>
                  <Text size="sm">Desde repositorio (Github)</Text>
                </Accordion.Control>
                <Accordion.Panel>
                  <Stack>
                    {!commitRepo && (
                      <>
                        <Button
                          onClick={() => handlePickGithub("create")}
                          loading={repoSelectionLoading}
                          color="orange"
                        >
                          Seleccionar repositorio
                        </Button>
                        <Button
                          variant="outline"
                          color="gray"
                          onClick={handleSelectRepoForCommit}
                          loading={commitRepoSelectionLoading}
                        >
                          Recuperar desde commit específico
                        </Button>
                      </>
                    )}
                    {showCommitInput && commitRepo && (
                      <Stack gap="xs">
                        <Card
                          withBorder
                          shadow="sm"
                          radius="md"
                          style={{ width: "100%" }}
                        >
                          <Card.Section withBorder inheritPadding py={5}>
                            <Group justify="space-between" wrap="nowrap">
                              <Text
                                fw={500}
                                size="sm"
                                truncate
                                style={{ flex: 1, minWidth: 0 }}
                              >
                                {commitRepo.repoName}
                              </Text>
                              <Menu
                                withinPortal
                                position="bottom-end"
                                shadow="sm"
                              >
                                <Menu.Target>
                                  <ActionIcon variant="subtle" color="gray">
                                    <IconDots size={16} />
                                  </ActionIcon>
                                </Menu.Target>

                                <Menu.Dropdown>
                                  <Menu.Item
                                    leftSection={
                                      <IconRotateClockwise size={14} />
                                    }
                                    onClick={handleSelectRepoForCommit}
                                  >
                                    Cambiar repositorio
                                  </Menu.Item>
                                  <Menu.Item
                                    leftSection={<IconTrash size={14} />}
                                    color="red"
                                    onClick={handleClearCommitRepo}
                                  >
                                    Quitar repositorio
                                  </Menu.Item>
                                </Menu.Dropdown>
                              </Menu>
                            </Group>
                          </Card.Section>
                        </Card>
                        <TextInput
                          placeholder="ID de commit (corto o completo)"
                          value={commitId}
                          onChange={(e) => setCommitId(e.currentTarget.value)}
                          error={
                            commitSubmitted &&
                            commitRepo?.repoPath &&
                            !commitId.trim()
                              ? "El commit es requerido"
                              : undefined
                          }
                          disabled={!commitRepo}
                        />
                        {commitError ? (
                          <Text c="red" size="sm">
                            {commitError}
                          </Text>
                        ) : null}
                        <Button
                          color={mainColor}
                          onClick={() => handlePickCommit("create")}
                          loading={commitScanLoading}
                          disabled={!commitRepo}
                        >
                          Ver commit
                        </Button>
                      </Stack>
                    )}
                  </Stack>
                </Accordion.Panel>
              </Accordion.Item>
            </Accordion>
            <Button color={mainColor} onClick={handleOpenCreateManual}>
              Crear manualmente
            </Button>
          </Stack>
        ) : (
          <Stack>
            <TextInput
              label={
                <>
                  <span>Nombre de la tabla </span>
                  <Text span c={mainColor} inherit>
                    ({manualRowsCountLabel})
                  </Text>
                </>
              }
              placeholder="Ej. Listado de piezas detalladas"
              value={manualTableName}
              onChange={(e) => setManualTableName(e.currentTarget.value)}
              style={{ width: "100%" }}
              error={
                manualSubmitted && !manualTableName.trim()
                  ? "El título es requerido"
                  : undefined
              }
            />

            <ScrollArea
              h={360}
              type="hover"
              scrollbars="y"
              offsetScrollbars={false}
            >
              <Stack gap="xs">
                {manualRows.map((row, index) => (
                  <Flex
                    key={index}
                    gap="xs"
                    align="flex-start"
                    wrap="nowrap"
                    style={{ width: "100%" }}
                  >
                    <TextInput
                      style={{
                        flex: variant === "fixes" ? 1.7 : 2.4,
                        minWidth: 0,
                      }}
                      placeholder="Nombre"
                      value={row.nombre}
                      onChange={(e) =>
                        handleManualNameChange(index, e.currentTarget.value)
                      }
                      error={
                        manualSubmitted && !row.nombre.trim()
                          ? "Nombre requerido"
                          : undefined
                      }
                    />
                    <TextInput
                      style={{
                        flex: variant === "fixes" ? 1 : 1.1,
                        minWidth: 0,
                      }}
                      placeholder="Tipo"
                      value={row.tipo}
                      onChange={(e) =>
                        handleManualFieldChange(
                          index,
                          "tipo",
                          e.currentTarget.value,
                        )
                      }
                      error={
                        manualSubmitted && !row.tipo.trim()
                          ? "Tipo requerido"
                          : undefined
                      }
                    />
                    {variant === "fixes" ? (
                      <>
                        <Select
                          style={{ flex: 1, minWidth: 0 }}
                          placeholder="Identificador"
                          data={FIX_IDENTIFIER_OPTIONS.map((value) => ({
                            value,
                            label: value,
                          }))}
                          value={row.identificador}
                          onChange={(value) =>
                            handleManualFieldChange(
                              index,
                              "identificador",
                              normalizeIdentifier(value),
                            )
                          }
                          allowDeselect={false}
                          error={
                            manualSubmitted && !row.identificador.trim()
                              ? "Identificador requerido"
                              : undefined
                          }
                        />
                        <TextInput
                          type="datetime-local"
                          style={{ flex: 1.5, minWidth: 0 }}
                          placeholder="Fecha/hora modificación"
                          value={row.fechaHoraModificacion}
                          onChange={(e) =>
                            handleManualFieldChange(
                              index,
                              "fechaHoraModificacion",
                              e.currentTarget.value,
                            )
                          }
                          error={
                            manualSubmitted && !row.fechaHoraModificacion.trim()
                              ? "Fecha/hora requerida"
                              : undefined
                          }
                        />
                        <Select
                          style={{ flex: 1, minWidth: 0 }}
                          placeholder="Nuevo o modificado"
                          data={[
                            { value: "Nuevo", label: "Nuevo" },
                            { value: "Modificado", label: "Modificado" },
                          ]}
                          value={row.estado}
                          onChange={(value) =>
                            handleManualFieldChange(
                              index,
                              "estado",
                              (value as "Nuevo" | "Modificado") || "Nuevo",
                            )
                          }
                          allowDeselect={false}
                        />
                      </>
                    ) : (
                      <Select
                        style={{ flex: 1.1, minWidth: 0 }}
                        placeholder="Nuevo o modificado"
                        data={[
                          { value: "Nuevo", label: "Nuevo" },
                          { value: "Modificado", label: "Modificado" },
                        ]}
                        value={row.estado}
                        onChange={(value) =>
                          handleManualFieldChange(
                            index,
                            "estado",
                            (value as "Nuevo" | "Modificado") || "Nuevo",
                          )
                        }
                        allowDeselect={false}
                      />
                    )}

                    <ActionIcon
                      variant="light"
                      color={mainColor}
                      onClick={() => moveManualRow(index, index - 1)}
                      disabled={index === 0}
                      aria-label="Mover arriba"
                      mt={5}
                    >
                      <IconArrowUp size={16} />
                    </ActionIcon>

                    <ActionIcon
                      variant="light"
                      color={mainColor}
                      onClick={() => moveManualRow(index, index + 1)}
                      disabled={index === manualRows.length - 1}
                      aria-label="Mover abajo"
                      mt={5}
                    >
                      <IconArrowDown size={16} />
                    </ActionIcon>

                    <ActionIcon
                      variant="light"
                      color="red"
                      onClick={() => handleRemoveManualRow(index)}
                      aria-label="Eliminar fila"
                      mt={5}
                    >
                      <IconTrash size={16} />
                    </ActionIcon>
                  </Flex>
                ))}
              </Stack>
            </ScrollArea>

            <Flex gap="xs" justify="flex-end">
              <Button
                color="gray"
                variant="outline"
                onClick={handleAddManualRow}
              >
                Añadir fila
              </Button>
              <Button color={mainColor} onClick={handleSubmitManualTable}>
                {manualMode === "edit" ? "Guardar cambios" : "Crear tabla"}
              </Button>
            </Flex>
          </Stack>
        )}
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
            ¿Estás seguro de que deseas eliminar la tabla{" "}
            <Text span fw={700}>
              &quot;{selectedGroupName}&quot;
            </Text>
            ? Esta acción no se puede deshacer.
          </Text>
          <Flex justify="flex-end" gap="xs">
            <Button variant="default" onClick={handleCloseDeleteModal}>
              Cancelar
            </Button>
            <Button color="red" onClick={handleConfirmDeleteGroup}>
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
                    key={`${group.grupo}-${index}`}
                    justify="space-between"
                    align="center"
                    p="xs"
                    style={{
                      border: "1px solid var(--mantine-color-dark-4)",
                      borderRadius: 8,
                    }}
                  >
                    <Text truncate style={{ flex: 1, minWidth: 0 }}>
                      {index + 1}. {group.grupo}
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

      <GitChangesModal
        opened={gitModalOpen}
        onClose={() => setGitModalOpen(false)}
        data={gitData}
        loading={repoSelectionLoading || commitScanLoading}
        onCreate={async ({ repo, changes, groupName }) => {
          const paths = changes.map((ch) => ch.path);
          const lastModifiedByPath = await getLastModifiedByPath(
            repo.repoPath,
            paths,
          );

          const items: PiezasItem[] = changes.map((ch) =>
            variant === "fixes"
              ? mapChangeToFixItem(
                  ch,
                  repo.branch,
                  ch.lastModifiedAt || lastModifiedByPath[ch.path],
                )
              : mapChangeToStandardItem(ch),
          );

          if (gitTargetMode === "edit") {
            setManualRows((prev) => {
              const importedRows = items.map((item) =>
                mapItemToManualRow(item, variant),
              );
              const hasSingleEmptyRow =
                prev.length === 1 && isRowEffectivelyEmpty(prev[0]);
              return hasSingleEmptyRow
                ? importedRows
                : [...prev, ...importedRows];
            });
            setManualTableName(
              (prev) => prev || groupName || repo.repoName || "",
            );
            setManualSubmitted(false);
            return;
          }

          const newGroup: PiezasGrupo = {
            grupo: groupName || repo.repoName || `Grupo ${groups.length + 1}`,
            items,
            sourceRepository: repo.repoName || "",
            sourceBranch: repo.branch || "",
          };

          setScrollToLastGroup(true);
          setGroups((prev: PiezasGrupo[]) => [...prev, newGroup]);
        }}
      />
    </>
  );
}
