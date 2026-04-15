import React, { useEffect, useState, useMemo } from 'react';
import { supabase, isSupabaseConfigured } from '@/src/lib/supabase';
import { AgritracerRecord, DashboardMetrics } from '@/src/types';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
  LabelList,
} from 'recharts';
import { 
  Clock, 
  TrendingUp, 
  Users, 
  FileText, 
  AlertCircle,
  Calendar as CalendarIcon,
  Filter,
  MapPin,
  Search
} from 'lucide-react';
import { format, parseISO, getYear, getWeek } from 'date-fns';
import { es } from 'date-fns/locale';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { normalizeDni } from '@/src/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];

/**
 * Parses a PostgreSQL interval string to decimal hours.
 * Handles formats like "08:30:00", "1 day 02:00:00", etc.
 */
function parseIntervalToHours(interval: string): number {
  if (!interval) return 0;
  
  let totalHours = 0;
  
  // Handle days
  const dayMatch = interval.match(/(\d+)\s+day/);
  if (dayMatch) {
    totalHours += parseInt(dayMatch[1]) * 24;
  }
  
  // Handle HH:MM:SS
  const timeMatch = interval.match(/(\d{2}):(\d{2}):(\d{2})/);
  if (timeMatch) {
    totalHours += parseInt(timeMatch[1]);
    totalHours += parseInt(timeMatch[2]) / 60;
    totalHours += parseInt(timeMatch[3]) / 3600;
  }
  
  return totalHours;
}

