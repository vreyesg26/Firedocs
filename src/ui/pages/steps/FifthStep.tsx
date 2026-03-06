import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActionIcon,
  Button,
  Checkbox,
  Divider,
  Group,
  Modal,
  Paper,
  ScrollArea,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import {
  IconArrowDown,
  IconArrowUp,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import { useManual } from "@/context/ManualContext";
import { moveListItem } from "./piecesStepUtils";
import type { CommunicationMatrixRow, PiezasGrupo } from "@/types/manual";

const COUNTRY_OPTIONS = [
  { value: "HN", label: "HN" },
  { value: "GT", label: "GT" },
  { value: "PA", label: "PA" },
  { value: "NI", label: "NI" },
];

const EMPTY_COMMUNICATION_ROW: CommunicationMatrixRow = {
  country: "HN",
  developerName: "",
  developerContact: "",
  repositories: [],
  repositoriesInput: "",
  pickerRepositories: [],
  bossName: "",
  bossContact: "",
};

function sameStringList(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  return a.every((value, index) => value === b[index]);
}

function toRepositoryMultiselectLabel(repositoryName: string) {
  const trimmed = repositoryName.trim();
  if (!trimmed.includes("/")) return trimmed;

  const parts = trimmed
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean);
  return parts[parts.length - 1] || trimmed;
}

function normalizeRepositoryOptionValue(repositoryName: string) {
  return toRepositoryMultiselectLabel(repositoryName).trim();
}

function normalizeRepositoryValue(value: string) {
  return value.trim();
}

function parseRepositoryInput(value: string) {
  return Array.from(
    new Set(
      value
        .split(",")
        .map(normalizeRepositoryValue)
        .filter((item) => item.length > 0),
    ),
  );
}

function filterPickerRepositories(
  repositories: string[],
  pickerRepositories: string[] | undefined,
) {
  const currentSet = new Set(repositories);
  return (pickerRepositories ?? []).filter((value) => currentSet.has(value));
}

function formatRepositoriesInput(repositories: string[]) {
  return repositories.join(", ");
}

function removeValueAt<T>(values: T[], index: number) {
  return values.filter((_, itemIndex) => itemIndex !== index);
}

function mergeRepositoriesKeepingOrder(
  currentRepositories: string[],
  currentPickerRepositories: string[],
  nextPickerRepositories: string[],
) {
  const currentPickerSet = new Set(currentPickerRepositories);
  const nextPickerSet = new Set(nextPickerRepositories);

  const keptRepositories = currentRepositories.filter(
    (value) => !currentPickerSet.has(value) || nextPickerSet.has(value),
  );

  const keptSet = new Set(keptRepositories);
  const appendedRepositories = nextPickerRepositories.filter(
    (value) => !currentPickerSet.has(value) && !keptSet.has(value),
  );

  return [...keptRepositories, ...appendedRepositories];
}

