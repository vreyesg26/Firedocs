import { useEffect, useRef, useState } from "react";
import {
  ActionIcon,
  Button,
  Card,
  Divider,
  Flex,
  Modal,
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
import { notifySuccess } from "@/lib/notifications";
import type {
  BackupHeaderOneRow,
  BackupHeaderThreeRow,
  BackupProcedureRow,
  BackupTableGroup,
} from "@/types/manual";
import { moveListItem } from "./piecesStepUtils";

const EMPTY_HEADER_ONE: BackupHeaderOneRow = {
  responsibleTeam: "",
  databaseOrDirectory: "",
  application: "",
};

const EMPTY_PROCEDURE_ROW: BackupProcedureRow = {
  step: "",
  objectToBackup: "",
};

const EMPTY_HEADER_THREE: BackupHeaderThreeRow = {
  server: "",
  additionalComments: "",
};

type ModalMode = "create" | "edit";
type BackupTablesVariant = "standard" | "fixes";

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
  },
};

function buildSequentialBackupTitles(groups: BackupTableGroup[]) {
  return groups.map((group, index) => ({
    ...group,
    title: `Tabla ${index + 1}`,
  }));
}

function getTableLabel(group: BackupTableGroup, fallbackIndex: number) {
  return group.title?.trim() || `Tabla ${fallbackIndex + 1}`;
}

function getTableNumber(group: BackupTableGroup, fallbackIndex: number) {
  const match = getTableLabel(group, fallbackIndex).match(/(\d+)$/);
  return match?.[1] ?? String(fallbackIndex + 1);
}

