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

export function notifySuccess({
  title = "Completado",
  message,
}: NotificationOptions) {
  notifications.show({
    title,
    message,
    color: "green",
    icon: <IconCheck size={16} />,
    position: "bottom-center",
  });
}

export function notifyError({ title = "Error", message }: NotificationOptions) {
  notifications.show({
    title,
    message,
    color: "red",
    icon: <IconX size={16} />,
    position: "bottom-center",
  });
}

export function notifyWarning({
  title = "Atencion",
  message,
}: NotificationOptions) {
  notifications.show({
    title,
    message,
    color: "yellow",
    icon: <IconAlertTriangle size={16} />,
    position: "bottom-center",
  });
}

export function notifyInfo({
  title = "Informacion",
  message,
}: NotificationOptions) {
  notifications.show({
    title,
    message,
    color: "blue",
    icon: <IconInfoCircle size={16} />,
    position: "bottom-center",
  });
}
