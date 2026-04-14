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
  Users, 
  FileText, 
  AlertCircle,
  Calendar as CalendarIcon,
  Filter,
  MapPin,
  Search,
  GraduationCap,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  CheckCircle2,
  XCircle,
  Clock
} from 'lucide-react';
import { format, parseISO, getYear, getWeek, startOfWeek, addWeeks, startOfYear, differenceInDays, startOfDay, isSunday, addDays, isBefore, subDays, eachDayOfInterval, isSameDay } from 'date-fns';
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
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];

function parseIntervalToHours(interval: string): number {
  if (!interval) return 0;
  let totalHours = 0;
  const dayMatch = interval.match(/(\d+)\s+day/);
  if (dayMatch) totalHours += parseInt(dayMatch[1]) * 24;
  const timeMatch = interval.match(/(\d{2}):(\d{2}):(\d{2})/);
  if (timeMatch) {
    totalHours += parseInt(timeMatch[1]);
    totalHours += parseInt(timeMatch[2]) / 60;
    totalHours += parseInt(timeMatch[3]) / 3600;
  }
  return totalHours;
}

/**
 * Lista de feriados nacionales de Perú para 2025 y 2026.
 */
const PERU_HOLIDAYS = [
  // 2025
  '2025-01-01', '2025-04-17', '2025-04-18', '2025-05-01', '2025-06-07', 
  '2025-06-29', '2025-07-23', '2025-07-28', '2025-07-29', '2025-08-06', 
  '2025-08-30', '2025-10-08', '2025-11-01', '2025-12-08', '2025-12-09', '2025-12-25',
  // 2026
  '2026-01-01', '2026-04-02', '2026-04-03', '2026-05-01', '2026-06-07', 
  '2026-06-29', '2026-07-23', '2026-07-28', '2026-07-29', '2026-08-06', 
  '2026-08-30', '2026-10-08', '2026-11-01', '2026-12-08', '2026-12-09', '2026-12-25'
];

function isPeruHoliday(date: Date): boolean {
  const dateStr = format(date, 'yyyy-MM-dd');
  return PERU_HOLIDAYS.includes(dateStr);
}

/**
 * Calcula los días de falta consecutivos excluyendo los domingos y feriados de Perú.
 */
function calculateAbsenceDays(lastDate: Date, today: Date): number {
  let count = 0;
  let current = startOfDay(lastDate);
  const target = startOfDay(today);
  
  while (isBefore(current, target)) {
    current = addDays(current, 1);
    if (!isSunday(current) && !isPeruHoliday(current)) {
      count++;
    }
  }
  return count;
}