export const FifthStep = () => {
  const {
    detailedPieces,
    repositoryNames: repositoryNamesRaw,
    setRepositoryNames,
    communicationMatrix: communicationMatrixRaw,
    setCommunicationMatrix,
  } = useManual() as {
    detailedPieces?: PiezasGrupo[];
    repositoryNames?: string[];
    setRepositoryNames: (values: string[]) => void;
    communicationMatrix?: CommunicationMatrixRow[];
    setCommunicationMatrix: (values: CommunicationMatrixRow[]) => void;
  };

  const repositoryInputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const matrixRepositoryInputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const previousInferredRepositoriesRef = useRef<string[]>([]);
  const [pendingRepositoryFocus, setPendingRepositoryFocus] = useState<
    number | null
  >(null);
  const [repositoryPickerRow, setRepositoryPickerRow] = useState<number | null>(
    null,
  );
  const [repositoryPickerSelection, setRepositoryPickerSelection] = useState<
    string[]
  >([]);

  const repositories = useMemo(
    () =>
      Array.isArray(repositoryNamesRaw) && repositoryNamesRaw.length > 0
        ? repositoryNamesRaw
        : [""],
    [repositoryNamesRaw],
  );
  const communicationRows = useMemo(
    () =>
      Array.isArray(communicationMatrixRaw) && communicationMatrixRaw.length > 0
        ? communicationMatrixRaw
        : [{ ...EMPTY_COMMUNICATION_ROW }],
    [communicationMatrixRaw],
  );

  const inferredRepositories = useMemo(() => {
    const names = (detailedPieces ?? [])
      .map((group) => (group?.grupo ?? "").trim())
      .filter((value) => value.length > 0);
    return Array.from(new Set(names));
  }, [detailedPieces]);

  useEffect(() => {
    const cleanedCurrent = (repositoryNamesRaw ?? [])
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
    const previousInferred = previousInferredRepositoriesRef.current;
    const previousInferredSet = new Set(
      previousInferred.map((value) => value.toLowerCase()),
    );
    const inferredSet = new Set(
      inferredRepositories.map((value) => value.toLowerCase()),
    );

    // Preserva entradas manuales, pero mantiene sincronizados los repos
    // que vienen de títulos de tablas en Step 2 (agregar y eliminar).
    const manualEntries = cleanedCurrent.filter(
      (value) =>
        !previousInferredSet.has(value.toLowerCase()) &&
        !inferredSet.has(value.toLowerCase()),
    );
    const next = [...inferredRepositories, ...manualEntries];

    if (!sameStringList(cleanedCurrent, next)) {
      setRepositoryNames(next);
    }

    previousInferredRepositoriesRef.current = inferredRepositories;
  }, [inferredRepositories, repositoryNamesRaw, setRepositoryNames]);

  useEffect(() => {
    if (pendingRepositoryFocus === null) return;
    const target = repositoryInputRefs.current[pendingRepositoryFocus];
    if (target) {
      target.focus();
      setPendingRepositoryFocus(null);
    }
  }, [pendingRepositoryFocus, repositories.length]);

  const repositoryOptions = useMemo(
    () =>
      Array.from(
        new Set(
          repositories
            .map((value) => normalizeRepositoryOptionValue(value))
            .filter((value) => value.length > 0),
        ),
      ).map((value) => ({
        value,
        label: value,
      })),
    [repositories],
  );

  function handleRepositoryChange(index: number, value: string) {
    const next = [...repositories];
    next[index] = value;
    setRepositoryNames(next);
  }

  function handleAddRepository(shouldFocus = false) {
    const next = [...repositories, ""];
    setRepositoryNames(next);
    if (shouldFocus) {
      setPendingRepositoryFocus(next.length - 1);
    }
  }

  function handleMatrixRowChange(
    index: number,
    patch: Partial<CommunicationMatrixRow>,
  ) {
    const next = [...communicationRows];
    next[index] = {
      ...next[index],
      ...patch,
    };
    setCommunicationMatrix(next);
  }

  function handleMatrixRepositoriesInputChange(index: number, value: string) {
    const parsedRepositories = parseRepositoryInput(value);
    const currentRow = communicationRows[index] ?? EMPTY_COMMUNICATION_ROW;
    handleMatrixRowChange(index, {
      repositories: parsedRepositories,
      repositoriesInput: value.replace(/,(?!\s)/g, ", "),
      pickerRepositories: filterPickerRepositories(
        parsedRepositories,
        currentRow.pickerRepositories,
      ),
    });
  }

  function handleOpenRepositoryPicker(index: number) {
    setRepositoryPickerRow(index);
    setRepositoryPickerSelection(
      communicationRows[index]?.pickerRepositories ?? [],
    );
  }

  function handleCloseRepositoryPicker() {
    setRepositoryPickerRow(null);
    setRepositoryPickerSelection([]);
  }

  function handleAddRepositoriesFromPicker() {
    if (repositoryPickerRow === null) return;
    const currentRow =
      communicationRows[repositoryPickerRow] ?? EMPTY_COMMUNICATION_ROW;
    const nextPickerRepositories = Array.from(
      new Set(repositoryPickerSelection),
    );
    const nextRepositories = mergeRepositoriesKeepingOrder(
      currentRow.repositories,
      currentRow.pickerRepositories ?? [],
      nextPickerRepositories,
    );

    handleMatrixRowChange(repositoryPickerRow, {
      repositories: nextRepositories,
      repositoriesInput: formatRepositoriesInput(nextRepositories),
      pickerRepositories: nextPickerRepositories,
    });
    handleCloseRepositoryPicker();
  }

  function handleMatrixRepositoriesKeyDown(
    index: number,
    event: React.KeyboardEvent<HTMLInputElement>,
  ) {
    if (event.key !== "Backspace" && event.key !== "Delete") return;
    if (event.currentTarget.selectionStart !== event.currentTarget.selectionEnd) return;

    const row = communicationRows[index];
    if (!row?.repositories?.length || !row.pickerRepositories?.length) return;

    const value = row.repositories.join(", ");
    const caret = event.currentTarget.selectionStart ?? 0;
    let start = 0;

    for (let tokenIndex = 0; tokenIndex < row.repositories.length; tokenIndex += 1) {
      const token = row.repositories[tokenIndex];
      const end = start + token.length;
      const isPickerRepository = (row.pickerRepositories ?? []).includes(token);

      const shouldRemoveWithBackspace =
        event.key === "Backspace" &&
        isPickerRepository &&
        caret === end &&
        value.slice(end, end + 2) === ", ";
      const shouldRemoveWithDelete =
        event.key === "Delete" &&
        isPickerRepository &&
        caret === start &&
        (start === 0 || value.slice(Math.max(0, start - 2), start) === ", ");

      if (shouldRemoveWithBackspace || shouldRemoveWithDelete) {
        event.preventDefault();
        const nextRepositories = removeValueAt(row.repositories, tokenIndex);
        const nextPickerRepositories = (row.pickerRepositories ?? []).filter(
          (item) => item !== token,
        );

        handleMatrixRowChange(index, {
          repositories: nextRepositories,
          repositoriesInput: formatRepositoriesInput(nextRepositories),
          pickerRepositories: nextPickerRepositories,
        });

        if (repositoryPickerRow === index) {
          setRepositoryPickerSelection(nextPickerRepositories);
        }

        window.requestAnimationFrame(() => {
          const input = matrixRepositoryInputRefs.current[index];
          if (!input) return;
          const nextValue = nextRepositories.join(", ");
          const nextCaret = shouldRemoveWithBackspace
            ? Math.max(0, Math.min(start, nextValue.length))
            : Math.max(0, Math.min(start, nextValue.length));
          input.focus();
          input.setSelectionRange(nextCaret, nextCaret);
        });
        return;
      }

      start = end + 2;
    }

    if (value.length === 0) return;
  }

  function handleAddMatrixRow() {
    setCommunicationMatrix([
      ...communicationRows,
      { ...EMPTY_COMMUNICATION_ROW },
    ]);
  }

  function handleMoveRowUp(index: number) {
    if (index <= 0) return;
    setCommunicationMatrix(moveListItem(communicationRows, index, index - 1));
  }

  function handleMoveRowDown(index: number) {
    if (index >= communicationRows.length - 1) return;
    setCommunicationMatrix(moveListItem(communicationRows, index, index + 1));
  }

  function handleDeleteRow(index: number) {
    const next = communicationRows.filter((_, rowIndex) => rowIndex !== index);
    setCommunicationMatrix(
      next.length ? next : [{ ...EMPTY_COMMUNICATION_ROW }],
    );
  }

  return (
    <>
      <Title order={2}>Repositorios y matriz de comunicación</Title>
      <Divider my="xs" />
      <Modal
        opened={repositoryPickerRow !== null}
        onClose={handleCloseRepositoryPicker}
        title="Agregar repositorios existentes"
        centered
        size="md"
      >
        <Stack gap="lg">
          <Text size="sm" c="dimmed">
            Selecciona uno o varios repositorios para agregarlos al campo actual.
          </Text>
          {repositoryOptions.length > 0 ? (
            <ScrollArea.Autosize mah={260} offsetScrollbars>
              <Checkbox.Group
                value={repositoryPickerSelection}
                onChange={setRepositoryPickerSelection}
              >
                <Stack gap="xs">
                  {repositoryOptions.map((option) => (
                    <Checkbox
                      key={option.value}
                      value={option.value}
                      label={option.label}
                    />
                  ))}
                </Stack>
              </Checkbox.Group>
            </ScrollArea.Autosize>
          ) : (
            <Text size="sm" c="dimmed">
              No hay repositorios disponibles para agregar.
            </Text>
          )}
          <Group justify="space-between" align="center">
            <Text size="sm" c="dimmed">
              {repositoryPickerSelection.length} seleccionados
            </Text>
            <Group gap="sm">
            <Button variant="default" onClick={handleCloseRepositoryPicker}>
              Cancelar
            </Button>
            <Button
              onClick={handleAddRepositoriesFromPicker}
              disabled={repositoryOptions.length === 0}
            >
              Agregar seleccionados
            </Button>
            </Group>
          </Group>
        </Stack>
      </Modal>
      <Stack>
        <Paper withBorder p="sm" radius="sm">
          <Stack gap="xs">
            <Text size="md">Nombre de repositorios</Text>
            {repositories.map((value, index) => (
              <TextInput
                key={`repository-name-${index}`}
                ref={(node) => {
                  repositoryInputRefs.current[index] = node;
                }}
                value={value}
                onChange={(event) =>
                  handleRepositoryChange(index, event.currentTarget.value)
                }
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  if (!value.trim()) return;
                  event.preventDefault();
                  handleAddRepository(true);
                }}
                placeholder={`Repositorio ${index + 1}`}
              />
            ))}
            <Button
              variant="light"
              leftSection={<IconPlus size={16} />}
              onClick={() => handleAddRepository(false)}
              w="fit-content"
            >
              Nuevo repositorio
            </Button>
          </Stack>
        </Paper>

        <Paper withBorder p="sm" radius="sm">
          <Stack gap="xs">
            <Text size="md">Matriz de comunicación del área solicitante</Text>
            <ScrollArea>
              <Table
                withTableBorder
                withColumnBorders
                verticalSpacing="xs"
                horizontalSpacing="xs"
                miw={1100}
                style={{ tableLayout: "fixed" }}
              >
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th style={{ width: "8%" }}>País</Table.Th>
                    <Table.Th style={{ width: "20%" }}>
                      Nombre del desarrollador
                    </Table.Th>
                    <Table.Th style={{ width: "15%" }}>
                      Número de contacto
                    </Table.Th>
                    <Table.Th style={{ width: "22%" }}>
                      Aplicación (Si aplica)
                    </Table.Th>
                    <Table.Th style={{ width: "20%" }}>
                      Nombre del jefe
                    </Table.Th>
                    <Table.Th style={{ width: "15%" }}>
                      Número de contacto
                    </Table.Th>
                    <Table.Th style={{ width: 120 }}>Acciones</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {communicationRows.map((row, index) => (
                    <Table.Tr key={`communication-row-${index}`}>
                      <Table.Td>
                        <Select
                          data={COUNTRY_OPTIONS}
                          value={row.country}
                          onChange={(value) =>
                            handleMatrixRowChange(index, {
                              country: value ?? "",
                            })
                          }
                          placeholder="País"
                          allowDeselect={false}
                        />
                      </Table.Td>
                      <Table.Td>
                        <TextInput
                          value={row.developerName}
                          onChange={(event) =>
                            handleMatrixRowChange(index, {
                              developerName: event.currentTarget.value,
                            })
                          }
                        />
                      </Table.Td>
                      <Table.Td>
                        <TextInput
                          value={row.developerContact}
                          onChange={(event) =>
                            handleMatrixRowChange(index, {
                              developerContact: event.currentTarget.value,
                            })
                          }
                        />
                      </Table.Td>
                      <Table.Td>
                        <Group  wrap="nowrap" gap={4}>
                          <TextInput
                            ref={(node) => {
                              matrixRepositoryInputRefs.current[index] = node;
                            }}
                            value={
                              row.repositoriesInput ??
                              formatRepositoriesInput(row.repositories)
                            }
                            onChange={(event) =>
                              handleMatrixRepositoriesInputChange(
                                index,
                                event.currentTarget.value,
                              )
                            }
                            onKeyDown={(event) =>
                              handleMatrixRepositoriesKeyDown(index, event)
                            }
                            placeholder="Escribe repositorios separados por comas"
                            style={{ flex: 1 }}
                          />
                          <ActionIcon
                            variant="light"
                            onClick={() => handleOpenRepositoryPicker(index)}
                            disabled={repositoryOptions.length === 0}
                            aria-label="Agregar desde repositorios existentes"
                          >
                            <IconPlus size={16} />
                          </ActionIcon>
                        </Group>
                      </Table.Td>
                      <Table.Td>
                        <TextInput
                          value={row.bossName}
                          onChange={(event) =>
                            handleMatrixRowChange(index, {
                              bossName: event.currentTarget.value,
                            })
                          }
                        />
                      </Table.Td>
                      <Table.Td>
                        <TextInput
                          value={row.bossContact}
                          onChange={(event) =>
                            handleMatrixRowChange(index, {
                              bossContact: event.currentTarget.value,
                            })
                          }
                        />
                      </Table.Td>
                      <Table.Td>
                        <Group gap={4} justify="center" wrap="nowrap">
                          <ActionIcon
                            variant="light"
                            onClick={() => handleMoveRowUp(index)}
                            disabled={index === 0}
                            aria-label="Mover fila hacia arriba"
                          >
                            <IconArrowUp size={16} />
                          </ActionIcon>
                          <ActionIcon
                            variant="light"
                            onClick={() => handleMoveRowDown(index)}
                            disabled={index === communicationRows.length - 1}
                            aria-label="Mover fila hacia abajo"
                          >
                            <IconArrowDown size={16} />
                          </ActionIcon>
                          <ActionIcon
                            color="red"
                            variant="light"
                            onClick={() => handleDeleteRow(index)}
                            aria-label="Eliminar fila"
                          >
                            <IconTrash size={16} />
                          </ActionIcon>
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </ScrollArea>
            <Button
              variant="light"
              leftSection={<IconPlus size={16} />}
              onClick={handleAddMatrixRow}
              w="fit-content"
            >
              Nueva fila
            </Button>
          </Stack>
        </Paper>
      </Stack>
    </>
  );
};
