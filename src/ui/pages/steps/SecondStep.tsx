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
  Tooltip,
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

type NewTableView = "options" | "manual";
type ManualMode = "create" | "edit";
type GitTargetMode = "create" | "edit";
type RepoPick = { repoName: string; repoPath: string };

type ManualRow = {
  nombre: string;
  tipo: string;
  estado: "Nuevo" | "Modificado";
  tipoLocked: boolean;
};

const EMPTY_ROW: ManualRow = {
  nombre: "",
  tipo: "",
  estado: "Nuevo",
  tipoLocked: false,
};

function extFromFileName(fileName: string) {
  const trimmed = fileName.trim();
  if (!trimmed.includes(".")) return "";

  const lastPart = trimmed.split(".").pop()?.trim() || "";
  if (!lastPart) return "";

  const ext = lastPart.toUpperCase();
  if (ext === "XQ" || ext === "XQY") return "XQUERY";
  return ext;
}

function TruncatedNameCell({ value }: { value: string }) {
  const [isTruncated, setIsTruncated] = useState(false);
  const textRef = useRef<HTMLParagraphElement | null>(null);

  useEffect(() => {
    const checkTruncation = () => {
      const el = textRef.current;
      if (!el) return;
      setIsTruncated(el.scrollWidth > el.clientWidth);
    };

    checkTruncation();
    window.addEventListener("resize", checkTruncation);
    return () => window.removeEventListener("resize", checkTruncation);
  }, [value]);

  return (
    <Tooltip label={value} withArrow disabled={!isTruncated}>
      <Text ref={textRef} truncate size="sm">
        {value}
      </Text>
    </Tooltip>
  );
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}

export const SecondStep = () => {
  const { data, detailedPieces, setDetailedPieces } = useManual();
  const [newTableModalOpen, setNewTableModalOpen] = useState(false);
  const [newTableView, setNewTableView] = useState<NewTableView>("options");
  const [manualMode, setManualMode] = useState<ManualMode>("create");
  const [editingGroupIndex, setEditingGroupIndex] = useState<number | null>(
    null,
  );

  const [gitModalOpen, setGitModalOpen] = useState(false);
  const [gitLoading, setGitLoading] = useState(false);
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
  const manualRowsCount = manualRows.length;
  const manualRowsCountLabel = `${manualRowsCount} ${
    manualRowsCount === 1 ? "registro" : "registros"
  }`;

  const groups = detailedPieces || [];

  useEffect(() => {
    if (data?.detailedPieces?.length && !groups.length) {
      setDetailedPieces(data.detailedPieces);
    }
  }, [data, groups.length, setDetailedPieces]);

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

  function mapChangeToItem(ch: RepoChange): PiezasItem {
    const name = ch.path.split(/[\\/]/).pop() || ch.path || "Objeto sin nombre";

    const extRaw = ch.ext || name.split(".").pop() || "";
    const ext = extRaw.replace(/^\./, "");
    const extUpper = ext.toUpperCase();
    const tipo =
      extUpper === "XQ" || extUpper === "XQY"
        ? "XQUERY"
        : extUpper || "Archivo";

    let estado: string = "Modificado";
    if (ch.kind === "added") estado = "Nuevo";
    else if (ch.kind === "modified") estado = "Modificado";
    else if (ch.kind === "deleted") estado = "Eliminado";
    else if (ch.kind === "renamed") estado = "Modificado";

    return {
      nombre: name,
      tipo,
      estado,
    };
  }

  function mapItemToManualRow(item: PiezasItem): ManualRow {
    const estado = item.estado === "Nuevo" ? "Nuevo" : "Modificado";

    return {
      nombre: item.nombre ?? "",
      tipo: item.tipo ?? "",
      estado,
      tipoLocked: Boolean(item.tipo?.trim()),
    };
  }

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
    setGitLoading(true);
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
      alert(errorMessage(error));
    } finally {
      setGitLoading(false);
    }
  }

  async function handleSelectRepoForCommit() {
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
      alert(errorMessage(error));
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

    setGitLoading(true);
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
      alert(errorMessage(error));
    } finally {
      setGitLoading(false);
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
    const loadedRows = group.items.map(mapItemToManualRow);
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
    setDetailedPieces((prev: PiezasGrupo[]) =>
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
    setOrderDraft((prev) => {
      if (to < 0 || to >= prev.length) return prev;
      const next = [...prev];
      const [picked] = next.splice(from, 1);
      next.splice(to, 0, picked);
      return next;
    });
  }

  function handleApplyOrder() {
    setDetailedPieces(orderDraft);
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

      if (!row.tipoLocked) {
        row.tipo = extFromFileName(value);
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
    setManualRows((prev) => {
      if (to < 0 || to >= prev.length) return prev;
      const next = [...prev];
      const [picked] = next.splice(from, 1);
      next.splice(to, 0, picked);
      return next;
    });
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

    return manualRows.every(
      (row) => Boolean(row.nombre.trim()) && Boolean(row.tipo.trim()),
    );
  }

  function handleSubmitManualTable() {
    setManualSubmitted(true);
    if (!isManualTableValid()) return;

    const items: PiezasItem[] = manualRows.map((row) => ({
      nombre: row.nombre.trim(),
      tipo: row.tipo.trim(),
      estado: row.estado,
    }));

    if (manualMode === "edit" && editingGroupIndex !== null) {
      setDetailedPieces((prev: PiezasGrupo[]) =>
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
      setDetailedPieces((prev: PiezasGrupo[]) => [...prev, newGroup]);
    }

    handleCloseNewTableModal();
  }

  return (
    <>
      <Flex align="center" justify="space-between">
        <Title order={2}>Listado de piezas detalladas</Title>
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
                <Stack gap='xs'>
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
                        <Table.Th style={{ width: "45%" }}>Nombre</Table.Th>
                        <Table.Th style={{ width: "25%" }}>Tipo</Table.Th>
                        <Table.Th style={{ width: "30%" }}>
                          Nuevo o modificado
                        </Table.Th>
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
                              {item.estado}
                            </Text>
                          </Table.Td>
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
        size={newTableView === "options" ? "sm" : 720}
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
                          loading={gitLoading}
                          color="orange"
                        >
                          Seleccionar repositorio
                        </Button>
                        <Button
                          variant="outline"
                          color="gray"
                          onClick={handleSelectRepoForCommit}
                          loading={gitLoading}
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
                          loading={gitLoading}
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
                      style={{ flex: 2.4, minWidth: 0 }}
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
                      style={{ flex: 1.1, minWidth: 0 }}
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
        loading={gitLoading}
        onCreate={({ repo, changes, groupName }) => {
          const items: PiezasItem[] = changes.map(mapChangeToItem);

          if (gitTargetMode === "edit") {
            setManualRows((prev) => {
              const importedRows = items.map(mapItemToManualRow);
              const hasSingleEmptyRow =
                prev.length === 1 &&
                !prev[0].nombre.trim() &&
                !prev[0].tipo.trim();
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
          };

          setScrollToLastGroup(true);
          setDetailedPieces((prev: PiezasGrupo[]) => [...prev, newGroup]);
        }}
      />
    </>
  );
};