export function BackupTablesStep({
  variant = "standard",
}: {
  variant?: BackupTablesVariant;
}) {
  const manual = useManual() as {
    backupTables?: BackupTableGroup[];
    backupFixTables?: BackupTableGroup[];
    setBackupTables: (
      value:
        | BackupTableGroup[]
        | ((prev: BackupTableGroup[]) => BackupTableGroup[]),
    ) => void;
    setBackupFixTables: (
      value:
        | BackupTableGroup[]
        | ((prev: BackupTableGroup[]) => BackupTableGroup[]),
    ) => void;
  };

  const groups =
    variant === "fixes"
      ? manual.backupFixTables ?? []
      : manual.backupTables ?? [];
  const setGroups =
    variant === "fixes" ? manual.setBackupFixTables : manual.setBackupTables;
  const sectionTitle =
    variant === "fixes" ? "Respaldo de objetos - Fixes" : "Respaldo de objetos";
  const emptyStateText =
    variant === "fixes"
      ? "Las tablas de respaldo de fixes se mostrarán aquí"
      : "Las tablas de respaldo se mostrarán aquí";
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>("create");
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [groupToDeleteIndex, setGroupToDeleteIndex] = useState<number | null>(
    null,
  );
  const [orderModalOpen, setOrderModalOpen] = useState(false);
  const [orderDraft, setOrderDraft] = useState<BackupTableGroup[]>([]);
  const [headerOne, setHeaderOne] = useState<BackupHeaderOneRow>({
    ...EMPTY_HEADER_ONE,
  });
  const [procedureRows, setProcedureRows] = useState<BackupProcedureRow[]>([
    { ...EMPTY_PROCEDURE_ROW },
  ]);
  const [headerThree, setHeaderThree] = useState<BackupHeaderThreeRow>({
    ...EMPTY_HEADER_THREE,
  });
  const [submitted, setSubmitted] = useState(false);
  const [scrollToLastGroup, setScrollToLastGroup] = useState(false);
  const groupRefs = useRef<Array<HTMLDivElement | null>>([]);

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
    setSubmitted(false);
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
    setSubmitted(false);
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
    const deletedGroupName = selectedGroupName || "sin nombre";

    setGroups((prev) =>
      buildSequentialBackupTitles(
        prev.filter((_, index) => index !== groupToDeleteIndex),
      ),
    );
    handleCloseDeleteModal();
    notifySuccess({
      title: "Tabla eliminada",
      message: `La tabla "${deletedGroupName}" se eliminó correctamente`,
    });
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
    setGroups(buildSequentialBackupTitles(orderDraft));
    handleCloseOrderModal();
  }

  function handleHeaderOneChange<K extends keyof BackupHeaderOneRow>(
    key: K,
    value: BackupHeaderOneRow[K],
  ) {
    setHeaderOne((prev) => ({ ...prev, [key]: value }));
  }

  function handleProcedureRowChange<K extends keyof BackupProcedureRow>(
    index: number,
    key: K,
    value: BackupProcedureRow[K],
  ) {
    setProcedureRows((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [key]: value };
      return next;
    });
  }

  function handleHeaderThreeChange<K extends keyof BackupHeaderThreeRow>(
    key: K,
    value: BackupHeaderThreeRow[K],
  ) {
    setHeaderThree((prev) => ({ ...prev, [key]: value }));
  }

  function handleAddProcedureRow() {
    setSubmitted(false);
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

  function isProcedureRowValid(row: BackupProcedureRow) {
    return Boolean(row.step.trim()) && Boolean(row.objectToBackup.trim());
  }

  function isTableValid() {
    return (
      Boolean(headerOne.responsibleTeam.trim()) &&
      Boolean(headerOne.databaseOrDirectory.trim()) &&
      Boolean(headerOne.application.trim()) &&
      procedureRows.every(isProcedureRowValid) &&
      Boolean(headerThree.server.trim()) &&
      Boolean(headerThree.additionalComments.trim())
    );
  }

  function handleSubmit() {
    setSubmitted(true);
    if (!isTableValid()) return;

    const nextGroup: BackupTableGroup = {
      title:
        modalMode === "edit" && editingIndex !== null
          ? groups[editingIndex]?.title || `Tabla ${editingIndex + 1}`
          : `Tabla ${groups.length + 1}`,
      headerOne: {
        responsibleTeam: headerOne.responsibleTeam.trim(),
        databaseOrDirectory: headerOne.databaseOrDirectory.trim(),
        application: headerOne.application.trim(),
      },
      procedureRows: procedureRows.map((row) => ({
        step: row.step.trim(),
        objectToBackup: row.objectToBackup.trim(),
      })),
      headerThree: {
        server: headerThree.server.trim(),
        additionalComments: headerThree.additionalComments.trim(),
      },
    };

    if (modalMode === "edit" && editingIndex !== null) {
      setGroups((prev) =>
        prev.map((group, index) => (index === editingIndex ? nextGroup : group)),
      );
    } else {
      setScrollToLastGroup(true);
      setGroups((prev) => [...prev, nextGroup]);
    }

    handleCloseModal();
  }

  const selectedGroupName =
    groupToDeleteIndex !== null ? groups[groupToDeleteIndex]?.title ?? "" : "";

  return (
    <>
      <Flex align="center" justify="space-between">
        <Title order={2}>{sectionTitle}</Title>
        <Flex align="center" gap="xs">
          {groups.length > 1 && (
            <Button
              variant="default"
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
        <SimpleGrid cols={{ base: 1, sm: 2 }} mt="md" spacing="xs">
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
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th
                          style={{
                            background: mainColor,
                            color: "white",
                            textAlign: "center",
                            fontWeight: 700,
                          }}
                        >
                          Equipo encargado de respaldo:
                        </Table.Th>
                        <Table.Th
                          style={{
                            background: mainColor,
                            color: "white",
                            textAlign: "center",
                            fontWeight: 700,
                          }}
                        >
                          Base de datos/Directorio (SQR-SQT)
                        </Table.Th>
                        <Table.Th
                          style={{
                            background: mainColor,
                            color: "white",
                            textAlign: "center",
                            fontWeight: 700,
                          }}
                        >
                          Aplicativo:
                        </Table.Th>
                      </Table.Tr>
                    </Table.Thead>

                    <Table.Tbody>
                      <Table.Tr>
                        <Table.Td style={{ textAlign: "center" }}>
                          {group.headerOne.responsibleTeam}
                        </Table.Td>
                        <Table.Td style={{ textAlign: "center" }}>
                          {group.headerOne.databaseOrDirectory}
                        </Table.Td>
                        <Table.Td style={{ textAlign: "center" }}>
                          {group.headerOne.application}
                        </Table.Td>
                      </Table.Tr>

                      <Table.Tr>
                        <Table.Td
                          style={{
                            background: mainColor,
                            color: "white",
                            textAlign: "center",
                            fontWeight: 700,
                            width: 180,
                          }}
                        >
                          Paso
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
                          Objeto a respaldar
                        </Table.Td>
                      </Table.Tr>

                      {group.procedureRows.map((row, rowIndex) => (
                        <Table.Tr key={`${group.title}-${rowIndex}`}>
                          <Table.Td
                            style={{
                              whiteSpace: "pre-wrap",
                              verticalAlign: "middle",
                              width: 180,
                              textAlign: "center",
                            }}
                          >
                            {row.step}
                          </Table.Td>
                          <Table.Td
                            colSpan={2}
                            style={{
                              whiteSpace: "pre-wrap",
                              verticalAlign: "middle",
                              textAlign: "center",
                            }}
                          >
                            {row.objectToBackup}
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
                          Servidor (Nombre, IP)
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
                          }}
                        >
                          {group.headerThree.server}
                        </Table.Td>
                        <Table.Td
                          colSpan={2}
                          style={{
                            whiteSpace: "pre-wrap",
                            verticalAlign: "middle",
                            textAlign: "center",
                          }}
                        >
                          {group.headerThree.additionalComments}
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
        size={980}
        withinPortal={false}
      >
        <Stack>
          <Stack gap="xs">
            <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="xs">
              <TextInput
                label="Equipo encargado de respaldo"
                value={headerOne.responsibleTeam}
                onChange={(event) =>
                  handleHeaderOneChange(
                    "responsibleTeam",
                    event.currentTarget.value,
                  )
                }
                error={
                  submitted && !headerOne.responsibleTeam.trim()
                    ? "Campo requerido"
                    : undefined
                }
                styles={centeredTextInputStyles}
              />
              <TextInput
                label="Base de datos/Directorio (SQR-SQT)"
                value={headerOne.databaseOrDirectory}
                onChange={(event) =>
                  handleHeaderOneChange(
                    "databaseOrDirectory",
                    event.currentTarget.value,
                  )
                }
                error={
                  submitted && !headerOne.databaseOrDirectory.trim()
                    ? "Campo requerido"
                    : undefined
                }
                styles={centeredTextInputStyles}
              />
              <TextInput
                label="Aplicativo"
                value={headerOne.application}
                onChange={(event) =>
                  handleHeaderOneChange("application", event.currentTarget.value)
                }
                error={
                  submitted && !headerOne.application.trim()
                    ? "Campo requerido"
                    : undefined
                }
                styles={centeredTextInputStyles}
              />
            </SimpleGrid>
          </Stack>

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

                    <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs">
                      <Textarea
                        label="Paso"
                        autosize
                        minRows={2}
                        value={row.step}
                        onChange={(event) =>
                          handleProcedureRowChange(
                            index,
                            "step",
                            event.currentTarget.value,
                          )
                        }
                        error={
                          submitted && !row.step.trim()
                            ? "Campo requerido"
                            : undefined
                        }
                        styles={centeredTextareaStyles}
                      />
                      <Textarea
                        label="Objeto a respaldar"
                        autosize
                        minRows={2}
                        value={row.objectToBackup}
                        onChange={(event) =>
                          handleProcedureRowChange(
                            index,
                            "objectToBackup",
                            event.currentTarget.value,
                          )
                        }
                        error={
                          submitted && !row.objectToBackup.trim()
                            ? "Campo requerido"
                            : undefined
                        }
                        styles={centeredTextareaStyles}
                      />
                    </SimpleGrid>
                  </Stack>
                </Card>
              ))}
            </Stack>
          </Stack>

          <Stack gap="xs">
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs">
              <Textarea
                label="Servidor (Nombre, IP)"
                autosize
                minRows={2}
                value={headerThree.server}
                onChange={(event) =>
                  handleHeaderThreeChange("server", event.currentTarget.value)
                }
                error={
                  submitted && !headerThree.server.trim()
                    ? "Campo requerido"
                    : undefined
                }
                styles={centeredTextareaStyles}
              />
              <Textarea
                label="Comentarios adicionales"
                autosize
                minRows={2}
                value={headerThree.additionalComments}
                onChange={(event) =>
                  handleHeaderThreeChange(
                    "additionalComments",
                    event.currentTarget.value,
                  )
                }
                error={
                  submitted && !headerThree.additionalComments.trim()
                    ? "Campo requerido"
                    : undefined
                }
                styles={centeredTextareaStyles}
              />
            </SimpleGrid>
          </Stack>

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
          {orderDraft.map((group, index) => (
            <Card key={`${group.title}-${index}`} withBorder radius="md" p="sm">
              <Flex align="center" justify="space-between" gap="sm">
                <Flex align="center" gap="xs" style={{ minWidth: 0 }}>
                  <ThemeIcon radius="sm" color={mainColor}>
                    <Text fw={700}>{getTableNumber(group, index)}</Text>
                  </ThemeIcon>
                  <Text truncate>{getTableLabel(group, index)}</Text>
                </Flex>
                <Flex gap="xs">
                  <ActionIcon
                    variant="light"
                    color="gray"
                    onClick={() => moveOrderDraft(index, index - 1)}
                    disabled={index === 0}
                    aria-label="Mover arriba"
                  >
                    <IconArrowUp size="1rem" />
                  </ActionIcon>
                  <ActionIcon
                    variant="light"
                    color="gray"
                    onClick={() => moveOrderDraft(index, index + 1)}
                    disabled={index === orderDraft.length - 1}
                    aria-label="Mover abajo"
                  >
                    <IconArrowDown size="1rem" />
                  </ActionIcon>
                </Flex>
              </Flex>
            </Card>
          ))}

          <Flex justify="flex-end" gap="sm">
            <Button variant="default" onClick={handleCloseOrderModal}>
              Cancelar
            </Button>
            <Button color={mainColor} onClick={handleApplyOrder}>
              Aplicar orden
            </Button>
          </Flex>
        </Stack>
      </Modal>
    </>
  );
}
