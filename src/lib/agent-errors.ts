export function friendlyError(msg?: string): string {
  if (!msg) return "Error desconocido"
  if (msg.includes("command not found") && msg.includes("systemctl")) {
    return "Este sistema no usa systemctl (¿entorno de desarrollo en macOS/Windows?)"
  }
  if (/EACCES|permission denied/i.test(msg)) {
    return "El agente no tiene permisos suficientes — debe ejecutarse como root"
  }
  if (msg.includes("ENOENT")) {
    return "Archivo del sistema no encontrado"
  }
  if (msg === "Agent no disponible") {
    return "Agente no disponible"
  }
  return msg
}
