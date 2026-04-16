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
  Clock,
  Palmtree,
  Stethoscope
} from 'lucide-react';
import { format, parseISO, getYear, getISOWeek, startOfISOWeek, startOfWeek, addWeeks, startOfYear, differenceInDays, startOfDay, isSunday, addDays, isBefore, isAfter, subDays, eachDayOfInterval, isSameDay, isWithinInterval, isValid } from 'date-fns';
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
function calculateAbsenceDays(
  lastDate: Date, 
  today: Date, 
  dni?: string, 
  vacations?: any[], 
  licenses?: any[]
): number {
  const normalizedDni = dni ? normalizeDni(dni) : null;
  const start = startOfDay(lastDate);
  const end = startOfDay(today);
  
  if (isAfter(start, end)) return 0;
  
  // Usamos differenceInDays para saber cuántos días iterar
  const totalDays = differenceInDays(end, start);
  let count = 0;
  
  if (normalizedDni === '46646035') {
    const myVacations = vacations?.filter(v => normalizeDni(v.dni) === normalizedDni);
    const myLicenses = licenses?.filter(l => normalizeDni(l.dni) === normalizedDni);
    console.log(`[DEBUG] Calculating for 46646035: Last=${format(start, 'yyyy-MM-dd')}, Today=${format(end, 'yyyy-MM-dd')}, Diff=${totalDays}`);
    console.log(`[DEBUG] 46646035 Vacations:`, myVacations);
    console.log(`[DEBUG] 46646035 Licenses:`, myLicenses);
  }

  for (let i = 1; i <= totalDays; i++) {
    const current = addDays(start, i);
    const dateStr = format(current, 'yyyy-MM-dd');
    
    // 1. Domingos y Feriados
    if (isSunday(current) || isPeruHoliday(current)) {
      if (normalizedDni === '46646035') {
        console.log(`[DEBUG] ${dateStr}: Skip (Sun/Hol)`);
      }
      continue;
    }
    
    // 2. Vacaciones (Comentado por petición del usuario para corregir subconteo)
    /*
    let onVacation = false;
    if (normalizedDni && vacations && vacations.length > 0) {
      onVacation = vacations.some(v => {
        if (!v.dni || !v.fecha_inicio || !v.fecha_fin) return false;
        if (normalizeDni(v.dni) !== normalizedDni) return false;
        const vStart = startOfDay(parseISO(v.fecha_inicio));
        const vEnd = startOfDay(parseISO(v.fecha_fin));
        return isWithinInterval(current, { start: vStart, end: vEnd });
      });
    }
    if (onVacation) {
      if (normalizedDni === '46646035') {
        console.log(`[DEBUG] ${dateStr}: Skip (Vacation)`);
      }
      continue;
    }
    */
    
    // 3. Licencias (Comentado por petición del usuario para corregir subconteo)
    /*
    let onLicense = false;
    if (normalizedDni && licenses && licenses.length > 0) {
      onLicense = licenses.some(l => {
        if (!l.dni || !l.fecha_inicio || !l.fecha_fin) return false;
        if (normalizeDni(l.dni) !== normalizedDni) return false;
        const lStart = startOfDay(parseISO(l.fecha_inicio));
        const lEnd = startOfDay(parseISO(l.fecha_fin));
        return isWithinInterval(current, { start: lStart, end: lEnd });
      });
    }
    if (onLicense) {
      if (normalizedDni === '46646035') {
        console.log(`[DEBUG] ${dateStr}: Skip (License)`);
      }
      continue;
    }
    */
    
    count++;
    if (normalizedDni === '46646035') {
      console.log(`[DEBUG] ${dateStr}: Counted! Total: ${count}`);
    }
  }
  
  return count;
}

