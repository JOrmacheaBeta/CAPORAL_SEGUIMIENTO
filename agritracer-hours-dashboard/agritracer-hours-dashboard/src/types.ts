export interface AgritracerRecord {
  codigo_tareo: string;
  empresa: string;
  fundo?: string;
  lote?: string;
  tipo_proyecto: string;
  codigo_trabajador?: string;
  dni: string;
  trabajador: string;
  turno: string;
  actividad: string;
  cod_ceco_pep_orden_obra: string;
  ceco_pep_orden_obra: string;
  lecturador: string;
  codigo_grupo?: string;
  avance_actividad?: number;
  avance_cosecha?: number;
  fecha: string;
  hora_inicio: string;
  hora_fin: string;
  total_horas: string; // PostgreSQL interval
  horas_pago: string; // PostgreSQL interval
  registro_manual?: string;
  registro_web?: string;
  tipo_salida?: string;
  marcacion?: string;
}

export interface DashboardMetrics {
  totalHours: number;
  averageHoursPerDay: number;
  totalWorkers: number;
  totalRecords: number;
}

export interface TrainingRecord {
  id_capacitacion: number;
  dni: string;
  programa: string;
  estado: string;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  fecha_registro: string | null;
  anio: number | null;
  dias_caporal: number | null;
  dias_asistencia: number | null;
  t_trabajador?: WorkerRecord;
}

export interface WorkerRecord {
  dni: string;
  trabajador: string;
  codigo_trabajador: string | null;
  fecha_creacion: string | null;
  telefono_principal: string | null;
  tiene_whatsapp: boolean | null;
  procedencia: string | null;
  genero: string | null;
}