export default function Dashboard() {
  const [data, setData] = useState<AgritracerRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fetchProgress, setFetchProgress] = useState(0);
  const [selectedYear, setSelectedYear] = useState<string>("");
  const [selectedWeek, setSelectedWeek] = useState<string>("");
  const [isInitialized, setIsInitialized] = useState(false);
  const [workerSearch, setWorkerSearch] = useState("");
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [isDayModalOpen, setIsDayModalOpen] = useState(false);

  useEffect(() => {
    async function initializeDefaults() {
      if (!isSupabaseConfigured || !supabase) return;
      
      try {
        const { data: latestRecord, error } = await supabase
          .from('rpt_horas_agritracer')
          .select('fecha')
          .ilike('actividad', '%CAPORAL%')
          .order('fecha', { ascending: false })
          .limit(1)
          .single();

        if (latestRecord && !error) {
          const date = parseISO(latestRecord.fecha);
          setSelectedYear(getYear(date).toString());
          setSelectedWeek(getWeek(date, { weekStartsOn: 1 }).toString());
        } else {
          // Fallback to current date if no records found
          setSelectedYear(getYear(new Date()).toString());
          setSelectedWeek(getWeek(new Date(), { weekStartsOn: 1 }).toString());
        }
      } catch (err) {
        console.error('Error initializing defaults:', err);
        setSelectedYear(getYear(new Date()).toString());
        setSelectedWeek(getWeek(new Date(), { weekStartsOn: 1 }).toString());
      } finally {
        setIsInitialized(true);
      }
    }

    initializeDefaults();
  }, []);

  useEffect(() => {
    if (isInitialized) {
      fetchData();
    }
  }, [selectedYear, selectedWeek, isInitialized]);

  async function fetchData() {
    if (!isSupabaseConfigured || !supabase) {
      setError('Configuración de Supabase faltante. Por favor, añade VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en el panel de Secretos.');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setFetchProgress(0);
      
      let allRecords: AgritracerRecord[] = [];
      let from = 0;
      const step = 2000;
      let hasMore = true;

      // Calculate date range based on Year and Week
      const startOfYear = `${selectedYear}-01-01`;
      const endOfYear = `${selectedYear}-12-31`;

      while (hasMore) {
        let query = supabase
          .from('rpt_horas_agritracer')
          .select('*')
          .ilike('actividad', '%CAPORAL%')
          .gte('fecha', startOfYear)
          .lte('fecha', endOfYear)
          .order('fecha', { ascending: false })
          .range(from, from + step - 1);

        const { data: records, error: fetchError } = await query;

        if (fetchError) throw fetchError;
        
        if (records && records.length > 0) {
          // Client-side week filtering if needed
          const filteredRecords = selectedWeek === 'all' 
            ? records 
            : records.filter(r => getWeek(parseISO(r.fecha), { weekStartsOn: 1 }).toString() === selectedWeek);

          allRecords = [...allRecords, ...filteredRecords];
          setFetchProgress(allRecords.length);
          
          if (records.length < step) {
            hasMore = false;
          } else {
            from += step;
          }
        } else {
          hasMore = false;
        }
      }

      setData(allRecords);
    } catch (err: any) {
      console.error('Error fetching data:', err);
      setError(err.message || 'Error al cargar los datos de Supabase');
    } finally {
      setLoading(false);
    }
  }

  const years = useMemo(() => {
    const currentYear = new Date().getFullYear();
    return Array.from({ length: 5 }, (_, i) => (currentYear - i).toString());
  }, []);

  const weeks = useMemo(() => {
    return Array.from({ length: 53 }, (_, i) => (i + 1).toString());
  }, []);

  const uniqueWorkers = useMemo(() => {
    const workersMap = new Map<string, string>();
    data.forEach(r => {
      if (r.dni && r.trabajador) {
        workersMap.set(normalizeDni(r.dni), r.trabajador);
      }
    });
    return Array.from(workersMap.entries())
      .map(([dni, name]) => ({ dni, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [data]);

  const filteredWorkers = useMemo(() => {
    return uniqueWorkers.filter(w => 
      w.name.toLowerCase().includes(workerSearch.toLowerCase()) || 
      w.dni.includes(workerSearch)
    );
  }, [uniqueWorkers, workerSearch]);

  const workersForSelectedDay = useMemo(() => {
    if (!selectedDay) return [];
    // Normalize dates to YYYY-MM-DD for comparison
    const targetDate = selectedDay.split('T')[0];
    const dayRecords = data.filter(r => r.fecha.split('T')[0] === targetDate);
    
    const workersMap = new Map<string, { name: string, actividad: string }>();
    
    dayRecords.forEach(r => {
      if (r.dni && r.trabajador) {
        workersMap.set(normalizeDni(r.dni), { name: r.trabajador, actividad: r.actividad });
      }
    });

    return Array.from(workersMap.entries())
      .map(([dni, info]) => ({ dni, ...info }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [data, selectedDay]);

  const metrics = useMemo<DashboardMetrics>(() => {
    if (!data.length) return { totalHours: 0, averageHoursPerDay: 0, totalWorkers: 0, totalRecords: 0 };

    const totalHours = data.reduce((acc, curr) => acc + parseIntervalToHours(curr.total_horas), 0);
    const workers = new Set(data.map(r => normalizeDni(r.dni)).filter(Boolean));
    const dates = new Set(data.map(r => r.fecha));
    
    return {
      totalHours: Math.round(totalHours * 100) / 100,
      averageHoursPerDay: Math.round((totalHours / dates.size) * 10) / 10,
      totalWorkers: workers.size,
      totalRecords: data.length
    };
  }, [data]);

  const chartData = useMemo(() => {
    const grouped = data.reduce((acc: any, curr) => {
      const date = curr.fecha.split('T')[0];
      if (!acc[date]) acc[date] = new Set();
      acc[date].add(normalizeDni(curr.dni));
      return acc;
    }, {});

    const sortedData = Object.entries(grouped)
      .map(([date, workers]) => ({ 
        date, 
        count: (workers as Set<string>).size 
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // If a week is selected, show all days of that week. Otherwise last 15 days.
    return selectedWeek === 'all' ? sortedData.slice(-15) : sortedData;
  }, [data, selectedWeek]);

  const fundoData = useMemo(() => {
    const grouped = data.reduce((acc: any, curr) => {
      const fundo = curr.fundo || 'Sin Fundo';
      if (!acc[fundo]) acc[fundo] = 0;
      acc[fundo] += parseIntervalToHours(curr.total_horas);
      return acc;
    }, {});

    return Object.entries(grouped)
      .map(([name, value]) => ({ name, value: Math.round((value as number) * 10) / 10 }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
  }, [data]);

  if (loading) {
    return (
      <div className="p-8 space-y-8">
        <div className="flex items-center justify-between">
          <Skeleton className="h-10 w-64" />
          <div className="text-sm text-muted-foreground animate-pulse">
            Cargando registros: {fetchProgress}...
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <Skeleton key={i} className="h-32 w-full rounded-xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-[400px] w-full rounded-xl" />
          <Skeleton className="h-[400px] w-full rounded-xl" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center">
        <AlertCircle className="w-16 h-16 text-destructive mb-4" />
        <h2 className="text-2xl font-bold mb-2">Error de Conexión</h2>
        <p className="text-muted-foreground max-w-md mb-6">{error}</p>
        <div className="bg-muted p-4 rounded-lg text-sm font-mono text-left w-full max-w-lg overflow-auto">
          <p>Asegúrate de:</p>
          <ul className="list-disc ml-5 mt-2 space-y-1">
            <li>Configurar VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY</li>
            <li>Que la tabla "rpt_horas_agritracer" exista</li>
            <li>Haber desactivado RLS o configurado las políticas correctas</li>
          </ul>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 space-y-8 max-w-7xl mx-auto">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Métricas Agritracer</h1>
          <p className="text-muted-foreground">Visualización de horas y rendimiento de personal (CAPORAL).</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-muted/50 p-1 rounded-md border">
            <span className="text-[10px] uppercase font-bold px-2 text-muted-foreground">Año</span>
            <select 
              value={selectedYear} 
              onChange={(e) => setSelectedYear(e.target.value)}
              className="text-sm bg-transparent border-none focus:ring-0 px-2 py-1 outline-none"
            >
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          
          <div className="flex items-center gap-1 bg-muted/50 p-1 rounded-md border">
            <span className="text-[10px] uppercase font-bold px-2 text-muted-foreground">Semana</span>
            <select 
              value={selectedWeek} 
              onChange={(e) => setSelectedWeek(e.target.value)}
              className="text-sm bg-transparent border-none focus:ring-0 px-2 py-1 outline-none"
            >
              <option value="all">Todas</option>
              {weeks.map(w => <option key={w} value={w}>Semana {w}</option>)}
            </select>
          </div>

          <Badge variant="outline" className="px-3 py-1">
            <CalendarIcon className="w-3 h-3 mr-2" />
            {data.length > 0 ? `Desde ${format(parseISO(data[data.length - 1].fecha), 'PP', { locale: es })}` : 'Sin datos'}
          </Badge>
          <button 
            onClick={fetchData}
            className="p-2 hover:bg-muted rounded-full transition-colors"
            title="Refrescar datos"
          >
            <TrendingUp className="w-5 h-5 text-primary" />
          </button>
        </div>
      </header>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Dialog>
          <DialogTrigger>
            <div className="cursor-pointer transition-transform hover:scale-[1.01] text-left w-full">
              <MetricCard 
                title="Trabajadores" 
                value={metrics.totalWorkers.toString()} 
                icon={<Users className="w-5 h-5" />} 
                description="Haz clic para ver la lista"
              />
            </div>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Lista de Caporales</DialogTitle>
              <DialogDescription>
                Personal único registrado en el periodo seleccionado.
              </DialogDescription>
            </DialogHeader>
            <div className="relative my-4">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nombre o DNI..."
                className="pl-8"
                value={workerSearch}
                onChange={(e) => setWorkerSearch(e.target.value)}
              />
            </div>
            <ScrollArea className="h-[300px] pr-4">
              <div className="space-y-2">
                {filteredWorkers.map((worker) => (
                  <div key={worker.dni} className="flex items-center justify-between p-2 rounded-lg border bg-card text-sm">
                    <span className="font-medium">{worker.name}</span>
                    <span className="text-xs text-muted-foreground font-mono">{worker.dni}</span>
                  </div>
                ))}
                {filteredWorkers.length === 0 && (
                  <p className="text-center text-muted-foreground text-sm py-8">No se encontraron trabajadores.</p>
                )}
              </div>
            </ScrollArea>
          </DialogContent>
        </Dialog>

        <MetricCard 
          title="Jornales" 
          value={metrics.totalRecords.toLocaleString()} 
          icon={<FileText className="w-5 h-5" />} 
          description="Total de entradas registradas"
        />
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="col-span-1">
          <CardHeader>
            <CardTitle>Caporales por Día</CardTitle>
            <CardDescription>Cantidad de personal único registrado por día.</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                <XAxis 
                  dataKey="date" 
                  tickFormatter={(val) => format(parseISO(val), 'dd MMM', { locale: es })}
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis hide />
                <Tooltip 
                  labelFormatter={(val) => format(parseISO(val as string), 'PPPP', { locale: es })}
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                  formatter={(value) => [value, 'Caporales']}
                />
                <Bar 
                  dataKey="count" 
                  fill="hsl(var(--primary))" 
                  radius={[4, 4, 0, 0]}
                  onClick={(data: any) => {
                    if (data && data.date) {
                      setSelectedDay(data.date);
                      setIsDayModalOpen(true);
                    }
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  <LabelList dataKey="count" position="top" offset={10} fontSize={11} fill="hsl(var(--muted-foreground))" />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="col-span-1">
          <CardHeader>
            <CardTitle>Horas por Fundo</CardTitle>
            <CardDescription>Distribución de horas en los principales fundos.</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px] flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={fundoData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                  label={({ name, value }) => `${value}h`}
                >
                  {fundoData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                   contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-col gap-2 ml-4">
              {fundoData.map((item, i) => (
                <div key={item.name} className="flex items-center gap-2 text-xs">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                  <span className="truncate max-w-[120px]">{item.name}</span>
                  <span className="font-bold">{item.value}h</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Day Workers Modal */}
      <Dialog open={isDayModalOpen} onOpenChange={setIsDayModalOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>
              Caporales del {selectedDay ? format(parseISO(selectedDay), 'dd/MM/yyyy') : ''}
            </DialogTitle>
            <DialogDescription>
              Personal y actividades registradas para este día.
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="h-[400px] mt-4 pr-4">
            <div className="space-y-3">
              {workersForSelectedDay.map((worker) => (
                <div key={worker.dni} className="flex flex-col p-3 rounded-lg border bg-card gap-1">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm">{worker.name}</span>
                    <span className="text-[10px] text-muted-foreground font-mono">{worker.dni}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-[10px] font-normal py-0">
                      {worker.actividad}
                    </Badge>
                  </div>
                </div>
              ))}
              {workersForSelectedDay.length === 0 && (
                <p className="text-center text-muted-foreground text-sm py-8">No hay registros para este día.</p>
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Data Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Detalle de Registros</CardTitle>
            <CardDescription>Listado completo de horas por trabajador y actividad.</CardDescription>
          </div>
          <Filter className="w-4 h-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead>Fecha</TableHead>
                  <TableHead>Trabajador</TableHead>
                  <TableHead>Fundo / Lote</TableHead>
                  <TableHead>Actividad</TableHead>
                  <TableHead className="text-right">Horas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.slice(0, 20).map((record, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">
                      {format(parseISO(record.fecha), 'dd/MM/yyyy')}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{record.trabajador}</span>
                        <span className="text-xs text-muted-foreground">{normalizeDni(record.dni)}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-xs">
                        <MapPin className="w-3 h-3" />
                        {record.fundo} {record.lote ? `- ${record.lote}` : ''}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="font-normal">
                        {record.actividad}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {parseIntervalToHours(record.total_horas).toFixed(2)}h
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {data.length > 20 && (
            <p className="text-xs text-center text-muted-foreground mt-4">
              Mostrando los últimos 20 de {data.length} registros.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCard({ title, value, icon, description }: { title: string, value: string, icon: React.ReactNode, description: string }) {
  return (
    <Card className="overflow-hidden relative">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <div className="p-2 bg-primary/10 rounded-lg text-primary">
          {icon}
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <p className="text-xs text-muted-foreground mt-1">{description}</p>
      </CardContent>
      <div className="absolute bottom-0 left-0 w-full h-1 bg-primary/20" />
    </Card>
  );
}
