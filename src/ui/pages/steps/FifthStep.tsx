import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActionIcon,
  Button,
  Divider,
  Group,
  MultiSelect,
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
  const previousInferredRepositoriesRef = useRef<string[]>([]);
  const [pendingRepositoryFocus, setPendingRepositoryFocus] = useState<
    number | null
  >(null);

  const repositories =
    Array.isArray(repositoryNamesRaw) && repositoryNamesRaw.length > 0
      ? repositoryNamesRaw
      : [""];
  const communicationRows =
    Array.isArray(communicationMatrixRaw) && communicationMatrixRaw.length > 0
      ? communicationMatrixRaw
      : [{ ...EMPTY_COMMUNICATION_ROW }];

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
            .map((value) => value.trim())
            .filter((value) => value.length > 0),
        ),
      ).map((value) => ({
        value,
        label: toRepositoryMultiselectLabel(value),
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
    key: keyof CommunicationMatrixRow,
    value: string | string[],
  ) {
    const next = [...communicationRows];
    next[index] = {
      ...next[index],
      [key]: value,
    };
    setCommunicationMatrix(next);
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
                            handleMatrixRowChange(index, "country", value ?? "")
                          }
                          placeholder="País"
                          allowDeselect={false}
                        />
                      </Table.Td>
                      <Table.Td>
                        <TextInput
                          value={row.developerName}
                          onChange={(event) =>
                            handleMatrixRowChange(
                              index,
                              "developerName",
                              event.currentTarget.value,
                            )
                          }
                        />
                      </Table.Td>
                      <Table.Td>
                        <TextInput
                          value={row.developerContact}
                          onChange={(event) =>
                            handleMatrixRowChange(
                              index,
                              "developerContact",
                              event.currentTarget.value,
                            )
                          }
                        />
                      </Table.Td>
                      <Table.Td>
                        <MultiSelect
                          data={repositoryOptions}
                          value={row.repositories}
                          onChange={(value) =>
                            handleMatrixRowChange(index, "repositories", value)
                          }
                          nothingFoundMessage="Sin repositorios"
                          searchable
                          clearable
                          styles={{
                            input: {
                              alignItems: "flex-start",
                              minHeight: 36,
                              height: "auto",
                            },
                            pillsList: {
                              display: "flex",
                              flexWrap: "wrap",
                              rowGap: 6,
                              columnGap: 6,
                            },
                            pill: {
                              maxWidth: "100%",
                            },
                          }}
                        />
                      </Table.Td>
                      <Table.Td>
                        <TextInput
                          value={row.bossName}
                          onChange={(event) =>
                            handleMatrixRowChange(
                              index,
                              "bossName",
                              event.currentTarget.value,
                            )
                          }
                        />
                      </Table.Td>
                      <Table.Td>
                        <TextInput
                          value={row.bossContact}
                          onChange={(event) =>
                            handleMatrixRowChange(
                              index,
                              "bossContact",
                              event.currentTarget.value,
                            )
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