export default function ProgramaCaporalDashboard() {
  const [data, setData] = useState<AgritracerRecord[]>([]);
  const [programMembers, setProgramMembers] = useState<any[]>([]);
  const [programDnis, setProgramDnis] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fetchProgress, setFetchProgress] = useState(0);
  const [selectedYear, setSelectedYear] = useState<string>("");
  const [selectedWeek, setSelectedWeek] = useState<string>("");
  const [isInitialized, setIsInitialized] = useState(false);
  const [workerSearch, setWorkerSearch] = useState("");
  const [selectedWorkerForDetail, setSelectedWorkerForDetail] = useState<any>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [isDayModalOpen, setIsDayModalOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  useEffect(() => {
    async function initialize() {
      if (!isSupabaseConfigured || !supabase) return;
      
      try {
        // 1. Fetch training program members
        const { data: programData, error: programError } = await supabase
          .from('t_programa_capacitacion')
          .select('*');
        
        if (programError) throw programError;

        // 2. Fetch worker names separately to avoid join issues with inconsistent DNIs
        const dnisToFetch = (programData || []).map(p => p.dni.toString().trim());
        const normalizedDnisToFetch = dnisToFetch.map(d => normalizeDni(d));
        const allDnisToFetch = Array.from(new Set([...dnisToFetch, ...normalizedDnisToFetch]));

        const { data: workerData, error: workerError } = await supabase
          .from('t_trabajador')
          .select('dni, trabajador')
          .in('dni', allDnisToFetch);

        const workerMap = new Map();
        (workerData || []).forEach(w => {
          workerMap.set(normalizeDni(w.dni), w.trabajador);
          workerMap.set(w.dni.toString().trim(), w.trabajador);
        });
        
        // 3. Normalize DNIs and join with worker names in memory
        const membersBase = (programData || []).map(p => {
          const normalizedDniVal = normalizeDni(p.dni);
          const rawDniVal = p.dni.toString().trim();
          return {
            ...p,
            dni: normalizedDniVal,
            t_trabajador: {
              trabajador: workerMap.get(normalizedDniVal) || workerMap.get(rawDniVal) || 'N/A'
            }
          };
        });
        
        // 4. Create a comprehensive list of DNIs for the query
        // We include raw, normalized, and even with/without leading zeros to be safe
        const dnisForQuery = Array.from(new Set([
          ...dnisToFetch, 
          ...normalizedDnisToFetch,
          ...dnisToFetch.map(d => d.replace(/^0+/, '')), // Remove leading zeros
          ...dnisToFetch.map(d => d.padStart(8, '0'))    // Ensure 8 digits
        ]));
        
        setProgramDnis(dnisForQuery);

        // 5. Fetch last registration date for each worker to show "Último Día"
        // We do this in chunks to be reliable and get the absolute latest date for each
        const lastDateMap = new Map();
        const uniqueMemberDnis = Array.from(new Set((programData || []).map(p => p.dni.toString().trim())));
        
        const chunkSize = 10;
        for (let i = 0; i < uniqueMemberDnis.length; i += chunkSize) {
          const chunk = uniqueMemberDnis.slice(i, i + chunkSize);
          await Promise.all(chunk.map(async (dni) => {
            try {
              const rawDni = dni.toString().trim();
              const normalized = normalizeDni(rawDni);
              const noLeadingZeros = rawDni.replace(/^0+/, '');
              
              // Build the OR filter with all possible DNI variations
              const filters = Array.from(new Set([rawDni, normalized, noLeadingZeros]))
                .filter(Boolean)
                .map(d => `dni.eq.${d}`)
                .join(',');

              const { data: lastData } = await supabase
                .from('rpt_horas_agritracer')
                .select('fecha, fundo')
                .or(filters)
                .order('fecha', { ascending: false })
                .limit(1);
              
              if (lastData && lastData.length > 0) {
                lastDateMap.set(normalized, { 
                  fecha: lastData[0].fecha, 
                  fundo: lastData[0].fundo || 'N/A' 
                });
              }
            } catch (e) {
              console.error(`Error fetching last date for DNI ${dni}:`, e);
            }
          }));
        }
        
        // 6. Find the latest year and week from the database to set defaults
        try {
          const { data: latestData, error: latestError } = await supabase
            .from('rpt_horas_agritracer')
            .select('fecha')
            .in('dni', dnisForQuery)
            .order('fecha', { ascending: false })
            .limit(1);

          if (!latestError && latestData && latestData.length > 0) {
            const latestDate = parseISO(latestData[0].fecha);
            setSelectedYear(getYear(latestDate).toString());
            // Adjust week numbering: User expects Week 16 for April 6, 2026
            // date-fns getWeek(Apr 6, {weekStartsOn: 1}) returns 15
            setSelectedWeek((getWeek(latestDate, { weekStartsOn: 1 }) + 1).toString());
          } else {
            const now = new Date();
            setSelectedYear(getYear(now).toString());
            setSelectedWeek((getWeek(now, { weekStartsOn: 1 }) + 1).toString());
          }
        } catch (e) {
          const now = new Date();
          setSelectedYear(getYear(now).toString());
          setSelectedWeek(getWeek(now, { weekStartsOn: 1 }).toString());
        }

        // 7. Final join with last dates and sort
        const members = membersBase.map(m => {
          const lastInfo = lastDateMap.get(m.dni);
          return {
            ...m,
            lastDate: lastInfo?.fecha || null,
            lastFundo: lastInfo?.fundo || null
          };
        }).sort((a: any, b: any) => {
          const nameA = a.t_trabajador?.trabajador || '';
          const nameB = b.t_trabajador?.trabajador || '';
          return nameA.localeCompare(nameB);
        });

        setProgramMembers(members);
      } catch (err) {
        console.error('Error initializing Programa Caporal:', err);
        setSelectedYear(getYear(new Date()).toString());
        setSelectedWeek(getWeek(new Date(), { weekStartsOn: 1 }).toString());
      } finally {
        setIsInitialized(true);
      }
    }

    initialize();
  }, []);

  useEffect(() => {
    if (isInitialized) {
      fetchData();
    }
  }, [selectedYear, selectedWeek, isInitialized]);

  async function fetchData() {
    if (!isSupabaseConfigured || !supabase || programDnis.length === 0) {
      if (programDnis.length === 0 && isInitialized) {
        setData([]);
        setLoading(false);
      }
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setFetchProgress(0);
      
      let allRecords: AgritracerRecord[] = [];
      let from = 0;
      const step = 1000;
      let hasMore = true;

      const startOfYear = `${selectedYear}-01-01`;
      const endOfYear = `${selectedYear}-12-31`;

      while (hasMore) {
        let query = supabase
          .from('rpt_horas_agritracer')
          .select('*')
          .in('dni', programDnis)
          .gte('fecha', startOfYear)
          .lte('fecha', endOfYear)
          .range(from, from + step - 1);
          // Removed .order() because it causes timeouts on large views

        const { data: records, error: fetchError } = await query;

        if (fetchError) throw fetchError;
        
        if (records && records.length > 0) {
          const weekNum = parseInt(selectedWeek);
          const filteredRecords = selectedWeek === 'all' 
            ? records 
            : records.filter(r => {
                const rWeek = getWeek(parseISO(r.fecha), { weekStartsOn: 1 }) + 1;
                // Fetch current week and previous week to handle sparse data in chart
                return rWeek === weekNum || rWeek === (weekNum === 1 ? 52 : weekNum - 1);
              });

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

      // Sort records client-side to avoid database timeouts
      const sortedRecords = [...allRecords].sort((a, b) => 
        new Date(b.fecha).getTime() - new Date(a.fecha).getTime()
      );

      setData(sortedRecords);
    } catch (err: any) {
      console.error('Error fetching data for Programa Caporal:', err);
      setError(err.message || 'Error al cargar los datos');
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
    // Filter data to only include the selected week for KPIs
    const kpiData = selectedWeek === 'all' 
      ? data 
      : data.filter(r => (getWeek(parseISO(r.fecha), { weekStartsOn: 1 }) + 1).toString() === selectedWeek);

    if (!kpiData.length) return { totalHours: 0, averageHoursPerDay: 0, totalWorkers: 0, totalRecords: 0 };
    const totalHours = kpiData.reduce((acc, curr) => acc + parseIntervalToHours(curr.total_horas), 0);
    const workers = new Set(kpiData.map(r => normalizeDni(r.dni)).filter(Boolean));
    const dates = new Set(kpiData.map(r => r.fecha.split('T')[0]));
    return {
      totalHours: Math.round(totalHours * 100) / 100,
      averageHoursPerDay: Math.round((totalHours / dates.size) * 10) / 10,
      totalWorkers: workers.size,
      totalRecords: kpiData.length
    };
  }, [data, selectedWeek]);

  const chartData = useMemo(() => {
    const grouped = data.reduce((acc: any, curr) => {
      const date = curr.fecha.split('T')[0];
      if (!acc[date]) acc[date] = new Set();
      acc[date].add(normalizeDni(curr.dni));
      return acc;
    }, {});
    
    const sortedData = Object.entries(grouped)
      .map(([date, workers]) => {
        const parsedDate = parseISO(date);
        return { 
          date, 
          count: (workers as Set<string>).size,
          week: getWeek(parsedDate, { weekStartsOn: 1 }) + 1
        };
      })
      .sort((a, b) => a.date.localeCompare(b.date));

    if (selectedWeek === 'all') return sortedData.slice(-15);

    // Filter for current week
    const currentWeekData = sortedData.filter(d => 
      d.week.toString() === selectedWeek
    );

    // If current week has < 3 days of data, include previous week
    if (currentWeekData.length < 3) {
      const prevWeekNum = parseInt(selectedWeek) - 1;
      const prevWeekData = sortedData.filter(d => 
        d.week === prevWeekNum
      );
      return [...prevWeekData, ...currentWeekData].sort((a, b) => a.date.localeCompare(b.date));
    }

    return currentWeekData;
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

  const selectedWeekStart = useMemo(() => {
    if (!selectedYear || !selectedWeek || selectedWeek === 'all') return null;
    
    try {
      const year = parseInt(selectedYear);
      const week = parseInt(selectedWeek);
      
      // Start with Jan 1st
      let date = startOfYear(new Date(year, 0, 1));
      
      // Find the week
      // We use a loop to be safe with how getWeek handles year boundaries
      let attempts = 0;
      while (getWeek(date, { weekStartsOn: 1 }) + 1 !== week && attempts < 53) {
        date = addWeeks(date, 1);
        attempts++;
      }
      
      return startOfWeek(date, { weekStartsOn: 1 });
    } catch (e) {
      return null;
    }
  }, [selectedYear, selectedWeek]);

  const sortedMembers = useMemo(() => {
    const today = startOfDay(new Date());
    return [...programMembers].sort((a, b) => {
      const lastDateA = a.lastDate ? parseISO(a.lastDate) : null;
      const lastDateB = b.lastDate ? parseISO(b.lastDate) : null;
      
      const diffA = lastDateA ? calculateAbsenceDays(lastDateA, today) : null;
      const diffB = lastDateB ? calculateAbsenceDays(lastDateB, today) : null;

      const getScore = (diff: number | null) => {
        if (diff === null) return -2; // Sin registros (al final)
        if (diff >= 15) return -1;    // Cesado (penúltimo)
        return diff;                  // 0 a 14 (más días de falta primero)
      };

      const scoreA = getScore(diffA);
      const scoreB = getScore(diffB);

      if (scoreA !== scoreB) {
        return scoreB - scoreA; // Descendente: 14, 13... 1, 0, -1, -2
      }

      // Si tienen el mismo score, orden alfabético
      const nameA = a.t_trabajador?.trabajador || '';
      const nameB = b.t_trabajador?.trabajador || '';
      return nameA.localeCompare(nameB);
    });
  }, [programMembers]);

  const paginatedMembers = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return sortedMembers.slice(startIndex, startIndex + itemsPerPage);
  }, [sortedMembers, currentPage, itemsPerPage]);

  const workerHistory = useMemo(() => {
    if (!selectedWorkerForDetail) return [];
    
    const today = startOfDay(new Date());
    const startDate = subDays(today, 14); // Last 15 days including today
    
    const days = eachDayOfInterval({ start: startDate, end: today }).reverse();
    
    return days.map(day => {
      const records = data.filter(r => 
        normalizeDni(r.dni) === normalizeDni(selectedWorkerForDetail.dni) && 
        isSameDay(parseISO(r.fecha), day)
      );
      
      return {
        date: day,
        attended: records.length > 0,
        fundo: records.length > 0 ? records[0].fundo : null,
        isHoliday: isPeruHoliday(day),
        isSunday: isSunday(day)
      };
    });
  }, [selectedWorkerForDetail, data]);

  const historySummary = useMemo(() => {
    if (!workerHistory.length) return null;
    
    const attended = workerHistory.filter(h => h.attended).length;
    const missed = workerHistory.filter(h => !h.attended && !h.isSunday && !h.isHoliday).length;
    
    return {
      attended,
      missed,
      totalWorking: attended + missed,
      attendanceRate: (attended + missed) > 0 ? Math.round((attended / (attended + missed)) * 100) : 0,
      chartData: [
        { name: 'Asistió', value: attended, color: '#10b981' },
        { name: 'Faltó', value: missed, color: '#e11d48' }
      ]
    };
  }, [workerHistory]);

  const totalPages = Math.ceil(programMembers.length / itemsPerPage);

  if (loading) {
    return (
      <div className="p-8 space-y-8">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-32 w-full rounded-xl" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-[400px] w-full rounded-xl" />
          <Skeleton className="h-[400px] w-full rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 space-y-8 max-w-7xl mx-auto">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <GraduationCap className="w-8 h-8 text-primary" />
            Programa Caporal
          </h1>
          <p className="text-muted-foreground">Seguimiento de asistencia y horas para los {programDnis.length} integrantes del programa.</p>
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
            {selectedWeekStart 
              ? `Desde ${format(selectedWeekStart, 'd MMM yyyy', { locale: es })}` 
              : data.length > 0 
                ? `Desde ${format(parseISO(data[data.length - 1].fecha), 'd MMM yyyy', { locale: es })}` 
                : 'Sin datos'}
          </Badge>
        </div>
      </header>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Dialog>
          <DialogTrigger>
            <div className="cursor-pointer transition-transform hover:scale-[1.01] text-left w-full">
              <MetricCard 
                title="Asistentes del Programa" 
                value={`${metrics.totalWorkers} / ${programDnis.length}`} 
                icon={<Users className="w-5 h-5" />} 
                description="Integrantes que asistieron"
              />
            </div>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Asistentes del Programa</DialogTitle>
              <DialogDescription>Personal del programa con asistencia registrada.</DialogDescription>
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
              </div>
            </ScrollArea>
          </DialogContent>
        </Dialog>

        <MetricCard 
          title="Total Registros" 
          value={metrics.totalRecords.toLocaleString()} 
          icon={<FileText className="w-5 h-5" />} 
          description="Entradas de tareo"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Asistencia Diaria (Programa)</CardTitle>
            <CardDescription>Integrantes del programa activos por día.</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                <XAxis 
                  dataKey="date" 
                  tickFormatter={(val) => format(parseISO(val), 'dd MMM', { locale: es })}
                  fontSize={12}
                />
                <YAxis hide domain={[0, 'dataMax + 10']} />
                <Tooltip 
                  labelFormatter={(val) => {
                    const date = parseISO(val as string);
                    return `${format(date, 'PPPP', { locale: es })} - Semana ${getWeek(date, { weekStartsOn: 1 })}`;
                  }}
                />
                <Bar 
                  dataKey="count" 
                  radius={[4, 4, 0, 0]}
                  onClick={(data: any) => {
                    if (data && data.date) {
                      setSelectedDay(data.date);
                      setIsDayModalOpen(true);
                    }
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  {chartData.map((entry: any, index: number) => {
                    const isLatestWeek = entry.week.toString() === selectedWeek || 
                                       (selectedWeek === 'all' && index === chartData.length - 1);
                    return (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={isLatestWeek ? '#0ea5e9' : '#94a3b8'} 
                      />
                    );
                  })}
                  <LabelList dataKey="count" position="top" offset={10} fontSize={11} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Horas por Fundo (Programa)</CardTitle>
            <CardDescription>Distribución de horas del grupo.</CardDescription>
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
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Dialog open={isDayModalOpen} onOpenChange={setIsDayModalOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Asistentes del {selectedDay ? format(parseISO(selectedDay), 'dd/MM/yyyy') : ''}</DialogTitle>
            <DialogDescription>Integrantes del programa registrados este día.</DialogDescription>
          </DialogHeader>
          <ScrollArea className="h-[400px] mt-4 pr-4">
            <div className="space-y-3">
              {workersForSelectedDay.map((worker) => (
                <div key={worker.dni} className="flex flex-col p-3 rounded-lg border bg-card gap-1">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm">{worker.name}</span>
                    <span className="text-[10px] text-muted-foreground font-mono">{worker.dni}</span>
                  </div>
                  <Badge variant="secondary" className="text-[10px] font-normal w-fit">
                    {worker.actividad}
                  </Badge>
                </div>
              ))}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <div className="grid grid-cols-1 gap-6">
        <Card className="flex flex-col border-none shadow-lg overflow-hidden">
          <CardHeader className="bg-gradient-to-r from-primary/5 to-transparent border-b">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <CardTitle className="text-xl font-bold">Integrantes del Programa Caporal</CardTitle>
                <CardDescription>Lista oficial de las {programMembers.length} personas inscritas (Ordenado por Días de Falta).</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground whitespace-nowrap">Mostrar</span>
                <Select
                  value={itemsPerPage.toString()}
                  onValueChange={(value) => {
                    setItemsPerPage(parseInt(value));
                    setCurrentPage(1);
                  }}
                >
                  <SelectTrigger className="w-[70px] h-8 text-xs">
                    <SelectValue placeholder="10" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="20">20</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex-1 p-0">
            <ScrollArea className="w-full">
              <div className="min-w-[800px]">
                <Table>
                  <TableHeader className="sticky top-0 bg-slate-900 z-30 shadow-md">
                    <TableRow className="hover:bg-transparent border-none">
                      <TableHead className="py-5 px-6 text-white font-black uppercase tracking-[0.2em] text-[10px] h-auto border-r border-slate-800/50">Trabajador</TableHead>
                      <TableHead className="py-5 px-6 text-white font-black uppercase tracking-[0.2em] text-[10px] h-auto border-r border-slate-800/50">Estado</TableHead>
                      <TableHead className="py-5 px-6 text-white font-black uppercase tracking-[0.2em] text-[10px] h-auto border-r border-slate-800/50">Asistencia Hoy</TableHead>
                      <TableHead className="py-5 px-6 text-white font-black uppercase tracking-[0.2em] text-[10px] h-auto border-r border-slate-800/50">Último Día</TableHead>
                      <TableHead className="py-5 px-6 text-white font-black uppercase tracking-[0.2em] text-[10px] h-auto border-r border-slate-800/50">Último Fundo</TableHead>
                      <TableHead className="py-5 px-6 text-white font-black uppercase tracking-[0.2em] text-[10px] h-auto text-right">Días (C/A)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedMembers.map((member) => {
                      const lastWorkYear = member.lastDate ? getYear(parseISO(member.lastDate)) : null;
                      const isActivo2026 = lastWorkYear === 2026;
                      const isAusente2026 = lastWorkYear !== null && lastWorkYear < 2026;
                      const sinRegistros = lastWorkYear === null;

                      return (
                        <TableRow 
                          key={member.id_capacitacion} 
                          className={`hover:bg-primary/5 transition-colors border-b border-slate-100 group cursor-pointer ${isAusente2026 ? 'bg-rose-50/40' : ''}`}
                          onClick={() => setSelectedWorkerForDetail(member)}
                        >
                          <TableCell className="py-4 px-6 border-r border-slate-50">
                            <div className="flex flex-col">
                              <span className="font-bold text-sm text-slate-900 leading-tight group-hover:text-primary transition-colors">{member.t_trabajador?.trabajador || 'N/A'}</span>
                              <span className="text-[10px] text-slate-500 font-mono mt-1.5 bg-slate-100 group-hover:bg-white w-fit px-2 py-0.5 rounded-full border border-slate-200 transition-colors">{normalizeDni(member.dni)}</span>
                            </div>
                          </TableCell>
                          <TableCell className="py-4 px-6 border-r border-slate-50">
                            <div className="flex flex-col gap-1.5">
                              {isAusente2026 ? (
                                <Badge 
                                  className="bg-rose-600 hover:bg-rose-700 text-white w-fit text-[9px] px-2.5 py-0.5 h-auto uppercase font-black tracking-tight rounded-full shadow-sm border-none animate-pulse-subtle"
                                >
                                  AUSENTE 2026
                                </Badge>
                              ) : (
                                <Badge 
                                  variant="default"
                                  className="w-fit text-[9px] px-2.5 py-0.5 h-auto uppercase font-black tracking-tight rounded-full shadow-sm border-none"
                                >
                                  PROGRAMADO
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="py-4 px-6 border-r border-slate-50">
                            {(() => {
                              const today = new Date();
                              const lastDate = member.lastDate ? parseISO(member.lastDate) : null;
                              const diffDays = lastDate ? calculateAbsenceDays(lastDate, today) : null;

                              if (diffDays === null) {
                                return (
                                  <Badge variant="outline" className="text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full text-slate-400 border-slate-200 bg-slate-50">
                                    SIN REGISTROS
                                  </Badge>
                                );
                              }

                              if (diffDays === 0) {
                                return (
                                  <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black uppercase tracking-wider px-3 py-1 rounded-full shadow-sm border-none">
                                    ASISTIÓ
                                  </Badge>
                                );
                              }

                              if (diffDays >= 15) {
                                return (
                                  <Badge className="bg-slate-900 hover:bg-black text-white text-[10px] font-black uppercase tracking-wider px-3 py-1 rounded-full shadow-sm border-none">
                                    CESADO
                                  </Badge>
                                );
                              }

                              const statusColors: Record<number, string> = {
                                1: "bg-amber-500 hover:bg-amber-600",
                                2: "bg-orange-500 hover:bg-orange-600",
                                3: "bg-orange-600 hover:bg-orange-700",
                                4: "bg-rose-500 hover:bg-rose-600"
                              };

                              const colorClass = statusColors[diffDays] || "bg-rose-700 hover:bg-rose-800";

                              return (
                                <Badge className={`${colorClass} text-white text-[10px] font-black uppercase tracking-wider px-3 py-1 rounded-full shadow-sm border-none`}>
                                  {diffDays} {diffDays === 1 ? 'DÍA' : 'DÍAS'} DE FALTA
                                </Badge>
                              );
                            })()}
                          </TableCell>
                          <TableCell className="py-4 px-6 border-r border-slate-50">
                            {member.lastDate ? (
                              <div className="flex flex-col">
                                <span className="text-sm font-black text-slate-800">{format(parseISO(member.lastDate), 'dd/MM/yyyy')}</span>
                                <span className="text-[10px] text-primary font-black uppercase tracking-widest mt-0.5">{format(parseISO(member.lastDate), 'EEEE', { locale: es })}</span>
                              </div>
                            ) : (
                              <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest bg-slate-50 px-2 py-1 rounded border border-slate-100">N/A</span>
                            )}
                          </TableCell>
                          <TableCell className="py-4 px-6 border-r border-slate-50">
                            {member.lastFundo ? (
                              <div className="flex items-center gap-2">
                                <div className="p-1 rounded-full bg-primary/10">
                                  <MapPin className="w-3 h-3 text-primary" />
                                </div>
                                <span className="text-sm font-bold text-slate-700">{member.lastFundo}</span>
                              </div>
                            ) : (
                              <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest">—</span>
                            )}
                          </TableCell>
                          <TableCell className="py-4 px-6 text-right">
                            <div className="flex flex-col items-end">
                              <div className="flex items-baseline gap-1.5">
                                <span className="font-mono text-lg font-black text-slate-900 leading-none">{member.dias_caporal || 0}</span>
                                <span className="text-slate-300 font-light text-xs">/</span>
                                <span className="font-mono text-sm font-bold text-slate-400 leading-none">{member.dias_asistencia || 0}</span>
                              </div>
                              <span className="text-[9px] text-slate-400 font-black uppercase tracking-[0.15em] mt-1">Caporal / Asist.</span>
                            </div>
                          </TableCell>
                      </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          </CardContent>
          
          {/* Pagination Controls */}
          <div className="px-6 py-4 border-t bg-slate-50/50 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-xs text-muted-foreground font-medium">
              Mostrando <span className="text-slate-900 font-bold">{(currentPage - 1) * itemsPerPage + 1}</span> a <span className="text-slate-900 font-bold">{Math.min(currentPage * itemsPerPage, programMembers.length)}</span> de <span className="text-slate-900 font-bold">{programMembers.length}</span> integrantes
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
              >
                <ChevronsLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              
              <div className="flex items-center px-2 text-xs font-bold">
                Página {currentPage} de {totalPages}
              </div>

              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages}
              >
                <ChevronsRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="border-t bg-slate-50/50 py-3 px-6">
            <div className="flex items-center justify-between w-full">
              <p className="text-xs text-slate-500 font-medium italic">
                * Haz clic en cualquier trabajador para ver su historial detallado de los últimos 15 días.
              </p>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                  <span className="text-[10px] text-slate-600 font-bold uppercase tracking-tighter">Asistió</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-rose-500"></div>
                  <span className="text-[10px] text-slate-600 font-bold uppercase tracking-tighter">Faltó</span>
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* Modal de Historial Detallado */}
        <Dialog open={!!selectedWorkerForDetail} onOpenChange={(open) => !open && setSelectedWorkerForDetail(null)}>
          <DialogContent className="sm:max-w-[500px] p-0 overflow-hidden border-none shadow-2xl">
            <DialogHeader className="p-6 bg-slate-900 text-white">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center border border-primary/30">
                  <Users className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <DialogTitle className="text-xl font-black tracking-tight uppercase">
                    {selectedWorkerForDetail?.t_trabajador?.trabajador}
                  </DialogTitle>
                  <DialogDescription className="text-slate-400 font-bold text-xs mt-1 flex items-center gap-2">
                    <span className="bg-slate-800 px-2 py-0.5 rounded border border-slate-700">DNI: {normalizeDni(selectedWorkerForDetail?.dni || '')}</span>
                    <span className="text-primary">•</span>
                    <span>HISTORIAL ÚLTIMOS 15 DÍAS</span>
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>
            
            <div className="p-6 bg-white">
              {/* Resumen Gráfico */}
              {historySummary && (
                <div className="mb-6 p-4 bg-slate-50 rounded-2xl border border-slate-100 flex items-center gap-6">
                  <div className="w-24 h-24 relative flex-shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={historySummary.chartData}
                          cx="50%"
                          cy="50%"
                          innerRadius={30}
                          outerRadius={45}
                          paddingAngle={5}
                          dataKey="value"
                        >
                          {historySummary.chartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                      <span className="text-xs font-black text-slate-900 leading-none">{historySummary.attendanceRate}%</span>
                      <span className="text-[8px] text-slate-500 font-bold uppercase tracking-tighter">Asist.</span>
                    </div>
                  </div>
                  
                  <div className="flex-1 grid grid-cols-2 gap-3">
                    <div className="bg-white p-3 rounded-xl border border-slate-100 shadow-sm">
                      <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest mb-1">Asistencias</p>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                        <span className="text-lg font-black text-slate-900">{historySummary.attended}</span>
                        <span className="text-[10px] text-slate-400 font-bold">días</span>
                      </div>
                    </div>
                    <div className="bg-white p-3 rounded-xl border border-slate-100 shadow-sm">
                      <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest mb-1">Faltas</p>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-rose-500"></div>
                        <span className="text-lg font-black text-slate-900">{historySummary.missed}</span>
                        <span className="text-[10px] text-slate-400 font-bold">días</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <ScrollArea className="h-[350px] pr-4">
                <div className="space-y-3">
                  {workerHistory.map((item, index) => (
                    <div 
                      key={index} 
                      className={`flex items-center justify-between p-4 rounded-xl border transition-all ${
                        item.attended 
                          ? 'bg-emerald-50/50 border-emerald-100' 
                          : item.isSunday || item.isHoliday
                            ? 'bg-slate-50 border-slate-100 opacity-60'
                            : 'bg-rose-50/50 border-rose-100'
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-black text-sm ${
                          item.attended ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-500'
                        }`}>
                          {format(item.date, 'dd')}
                        </div>
                        <div>
                          <p className="font-black text-slate-900 text-sm uppercase tracking-tight">
                            {format(item.date, 'EEEE', { locale: es })}
                          </p>
                          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">
                            {format(item.date, 'MMMM yyyy', { locale: es })}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-1">
                        {item.attended ? (
                          <>
                            <Badge className="bg-emerald-600 text-white text-[9px] font-black px-2 py-0.5 rounded-full border-none uppercase">
                              ASISTIÓ
                            </Badge>
                            {item.fundo && (
                              <div className="flex items-center gap-1 text-[10px] text-emerald-700 font-black uppercase">
                                <MapPin className="w-3 h-3" />
                                {item.fundo}
                              </div>
                            )}
                          </>
                        ) : item.isSunday ? (
                          <Badge variant="outline" className="text-slate-400 border-slate-200 text-[9px] font-black px-2 py-0.5 rounded-full uppercase">
                            DOMINGO
                          </Badge>
                        ) : item.isHoliday ? (
                          <Badge variant="outline" className="text-amber-600 border-amber-200 bg-amber-50 text-[9px] font-black px-2 py-0.5 rounded-full uppercase">
                            FERIADO
                          </Badge>
                        ) : (
                          <Badge className="bg-rose-600 text-white text-[9px] font-black px-2 py-0.5 rounded-full border-none uppercase">
                            FALTA
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
            
            <div className="p-4 bg-slate-50 border-t flex justify-center">
              <button 
                onClick={() => setSelectedWorkerForDetail(null)}
                className="text-xs font-black text-slate-500 hover:text-slate-900 uppercase tracking-[0.2em] transition-colors"
              >
                Cerrar Detalle
              </button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

function MetricCard({ title, value, icon, description }: { title: string, value: string, icon: React.ReactNode, description: string }) {
  return (
    <Card className="overflow-hidden relative">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <div className="p-2 bg-primary/10 rounded-lg text-primary">{icon}</div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <p className="text-xs text-muted-foreground mt-1">{description}</p>
      </CardContent>
      <div className="absolute bottom-0 left-0 w-full h-1 bg-primary/20" />
    </Card>
  );
}

function TrendingUp(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
      <polyline points="16 7 22 7 22 13" />
    </svg>
  )
}
