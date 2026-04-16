import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "../../components/ui/table";
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle,
  CardDescription
} from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { 
  Plus, 
  Search, 
  Calendar, 
  Trash2, 
  Edit2, 
  Loader2, 
  AlertCircle,
  Palmtree,
  User,
  ArrowLeft,
  CheckCircle2,
  XCircle
} from "lucide-react";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger,
  DialogFooter,
  DialogDescription
} from "../../components/ui/dialog";
import { 
  format, 
  parseISO, 
  differenceInDays, 
  addDays, 
  isWithinInterval,
  isAfter,
  isBefore,
  startOfDay
} from 'date-fns';
import { es } from 'date-fns/locale';
import { Badge } from "../../components/ui/badge";
import { ScrollArea, ScrollBar } from "../../components/ui/scroll-area";
import { normalizeDni } from '../lib/utils';

interface VacationRecord {
  id_vacacion: number;
  dni: string;
  codigo_trabajador: string;
  fecha_inicio: string;
  fecha_fin: string;
  dias_vacaciones: number;
  fecha_registro: string;
  trabajador_nombre?: string;
}

interface Worker {
  dni: string;
  trabajador: string;
  codigo_trabajador: string | null;
}

export default function GestionVacaciones() {
  const [vacations, setVacations] = useState<VacationRecord[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [currentRecord, setCurrentRecord] = useState<Partial<VacationRecord>>({
    dni: '',
    codigo_trabajador: '',
    fecha_inicio: '',
    fecha_fin: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    try {
      setLoading(true);
      
      // Fetch workers and vacations with a direct join to t_trabajador
      // Note: This assumes a foreign key relationship exists in Supabase
      const [workersRes, vacationsRes] = await Promise.all([
        supabase.from('t_trabajador').select('dni, trabajador, codigo_trabajador'),
        supabase.from('t_vacaciones_trabajador').select(`
          *,
          t_trabajador (
            trabajador,
            codigo_trabajador
          )
        `).order('fecha_inicio', { ascending: false })
      ]);

      if (workersRes.error) throw workersRes.error;
      if (vacationsRes.error) throw vacationsRes.error;

      const workerMapByDni = new Map();
      const workerMapByCode = new Map();
      
      workersRes.data?.forEach(w => {
        const normalizedDni = normalizeDni(w.dni);
        if (w.trabajador && w.trabajador !== 'N/A' && w.trabajador !== 'PENDIENTE NOMBRE') {
          workerMapByDni.set(normalizedDni, w.trabajador);
          if (w.codigo_trabajador) {
            workerMapByCode.set(w.codigo_trabajador.toString().trim(), w.trabajador);
          }
        }
      });

      // Enrich names from rpt_horas_agritracer for those missing
      const { data: historyData } = await supabase
        .from('rpt_horas_agritracer')
        .select('dni, trabajador, codigo_trabajador')
        .not('trabajador', 'is', null)
        .limit(5000);

      if (historyData) {
        historyData.forEach(h => {
          const normalized = normalizeDni(h.dni);
          if (h.trabajador && h.trabajador !== 'N/A' && h.trabajador !== 'PENDIENTE NOMBRE') {
            if (!workerMapByDni.has(normalized)) {
              workerMapByDni.set(normalized, h.trabajador);
            }
            if (h.codigo_trabajador && !workerMapByCode.has(h.codigo_trabajador.toString().trim())) {
              workerMapByCode.set(h.codigo_trabajador.toString().trim(), h.trabajador);
            }
          }
        });
      }

      const enrichedVacations = (vacationsRes.data || []).map(v => {
        const normalizedDni = normalizeDni(v.dni);
        const code = v.codigo_trabajador?.toString().trim();
        
        // 1. Try resolving from the direct join first
        let name = (v as any).t_trabajador?.trabajador;
        
        // 2. If join failed or returned invalid name, try DNI map
        if (!name || name === 'N/A' || name === 'PENDIENTE NOMBRE') {
          name = workerMapByDni.get(normalizedDni);
        }
        
        // 3. Finally try by Code
        if ((!name || name === 'N/A') && code) {
          name = workerMapByCode.get(code);
        }

        return {
          ...v,
          trabajador_nombre: name || 'N/A'
        };
      });

      const enrichedWorkers = (workersRes.data || []).map(w => {
        const normalized = normalizeDni(w.dni);
        const code = w.codigo_trabajador?.toString().trim();
        let name = w.trabajador;
        
        if (!name || name === 'N/A' || name === 'PENDIENTE NOMBRE') {
          name = workerMapByDni.get(normalized) || (code ? workerMapByCode.get(code) : null) || 'N/A';
        }
        
        return { ...w, trabajador: name };
      });

      setWorkers(enrichedWorkers);
      setVacations(enrichedVacations);
    } catch (error: any) {
      console.error('Error fetching data:', error);
      alert("No se pudieron cargar los datos de vacaciones.");
    } finally {
      setLoading(false);
    }
  }

  const filteredVacations = useMemo(() => {
    return vacations.filter(v => 
      v.trabajador_nombre?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      v.dni.includes(searchTerm) ||
      v.codigo_trabajador.includes(searchTerm)
    );
  }, [vacations, searchTerm]);

  const handleAddOrEdit = async () => {
    if (!currentRecord.dni || !currentRecord.fecha_inicio || !currentRecord.fecha_fin) {
      alert("Por favor complete todos los campos requeridos.");
      return;
    }

    if (isBefore(parseISO(currentRecord.fecha_fin!), parseISO(currentRecord.fecha_inicio!))) {
      alert("La fecha de fin no puede ser anterior a la fecha de inicio.");
      return;
    }

    try {
      setIsSubmitting(true);
      
      const selectedWorker = workers.find(w => normalizeDni(w.dni) === normalizeDni(currentRecord.dni!));
      const payload = {
        dni: currentRecord.dni,
        codigo_trabajador: selectedWorker?.codigo_trabajador || 'N/A',
        fecha_inicio: currentRecord.fecha_inicio,
        fecha_fin: currentRecord.fecha_fin
      };

      if (isEditing && currentRecord.id_vacacion) {
        const { error } = await supabase
          .from('t_vacaciones_trabajador')
          .update(payload)
          .eq('id_vacacion', currentRecord.id_vacacion);
        
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('t_vacaciones_trabajador')
          .insert([payload]);
        
        if (error) throw error;
      }

      setIsAddDialogOpen(false);
      resetForm();
      fetchData();
    } catch (error: any) {
      console.error('Error saving vacation:', error);
      alert(error.message || "No se pudo guardar el registro.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('¿Está seguro de eliminar este registro de vacaciones?')) return;

    try {
      const { error } = await supabase
        .from('t_vacaciones_trabajador')
        .delete()
        .eq('id_vacacion', id);
      
      if (error) throw error;
      fetchData();
    } catch (error: any) {
      console.error('Error deleting vacation:', error);
      alert("No se pudo eliminar el registro.");
    }
  };

  const resetForm = () => {
    setCurrentRecord({
      dni: '',
      codigo_trabajador: '',
      fecha_inicio: '',
      fecha_fin: ''
    });
    setIsEditing(false);
  };

  const openEditDialog = (record: VacationRecord) => {
    setCurrentRecord(record);
    setIsEditing(true);
    setIsAddDialogOpen(true);
  };

  const getStatusBadge = (start: string, end: string) => {
    const today = startOfDay(new Date());
    const startDate = startOfDay(parseISO(start));
    const endDate = startOfDay(parseISO(end));

    if (isWithinInterval(today, { start: startDate, end: endDate })) {
      return <Badge className="bg-emerald-500 hover:bg-emerald-600">En Curso</Badge>;
    } else if (isAfter(startDate, today)) {
      return <Badge variant="outline" className="text-amber-600 border-amber-200 bg-amber-50">Programada</Badge>;
    } else {
      return <Badge variant="secondary" className="text-slate-500">Finalizada</Badge>;
    }
  };

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Palmtree className="w-8 h-8 text-emerald-600" />
            Gestión de Vacaciones
          </h1>
          <p className="text-muted-foreground">Administre los periodos de descanso del personal.</p>
        </div>
        
        <Dialog open={isAddDialogOpen} onOpenChange={(open) => {
          setIsAddDialogOpen(open);
          if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button className="bg-emerald-600 hover:bg-emerald-700 gap-2 font-bold shadow-lg shadow-emerald-600/20">
              <Plus className="w-4 h-4" />
              Programar Vacaciones
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>{isEditing ? 'Editar Vacaciones' : 'Programar Vacaciones'}</DialogTitle>
              <DialogDescription>
                Ingrese los detalles del periodo vacacional para el trabajador.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <label className="text-sm font-bold text-slate-700">Trabajador</label>
                <select 
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  value={currentRecord.dni}
                  onChange={(e) => setCurrentRecord({...currentRecord, dni: e.target.value})}
                  disabled={isEditing}
                >
                  <option value="">Seleccione un trabajador</option>
                  {workers.map(w => (
                    <option key={w.dni} value={w.dni}>{w.trabajador} ({w.dni})</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <label className="text-sm font-bold text-slate-700">Fecha Inicio</label>
                  <Input 
                    type="date" 
                    value={currentRecord.fecha_inicio}
                    onChange={(e) => setCurrentRecord({...currentRecord, fecha_inicio: e.target.value})}
                  />
                </div>
                <div className="grid gap-2">
                  <label className="text-sm font-bold text-slate-700">Fecha Fin</label>
                  <Input 
                    type="date" 
                    value={currentRecord.fecha_fin}
                    onChange={(e) => setCurrentRecord({...currentRecord, fecha_fin: e.target.value})}
                  />
                </div>
              </div>
              {currentRecord.fecha_inicio && currentRecord.fecha_fin && (
                <div className="bg-emerald-50 p-3 rounded-lg border border-emerald-100 flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-700 uppercase tracking-wider">Total Días:</span>
                  <span className="text-lg font-black text-emerald-800">
                    {Math.max(0, differenceInDays(parseISO(currentRecord.fecha_fin), parseISO(currentRecord.fecha_inicio)) + 1)}
                  </span>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>Cancelar</Button>
              <Button 
                className="bg-emerald-600 hover:bg-emerald-700" 
                onClick={handleAddOrEdit}
                disabled={isSubmitting}
              >
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : (isEditing ? 'Actualizar' : 'Guardar')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="md:col-span-1 border-none shadow-xl bg-gradient-to-br from-emerald-600 to-teal-700 text-white">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <AlertCircle className="w-5 h-5" />
              Resumen Actual
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-white/10 backdrop-blur-md p-4 rounded-xl border border-white/20">
              <p className="text-xs font-bold uppercase tracking-widest opacity-80">En Vacaciones Hoy</p>
              <p className="text-4xl font-black mt-1">
                {vacations.filter(v => {
                  const today = startOfDay(new Date());
                  return isWithinInterval(today, { 
                    start: startOfDay(parseISO(v.fecha_inicio)), 
                    end: startOfDay(parseISO(v.fecha_fin)) 
                  });
                }).length}
              </p>
            </div>
            <div className="bg-white/10 backdrop-blur-md p-4 rounded-xl border border-white/20">
              <p className="text-xs font-bold uppercase tracking-widest opacity-80">Próximos 30 días</p>
              <p className="text-4xl font-black mt-1">
                {vacations.filter(v => {
                  const today = startOfDay(new Date());
                  const nextMonth = addDays(today, 30);
                  const start = startOfDay(parseISO(v.fecha_inicio));
                  return isAfter(start, today) && isBefore(start, nextMonth);
                }).length}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-2 border-none shadow-xl overflow-hidden flex flex-col">
          <CardHeader className="bg-slate-50 border-b">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <CardTitle className="text-xl font-black text-slate-800 uppercase tracking-tight">Listado de Vacaciones</CardTitle>
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input 
                  placeholder="Buscar trabajador o DNI..." 
                  className="pl-9 bg-white border-slate-200"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0 flex-1">
            <ScrollArea className="h-[500px] w-full">
              {loading ? (
                <div className="flex flex-col items-center justify-center h-64 gap-4">
                  <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
                  <p className="text-sm font-bold text-slate-500 uppercase tracking-widest animate-pulse">Cargando registros...</p>
                </div>
              ) : filteredVacations.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-slate-400 gap-2">
                  <Calendar className="w-12 h-12 opacity-20" />
                  <p className="font-bold">No se encontraron registros</p>
                </div>
              ) : (
                <Table>
                  <TableHeader className="bg-slate-900 sticky top-0 z-10">
                    <TableRow className="hover:bg-transparent border-none">
                      <TableHead className="text-white font-black uppercase tracking-widest text-[10px] py-4">Trabajador</TableHead>
                      <TableHead className="text-white font-black uppercase tracking-widest text-[10px] py-4">Periodo</TableHead>
                      <TableHead className="text-white font-black uppercase tracking-widest text-[10px] py-4">Días</TableHead>
                      <TableHead className="text-white font-black uppercase tracking-widest text-[10px] py-4">Estado</TableHead>
                      <TableHead className="text-white font-black uppercase tracking-widest text-[10px] py-4 text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredVacations.map((v) => (
                      <TableRow key={v.id_vacacion} className="hover:bg-slate-50 transition-colors group">
                        <TableCell className="py-4">
                          <div className="flex flex-col">
                            <span className="font-bold text-sm text-slate-900 leading-tight">{v.trabajador_nombre}</span>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-[10px] font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">{v.dni}</span>
                              <span className="text-[10px] font-bold text-primary uppercase tracking-tighter">Cód: {v.codigo_trabajador}</span>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="py-4">
                          <div className="flex flex-col">
                            <div className="flex items-center gap-1.5 text-sm font-black text-slate-700">
                              <span>{format(parseISO(v.fecha_inicio), 'dd/MM/yy')}</span>
                              <span className="text-slate-300 font-light">→</span>
                              <span>{format(parseISO(v.fecha_fin), 'dd/MM/yy')}</span>
                            </div>
                            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter mt-0.5">
                              {format(parseISO(v.fecha_inicio), 'MMM', { locale: es })} - {format(parseISO(v.fecha_fin), 'MMM', { locale: es })}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="py-4">
                          <div className="flex items-center gap-1">
                            <span className="text-lg font-black text-slate-900">{v.dias_vacaciones}</span>
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">días</span>
                          </div>
                        </TableCell>
                        <TableCell className="py-4">
                          {getStatusBadge(v.fecha_inicio, v.fecha_fin)}
                        </TableCell>
                        <TableCell className="py-4 text-right">
                          <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-8 w-8 text-slate-500 hover:text-primary hover:bg-primary/10"
                              onClick={() => openEditDialog(v)}
                            >
                              <Edit2 className="w-4 h-4" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-8 w-8 text-slate-500 hover:text-rose-600 hover:bg-rose-50"
                              onClick={() => handleDelete(v.id_vacacion)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
