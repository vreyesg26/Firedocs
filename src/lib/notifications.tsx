import { notifications } from "@mantine/notifications";
import {
  IconAlertTriangle,
  IconCheck,
  IconInfoCircle,
  IconX,
} from "@tabler/icons-react";

type NotificationOptions = {
  title?: string;
  message: string;
};

function normalizeNotificationText(value: string) {
  const trimmed = value.trim();
  return trimmed.replace(/\.$/, "");
}

export function notifySuccess({
  title = "Completado",
  message,
}: NotificationOptions) {
  notifications.show({
    title: normalizeNotificationText(title),
    message: normalizeNotificationText(message),
    color: "green",
    icon: <IconCheck size={16} />,
    position: "bottom-center",
    withCloseButton: false,
  });
}

export function notifyError({ title = "Error", message }: NotificationOptions) {
  notifications.show({
    title: normalizeNotificationText(title),
    message: normalizeNotificationText(message),
    color: "red",
    icon: <IconX size={16} />,
    position: "bottom-center",
    withCloseButton: false,
  });
}

export function notifyWarning({
  title = "Atención",
  message,
}: NotificationOptions) {
  notifications.show({
    title: normalizeNotificationText(title),
    message: normalizeNotificationText(message),
    color: "yellow",
    icon: <IconAlertTriangle size={16} />,
    position: "bottom-center",
    withCloseButton: false,
  });
}

export function notifyInfo({
  title = "Información",
  message,
}: NotificationOptions) {
  notifications.show({
    title: normalizeNotificationText(title),
    message: normalizeNotificationText(message),
    color: "blue",
    icon: <IconInfoCircle size={16} />,
    position: "bottom-center",
    withCloseButton: false,
  });
}
