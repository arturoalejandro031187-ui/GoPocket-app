// Utilidades de validación

export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export function validateUUID(id: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
}

export function validateRequired(value: any, fieldName: string): void {
  if (value === null || value === undefined || value === '') {
    throw new Error(`${fieldName} es requerido`);
  }
}

export function validatePositiveNumber(value: number, fieldName: string): void {
  if (typeof value !== 'number' || value <= 0 || !Number.isFinite(value)) {
    throw new Error(`${fieldName} debe ser un número positivo`);
  }
}

export function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}