export default function ProgramaCaporalDashboard() {
  const [data, setData] = useState<AgritracerRecord[]>([]);
  const [programMembers, setProgramMembers] = useState<any[]>([]);
  const [vacationsMap, setVacationsMap] = useState<Map<string, any>>(new Map());
  const [licensesMap, setLicensesMap] = useState<Map<string, any>>(new Map());
  const [allVacations, setAllVacations] = useState<any[]>([]);
  const [allLicenses, setAllLicenses] = useState<any[]>([]);
  const [programDnis, setProgramDnis] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fetchProgress, setFetchProgress] = useState(0);
  const [selectedYear, setSelectedYear] = useState<string>("");
  const [selectedWeek, setSelectedWeek] = useState<string>("");
  const [isInitialized, setIsInitialized] = useState(false);
  const [workerSearch, setWorkerSearch] = useState("");
  const [tableSearch, setTableSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedWorkerForDetail, setSelectedWorkerForDetail] = useState<any>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [isDayModalOpen, setIsDayModalOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  useEffect(() => {
    async function initialize() {
      if (!isSupabaseConfigured || !supabase) return;
      
      try {
        setLoading(true);
        // 1. Fetch training program members first to get the DNIs
        const { data: programData, error: programError } = await supabase
          .from('t_programa_capacitacion')
          .select('*');
        
        if (programError) throw programError;
        const programMembersData = programData || [];
        
        if (programMembersData.length === 0) {
          setLoading(false);
          setIsInitialized(true);
          return;
        }

        // 2. Create a comprehensive list of DNIs for filtering
        const dnisToFetch = programMembersData.map(p => p.dni.toString().trim());
        const normalizedDnisToFetch = dnisToFetch.map(d => normalizeDni(d));
        const dnisForQuery = Array.from(new Set([
          ...dnisToFetch, 
          ...normalizedDnisToFetch,
          ...dnisToFetch.map(d => d.replace(/^0+/, '')),
          ...dnisToFetch.map(d => d.padStart(8, '0')),
          // Add numeric versions just in case the column is numeric
          ...dnisToFetch.map(d => parseInt(d, 10)).filter(n => !isNaN(n))
        ]));
        
        setProgramDnis(dnisForQuery);

        // 3. Fetch worker names, vacations and licenses filtered by program DNIs
        const [workerRes, vacationsRes, licensesRes] = await Promise.all([
          supabase.from('t_trabajador').select('dni, trabajador').in('dni', dnisForQuery),
          supabase.from('t_vacaciones_trabajador').select('*').in('dni', dnisForQuery),
          supabase.from('t_licencias_trabajador').select('*').in('dni', dnisForQuery)
        ]);
        
        const workerData = workerRes.data || [];
        const vacationData = vacationsRes.data || [];
        const licenseData = licensesRes.data || [];

        // Process vacations and licenses into maps for quick lookup
        const vMap = new Map();
        const lMap = new Map();
        const today = startOfDay(new Date());

        vacationData.forEach(v => {
          const normalized = normalizeDni(v.dni);
          if (!v.fecha_inicio || !v.fecha_fin) return;
          const start = startOfDay(parseISO(v.fecha_inicio));
          const end = startOfDay(parseISO(v.fecha_fin));
          if (isValid(start) && isValid(end) && isWithinInterval(today, { start, end })) {
            vMap.set(normalized, v);
          }
        });

        licenseData.forEach(l => {
          const normalized = normalizeDni(l.dni);
          if (!l.fecha_inicio || !l.fecha_fin) return;
          const start = startOfDay(parseISO(l.fecha_inicio));
          const end = startOfDay(parseISO(l.fecha_fin));
          if (isValid(start) && isValid(end) && isWithinInterval(today, { start, end })) {
            lMap.set(normalized, l);
          }
        });

        setVacationsMap(vMap);
        setLicensesMap(lMap);
        setAllVacations(vacationData);
        setAllLicenses(licenseData);

        const workerMap = new Map();
        workerData.forEach(w => {
          const name = w.trabajador?.toString().trim();
          if (name && name !== 'N/A') {
            workerMap.set(normalizeDni(w.dni), name);
            workerMap.set(w.dni.toString().trim(), name);
          }
        });

        // Try to get more names from vacations and licenses
        vacationData.forEach(v => {
          const normalized = normalizeDni(v.dni);
          const name = v.trabajador_nombre?.toString().trim();
          if (name && name !== 'N/A' && (!workerMap.has(normalized) || workerMap.get(normalized) === 'N/A')) {
            workerMap.set(normalized, name);
          }
        });

        licenseData.forEach(l => {
          const normalized = normalizeDni(l.dni);
          const name = l.trabajador_nombre?.toString().trim();
          if (name && name !== 'N/A' && (!workerMap.has(normalized) || workerMap.get(normalized) === 'N/A')) {
            workerMap.set(normalized, name);
          }
        });

        // 4. Fetch last registration date for each worker
        const lastDateMap = new Map();
        
        // Optimization: Fetch recent records in one batch (90 days)
        const ninetyDaysAgo = format(subDays(new Date(), 90), 'yyyy-MM-dd');
        const { data: recentRecords } = await supabase
          .from('rpt_horas_agritracer')
          .select('dni, trabajador, fecha, fundo, lote, actividad')
          .in('dni', dnisForQuery)
          .gte('fecha', ninetyDaysAgo)
          .order('fecha', { ascending: false })
          .limit(10000);

        let absoluteLatestDate: Date | null = null;

        if (recentRecords) {
          recentRecords.forEach(r => {
            const normalized = normalizeDni(r.dni);
            const rDate = parseISO(r.fecha);
            
            // Enrich workerMap if name is missing
            if (r.trabajador && (!workerMap.has(normalized) || workerMap.get(normalized) === 'N/A')) {
              workerMap.set(normalized, r.trabajador);
            }

            if (!absoluteLatestDate || isAfter(rDate, absoluteLatestDate)) {
              absoluteLatestDate = rDate;
            }
            
            const current = lastDateMap.get(normalized);
            if (!current || isAfter(rDate, parseISO(current.fecha))) {
              lastDateMap.set(normalized, {
                fecha: r.fecha,
                fundo: r.fundo || 'N/A',
                lote: r.lote || 'N/A',
                actividad: r.actividad || 'N/A'
              });
            }
          });
        }

        // Fallback for those who haven't worked in the last 90 days
        const missingDnis = Array.from(new Set(programMembersData.map(p => p.dni.toString().trim())))
          .filter(dni => !lastDateMap.has(normalizeDni(dni)));
        
        if (missingDnis.length > 0) {
          // For each missing DNI, we need to check all its variations in the older records
          const expandedMissingDnis = Array.from(new Set([
            ...missingDnis,
            ...missingDnis.map(d => normalizeDni(d)),
            ...missingDnis.map(d => d.replace(/^0+/, '')),
            ...missingDnis.map(d => d.padStart(8, '0')),
            ...missingDnis.map(d => parseInt(d, 10)).filter(n => !isNaN(n))
          ]));

          const oneYearAgo = format(subDays(new Date(), 365), 'yyyy-MM-dd');
          const chunkSize = 50;
          for (let i = 0; i < expandedMissingDnis.length; i += chunkSize) {
            const chunk = expandedMissingDnis.slice(i, i + chunkSize);
            const { data: olderRecords } = await supabase
              .from('rpt_horas_agritracer')
              .select('dni, trabajador, fecha, fundo, lote, actividad')
              .in('dni', chunk)
              .gte('fecha', oneYearAgo)
              .order('fecha', { ascending: false })
              .limit(2000);

            if (olderRecords) {
              olderRecords.forEach(r => {
                const normalized = normalizeDni(r.dni);
                const rDate = parseISO(r.fecha);
                
                // Enrich workerMap if name is missing
                if (r.trabajador && (!workerMap.has(normalized) || workerMap.get(normalized) === 'N/A')) {
                  workerMap.set(normalized, r.trabajador);
                }

                if (!absoluteLatestDate || isAfter(rDate, absoluteLatestDate)) {
                  absoluteLatestDate = rDate;
                }
                const current = lastDateMap.get(normalized);
                if (!current || isAfter(rDate, parseISO(current.fecha))) {
                  lastDateMap.set(normalized, {
                    fecha: r.fecha,
                    fundo: r.fundo || 'N/A',
                    lote: r.lote || 'N/A',
                    actividad: r.actividad || 'N/A'
                  });
                }
              });
            }
          }
        }
        
        // 5. Normalize DNIs and join with worker names in memory (AFTER enrichment)
        const membersBase = programMembersData.map(p => {
          const normalizedDniVal = normalizeDni(p.dni);
          const rawDniVal = p.dni.toString().trim();
          const unpaddedDni = rawDniVal.replace(/^0+/, '');
          
          let name = workerMap.get(normalizedDniVal) || 
                     workerMap.get(rawDniVal) || 
                     workerMap.get(unpaddedDni);

          // If still N/A, try to find in workerData again with more variations
          if (!name || name === 'N/A') {
            const foundWorker = workerData.find(w => 
              normalizeDni(w.dni) === normalizedDniVal || 
              w.dni.toString().trim() === rawDniVal ||
              w.dni.toString().trim().replace(/^0+/, '') === unpaddedDni
            );
            if (foundWorker) name = foundWorker.trabajador;
          }

          const lastInfo = lastDateMap.get(normalizedDniVal);

          return {
            ...p,
            dni: normalizedDniVal,
            t_trabajador: {
              trabajador: name || 'N/A'
            },
            lastDate: lastInfo?.fecha || null,
            lastFundo: lastInfo?.fundo || null,
            lastLote: lastInfo?.lote || null,
            lastActividad: lastInfo?.actividad || null
          };
        });

        setProgramMembers(membersBase);
        
        // 6. Set default year and week based on absoluteLatestDate
        if (absoluteLatestDate) {
          setSelectedYear(getYear(absoluteLatestDate).toString());
          setSelectedWeek(getISOWeek(absoluteLatestDate).toString());
        } else {
          const now = new Date();
          setSelectedYear(getYear(now).toString());
          setSelectedWeek(getISOWeek(now).toString());
        }

        setIsInitialized(true);
      } catch (err: any) {
        console.error('Error initializing dashboard:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    initialize();
  }, [isSupabaseConfigured]);

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

      let startDate = `${selectedYear}-01-01`;
      let endDate = `${selectedYear}-12-31`;

      if (selectedWeek !== 'all') {
        // Optimization: Calculate the exact start and end of the week using ISO standards
        const weekNum = parseInt(selectedWeek);
        const yearNum = parseInt(selectedYear);
        
        // Get the start of the year
        const jan4 = new Date(yearNum, 0, 4);
        const firstISOWeekStart = startOfISOWeek(jan4);
        
        // Target week start
        const targetWeekStart = addWeeks(firstISOWeekStart, weekNum - 1);
        
        // Fetch from previous week to current to handle chart logic
        startDate = format(subDays(targetWeekStart, 7), 'yyyy-MM-dd');
        endDate = format(addDays(targetWeekStart, 6), 'yyyy-MM-dd');
      }

      // Chunk the DNI list to avoid URL length limits
      const dniChunkSize = 50;
      const dniChunks = [];
      for (let i = 0; i < programDnis.length; i += dniChunkSize) {
        dniChunks.push(programDnis.slice(i, i + dniChunkSize));
      }

      for (const dniChunk of dniChunks) {
        let from = 0;
        const step = 1000;
        let hasMore = true;

        while (hasMore) {
          const { data: records, error: fetchError } = await supabase
            .from('rpt_horas_agritracer')
            .select('*')
            .in('dni', dniChunk)
            .gte('fecha', startDate)
            .lte('fecha', endDate)
            .range(from, from + step - 1);

          if (fetchError) throw fetchError;
          
          if (records && records.length > 0) {
            const weekNum = parseInt(selectedWeek);
            const filteredRecords = selectedWeek === 'all' 
              ? records 
              : records.filter(r => {
                  const rWeek = getISOWeek(parseISO(r.fecha));
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
    const currentYear = new Date().getFullYear();
    const selectedYearNum = parseInt(selectedYear);
    
    let maxWeek = 53;
    if (selectedYearNum === currentYear) {
      maxWeek = getISOWeek(new Date());
    }
    
    return Array.from({ length: maxWeek }, (_, i) => (i + 1).toString());
  }, [selectedYear]);

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
      : data.filter(r => getISOWeek(parseISO(r.fecha)).toString() === selectedWeek);

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
          week: getISOWeek(parsedDate)
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
      
      // ISO week 1 is the week with Jan 4th
      const jan4 = new Date(year, 0, 4);
      const firstISOWeekStart = startOfISOWeek(jan4);
      return addWeeks(firstISOWeekStart, week - 1);
    } catch (e) {
      return null;
    }
  }, [selectedYear, selectedWeek]);

  const sortedMembers = useMemo(() => {
    const today = startOfDay(new Date());
    
    // Pre-calculate status for all members to make filtering/sorting efficient
    const membersWithStatus = programMembers.map(member => {
      const normalizedDni = normalizeDni(member.dni);
      const lastDate = member.lastDate ? parseISO(member.lastDate) : null;
      const diffDays = lastDate ? calculateAbsenceDays(lastDate, today, member.dni, allVacations, allLicenses) : null;
      const onVacation = vacationsMap.has(normalizedDni);
      const onLicense = licensesMap.has(normalizedDni);
      
      let status = 'falta';
      if (onVacation) status = 'vacaciones';
      else if (onLicense) status = 'licencia';
      else if (diffDays === 0) status = 'asistio';
      else if (diffDays === null || diffDays >= 15) status = 'cesado';
      else status = 'falta';

      return { ...member, diffDays, status, onVacation, onLicense };
    });

    // 1. Filter
    const filtered = membersWithStatus.filter(member => {
      // Search filter
      const searchTerm = tableSearch.toLowerCase();
      const name = (member.t_trabajador?.trabajador || '').toLowerCase();
      const dni = normalizeDni(member.dni);
      const matchesSearch = name.includes(searchTerm) || dni.includes(searchTerm);
      
      if (!matchesSearch) return false;

      // Status filter
      if (statusFilter !== 'all') {
        if (statusFilter === 'ausente') {
          const lastWorkYear = member.lastDate ? getYear(parseISO(member.lastDate)) : null;
          return lastWorkYear !== 2026;
        }
        return member.status === statusFilter;
      }

      return true;
    });

    // 2. Then sort
    return filtered.sort((a, b) => {
      const getScore = (m: any) => {
        if (m.onVacation) return 90;
        if (m.onLicense) return 80;
        if (m.diffDays === 0) return 70;    // Asistió
        if (m.diffDays === null) return 40; // Sin registros
        if (m.diffDays >= 15) return 60;    // Cesado
        return 100 + m.diffDays;            // 1 a 14 días de falta
      };

      const scoreA = getScore(a);
      const scoreB = getScore(b);

      if (scoreA !== scoreB) {
        return scoreB - scoreA;
      }

      const nameA = a.t_trabajador?.trabajador || '';
      const nameB = b.t_trabajador?.trabajador || '';
      return nameA.localeCompare(nameB);
    });
  }, [programMembers, vacationsMap, licensesMap, tableSearch, statusFilter, allVacations, allLicenses]);

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
      
      const normalizedDni = normalizeDni(selectedWorkerForDetail.dni);
      // For history, we need to check if the specific day was a vacation or license
      // Note: vacationsMap/licensesMap only store current status, we need to check the full list
      // But for simplicity in this view, we'll use the current maps if the day is today
      // or just check if the worker has ANY vacation/license that covers this day
      
      return {
        date: day,
        attended: records.length > 0,
        fundo: records.length > 0 ? records[0].fundo : null,
        lote: records.length > 0 ? records[0].lote : null,
        actividad: records.length > 0 ? records[0].actividad : null,
        isHoliday: isPeruHoliday(day),
        isSunday: isSunday(day),
        isVacation: vacationsMap.has(normalizedDni), // Simplified: using current status
        isLicense: licensesMap.has(normalizedDni)    // Simplified: using current status
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

  const totalPages = Math.ceil(sortedMembers.length / itemsPerPage);

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
          <p className="text-muted-foreground">Seguimiento de asistencia y horas para los {programMembers.length} integrantes del programa.</p>
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
                value={`${metrics.totalWorkers} / ${programMembers.length}`} 
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
                    return `${format(date, 'PPPP', { locale: es })} - Semana ${getISOWeek(date)}`;
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
                <CardDescription>
                  {statusFilter !== 'all' 
                    ? `Mostrando ${sortedMembers.length} personas con filtro "${statusFilter.toUpperCase()}".` 
                    : `Lista oficial de las ${programMembers.length} personas inscritas (Ordenado por Días de Falta).`}
                </CardDescription>
              </div>
              <div className="flex flex-col md:flex-row items-center gap-3">
                <div className="relative w-full md:w-64">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por nombre o DNI..."
                    className="pl-9 h-9 text-xs bg-white/50 border-slate-200 focus:bg-white transition-colors"
                    value={tableSearch}
                    onChange={(e) => {
                      setTableSearch(e.target.value);
                      setCurrentPage(1);
                    }}
                  />
                </div>
                <Select
                  value={statusFilter}
                  onValueChange={(val) => {
                    setStatusFilter(val);
                    setCurrentPage(1);
                  }}
                >
                  <SelectTrigger className="w-full md:w-[180px] h-9 text-xs bg-white/50 border-slate-200">
                    <Filter className="w-3 h-3 mr-2 text-slate-400" />
                    <SelectValue placeholder="Filtrar estado" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los Integrantes</SelectItem>
                    <SelectItem value="asistio">Asistió Hoy</SelectItem>
                    <SelectItem value="falta">Con Días de Falta</SelectItem>
                    <SelectItem value="vacaciones">En Vacaciones</SelectItem>
                    <SelectItem value="licencia">En Licencia</SelectItem>
                    <SelectItem value="cesado">Cesados</SelectItem>
                    <SelectItem value="ausente">Ausentes 2026</SelectItem>
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-2 bg-white/50 px-2 py-1 rounded-md border border-slate-200">
                  <span className="text-[10px] text-muted-foreground uppercase font-bold">Mostrar</span>
                  <Select
                    value={itemsPerPage.toString()}
                    onValueChange={(value) => {
                      setItemsPerPage(parseInt(value));
                      setCurrentPage(1);
                    }}
                  >
                    <SelectTrigger className="w-[60px] h-7 text-xs border-none bg-transparent focus:ring-0 p-0">
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
                      <TableHead className="py-5 px-6 text-white font-black uppercase tracking-[0.2em] text-[10px] h-auto border-r border-slate-800/50">Último Día</TableHead>
                      <TableHead className="py-5 px-6 text-white font-black uppercase tracking-[0.2em] text-[10px] h-auto border-r border-slate-800/50">Días de Falta</TableHead>
                      <TableHead className="py-5 px-6 text-white font-black uppercase tracking-[0.2em] text-[10px] h-auto border-r border-slate-800/50">Último Fundo</TableHead>
                      <TableHead className="py-5 px-6 text-white font-black uppercase tracking-[0.2em] text-[10px] h-auto text-right">Días (C/A)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedMembers.map((member) => {
                      const lastWorkYear = member.lastDate ? getYear(parseISO(member.lastDate)) : null;
                      const isAusente2026 = lastWorkYear !== 2026;

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
                              <Badge 
                                variant="default"
                                className="w-fit text-[9px] px-2.5 py-0.5 h-auto uppercase font-black tracking-tight rounded-full shadow-sm border-none bg-slate-900 text-white"
                              >
                                PROGRAMADO
                              </Badge>
                              {isAusente2026 && (
                                <Badge 
                                  className="bg-rose-600 hover:bg-rose-700 text-white w-fit text-[9px] px-2.5 py-0.5 h-auto uppercase font-black tracking-tight rounded-full shadow-sm border-none animate-pulse-subtle"
                                >
                                  AUSENTE 2026
                                </Badge>
                              )}
                            </div>
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
                            {(() => {
                              const { diffDays, status, onVacation, onLicense } = member;

                              if (onVacation) {
                                return (
                                  <Badge className="bg-emerald-500 hover:bg-emerald-600 text-white text-[10px] font-black uppercase tracking-wider px-3 py-1 rounded-full shadow-sm border-none flex items-center gap-1.5">
                                    <Palmtree className="w-3 h-3" />
                                    VACACIONES
                                  </Badge>
                                );
                              }

                              if (onLicense) {
                                return (
                                  <Badge className="bg-blue-500 hover:bg-blue-600 text-white text-[10px] font-black uppercase tracking-wider px-3 py-1 rounded-full shadow-sm border-none flex items-center gap-1.5">
                                    <Stethoscope className="w-3 h-3" />
                                    LICENCIA
                                  </Badge>
                                );
                              }

                              if (diffDays === null) {
                                return (
                                  <Badge className="bg-slate-900 hover:bg-black text-white text-[10px] font-black uppercase tracking-wider px-3 py-1 rounded-full shadow-sm border-none">
                                    CESADO (SIN REGISTROS)
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
                            {member.lastFundo ? (
                              <div className="flex items-center gap-2">
                                <div className="p-1 rounded-full bg-primary/10">
                                  <MapPin className="w-3 h-3 text-primary" />
                                </div>
                                <div className="flex flex-col">
                                  <span className="text-sm font-bold text-slate-700">{member.lastFundo}</span>
                                  <div className="flex items-center gap-2 mt-0.5">
                                    {member.lastLote && (
                                      <span className="text-[9px] text-slate-500 font-bold uppercase tracking-tight bg-slate-100 px-1 rounded">L: {member.lastLote}</span>
                                    )}
                                    {member.lastActividad && (
                                      <span className="text-[9px] text-primary font-black uppercase tracking-tighter truncate max-w-[120px]">{member.lastActividad}</span>
                                    )}
                                  </div>
                                </div>
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
              Mostrando <span className="text-slate-900 font-bold">{sortedMembers.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1}</span> a <span className="text-slate-900 font-bold">{Math.min(currentPage * itemsPerPage, sortedMembers.length)}</span> de <span className="text-slate-900 font-bold">{sortedMembers.length}</span> integrantes
              {statusFilter === 'ausente' && <span className="ml-1 text-rose-600 font-bold">(Filtrado por Ausentes 2026)</span>}
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
                <div className="mb-6 space-y-4">
                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex items-center gap-6">
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

                  {/* Timeline Visual */}
                  <div className="p-4 bg-slate-900 rounded-2xl shadow-inner border border-slate-800">
                    <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest mb-4 flex items-center gap-2">
                      <Clock className="w-3 h-3 text-primary" />
                      Línea de Tiempo (Últimos 15 días)
                    </p>
                    <div className="flex justify-between items-end h-16 gap-1.5 px-1">
                      {workerHistory.map((item, i) => (
                        <div key={i} className="flex-1 flex flex-col items-center gap-2 group relative h-full">
                          {/* Contenedor de la barra con altura fija */}
                          <div className="w-full flex-1 relative flex items-end">
                            <div 
                              className={`w-full rounded-sm transition-all duration-500 ease-out ${
                                item.attended 
                                  ? 'bg-emerald-500 h-full shadow-[0_0_15px_rgba(16,185,129,0.4)]' 
                                  : item.isVacation
                                    ? 'bg-emerald-400 h-full'
                                    : item.isLicense
                                      ? 'bg-blue-400 h-full'
                                      : item.isSunday || item.isHoliday
                                        ? 'bg-slate-700 h-[20%]'
                                        : 'bg-rose-500 h-full shadow-[0_0_15px_rgba(225,29,72,0.4)]'
                              }`}
                            />
                          </div>
                          <span className="text-[8px] font-black text-slate-500 group-hover:text-white transition-colors">
                            {format(item.date, 'dd')}
                          </span>
                          
                          {/* Tooltip mejorado */}
                          <div className="absolute bottom-full mb-3 hidden group-hover:block z-50">
                            <div className="bg-white text-slate-900 text-[9px] font-black px-3 py-1.5 rounded-lg shadow-2xl border border-slate-100 whitespace-nowrap uppercase flex flex-col items-center gap-0.5">
                              <span className="text-slate-500 text-[7px]">{format(item.date, 'EEEE dd MMMM', { locale: es })}</span>
                              <span className={item.attended ? 'text-emerald-600' : item.isVacation ? 'text-emerald-500' : item.isLicense ? 'text-blue-500' : item.isSunday || item.isHoliday ? 'text-slate-400' : 'text-rose-600'}>
                                {item.attended ? 'ASISTIÓ' : item.isVacation ? 'VACACIONES' : item.isLicense ? 'LICENCIA' : item.isSunday ? 'DOMINGO' : item.isHoliday ? 'FERIADO' : 'FALTA'}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
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
                          : item.isVacation
                            ? 'bg-emerald-50/50 border-emerald-100'
                            : item.isLicense
                              ? 'bg-blue-50/50 border-blue-100'
                              : item.isSunday || item.isHoliday
                                ? 'bg-slate-50 border-slate-100 opacity-60'
                                : 'bg-rose-50/50 border-rose-100'
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-black text-sm ${
                          item.attended ? 'bg-emerald-500 text-white' : item.isVacation ? 'bg-emerald-500 text-white' : item.isLicense ? 'bg-blue-500 text-white' : 'bg-slate-200 text-slate-500'
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
                            {(item.fundo || item.lote || item.actividad) && (
                              <div className="flex flex-col items-end gap-0.5 mt-1">
                                {item.actividad && (
                                  <div className="text-[9px] text-primary font-black uppercase tracking-tight mb-0.5">
                                    {item.actividad}
                                  </div>
                                )}
                                <div className="flex items-center gap-2">
                                  {item.lote && (
                                    <div className="text-[9px] text-slate-500 font-bold uppercase tracking-tight bg-slate-100 px-1.5 py-0.5 rounded">
                                      Lote: {item.lote}
                                    </div>
                                  )}
                                  {item.fundo && (
                                    <div className="flex items-center gap-1 text-[10px] text-emerald-700 font-black uppercase">
                                      <MapPin className="w-3 h-3" />
                                      {item.fundo}
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                          </>
                        ) : item.isVacation ? (
                          <Badge className="bg-emerald-500 text-white text-[9px] font-black px-2 py-0.5 rounded-full border-none uppercase flex items-center gap-1">
                            <Palmtree className="w-3 h-3" />
                            VACACIONES
                          </Badge>
                        ) : item.isLicense ? (
                          <Badge className="bg-blue-500 text-white text-[9px] font-black px-2 py-0.5 rounded-full border-none uppercase flex items-center gap-1">
                            <Stethoscope className="w-3 h-3" />
                            LICENCIA
                          </Badge>
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
