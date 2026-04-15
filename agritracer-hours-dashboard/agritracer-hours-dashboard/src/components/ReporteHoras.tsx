import React, { useState, useMemo } from 'react';
import { supabase, isSupabaseConfigured } from '@/src/lib/supabase';
import { AgritracerRecord } from '@/src/types';
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
  Search, 
  Clock, 
  MapPin, 
  Calendar as CalendarIcon,
  AlertCircle,
  User,
  History,
  ChevronLeft,
  ChevronRight,
  Loader2
} from 'lucide-react';
import { useEffect } from 'react';
import { format, parseISO, getYear, getWeek } from 'date-fns';
import { es } from 'date-fns/locale';
import { Badge } from '@/components/ui/badge';
import { normalizeDni } from '@/src/lib/utils';
import { Input } from "@/components/ui/input";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Skeleton } from '@/components/ui/skeleton';

export default function ReporteHoras() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedYear, setSelectedYear] = useState<string>("all");
  const [selectedWeek, setSelectedWeek] = useState<string>("all");
  const [data, setData] = useState<AgritracerRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const recordsPerPage = 10;
  
  const [suggestions, setSuggestions] = useState<{dni: string, trabajador: string, codigo_trabajador: string}[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isSearchingWorkers, setIsSearchingWorkers] = useState(false);

  // Debounced worker search for suggestions
  useEffect(() => {
    const timer = setTimeout(async () => {
      console.log('Searching for suggestions with term:', searchTerm);
      if (searchTerm.length < 3) {
        setSuggestions([]);
        setShowSuggestions(false);
        return;
      }

      if (!supabase) return;

      try {
        setIsSearchingWorkers(true);
        const term = searchTerm.trim();
        const isNumeric = /^\d+$/.test(term);
        
        let query = supabase.from('t_trabajador').select('dni, trabajador, codigo_trabajador');
        
        if (isNumeric) {
          query = query.or(`dni.ilike.%${term}%,codigo_trabajador.ilike.%${term}%`);
        } else {
          query = query.ilike('trabajador', `%${term}%`);
        }

        const { data: workers, error: workerError } = await query.limit(10);
        
        if (workerError) {
          console.error('Supabase error fetching suggestions:', workerError);
          setSuggestions([]);
          setShowSuggestions(false);
        } else if (workers) {
          console.log('Suggestions found:', workers.length);
          setSuggestions(workers);
          setShowSuggestions(true); // Always show if we have a term >= 3, even if empty (to show "no results")
        }
      } catch (err) {
        console.error('Error fetching worker suggestions:', err);
      } finally {
        setIsSearchingWorkers(false);
      }
    }, 500); // Increased debounce for better stability

    return () => clearTimeout(timer);
  }, [searchTerm]);

  const years = useMemo(() => {
    const currentYear = new Date().getFullYear();
    return Array.from({ length: 5 }, (_, i) => (currentYear - i).toString());
  }, []);

  const weeks = useMemo(() => {
    return Array.from({ length: 53 }, (_, i) => (i + 1).toString());
  }, []);

  function selectWorker(worker: any) {
    setSearchTerm(worker.trabajador);
    setShowSuggestions(false);
    performSearch(worker.dni, true, worker);
  }

  async function performSearch(term: string, isWorkerSelect: boolean = false, workerInfo?: any) {
    if (!isSupabaseConfigured || !supabase) {
      setError('Configuración de Supabase faltante.');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setHasSearched(true);
      setData([]); // Clear previous results

      const isNumeric = /^\d+$/.test(term);
      const normalizedTerm = isNumeric ? normalizeDni(term) : term;
      const rawTerm = term;
      
      // Base query
      let query = supabase.from('rpt_horas_agritracer').select('*');

      // 1. Apply mixed search filters
      if (isWorkerSelect && workerInfo) {
        // If we selected a worker, search by DNI variations to ensure we find them
        const dni = workerInfo.dni.toString().trim();
        const normalizedDniVal = normalizeDni(dni);
        const rawDniVal = dni.replace(/^0+/, ''); // Without leading zeros
        const paddedDniVal = dni.padStart(8, '0'); // With leading zeros
        
        const conditions = [
          `dni.eq.${dni}`,
          `dni.eq.${normalizedDniVal}`,
          `dni.eq.${rawTerm}`,
          `dni.eq.${paddedDniVal}`
        ];
        
        if (workerInfo.codigo_trabajador) {
          conditions.push(`codigo_trabajador.eq.${workerInfo.codigo_trabajador}`);
        }
        
        query = query.or(Array.from(new Set(conditions)).join(','));
      } else if (isNumeric) {
        // Search for both normalized DNI (8 digits) and raw DNI (as entered)
        query = query.or(`dni.eq.${normalizedTerm},dni.eq.${rawTerm},codigo_trabajador.eq.${term}`);
      } else {
        // Broad search - only if explicitly requested via "Consultar"
        query = query.ilike('trabajador', `%${term}%`);
      }

      // 2. CRITICAL: Apply Year/Week filters at DATABASE level to avoid timeouts
      if (selectedYear !== "all") {
        const startOfYear = `${selectedYear}-01-01`;
        const endOfYear = `${selectedYear}-12-31`;
        query = query.gte('fecha', startOfYear).lte('fecha', endOfYear);
      }

      // 3. Limit result set for performance
      query = query.order('fecha', { ascending: false }).limit(500);

      const { data: records, error: fetchError } = await query;

      if (fetchError) throw fetchError;
      
      // Final client-side week filtering (since week calculation in SQL is complex)
      const finalRecords = selectedWeek === "all" 
        ? (records || [])
        : (records || []).filter(r => getWeek(parseISO(r.fecha), { weekStartsOn: 1 }).toString() === selectedWeek);

      setData(finalRecords);
      setCurrentPage(1);
    } catch (err: any) {
      console.error('Error searching records:', err);
      setError(err.message || 'Error al buscar registros');
    } finally {
      setLoading(false);
    }
  }

  async function handleSearch(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!searchTerm.trim()) return;
    setShowSuggestions(false);
    performSearch(searchTerm);
  }

  const filteredData = useMemo(() => {
    return data.filter(r => {
      const matchesYear = selectedYear === "all" || getYear(parseISO(r.fecha)).toString() === selectedYear;
      const matchesWeek = selectedWeek === "all" || getWeek(parseISO(r.fecha), { weekStartsOn: 1 }).toString() === selectedWeek;
      return matchesYear && matchesWeek;
    });
  }, [data, selectedYear, selectedWeek]);

  const totalPages = Math.ceil(filteredData.length / recordsPerPage);
  const paginatedData = useMemo(() => {
    const startIndex = (currentPage - 1) * recordsPerPage;
    return filteredData.slice(startIndex, startIndex + recordsPerPage);
  }, [filteredData, currentPage]);

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

  return (
    <div className="p-4 md:p-8 space-y-8 max-w-7xl mx-auto">
      <header>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <History className="w-8 h-8 text-primary" />
          Reporte de Horas
        </h1>
        <p className="text-muted-foreground">Consulta el historial completo de asistencias por trabajador.</p>
      </header>

      <Card className="bg-muted/30 border-dashed overflow-visible">
        <CardContent className="pt-6 overflow-visible">
          <form onSubmit={handleSearch} className="flex flex-col md:flex-row gap-4 overflow-visible">
            <div className="relative flex-1 overflow-visible">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por Trabajador, DNI o Código..."
                  className="pl-10 h-11"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onFocus={() => searchTerm.length >= 3 && setShowSuggestions(true)}
                />
                {isSearchingWorkers && (
                  <div className="absolute right-3 top-3">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                )}
              </div>

              {/* Autocomplete Suggestions */}
              {showSuggestions && searchTerm.length >= 3 && (
                <div className="absolute z-50 w-full mt-1 bg-background border rounded-md shadow-lg max-h-60 overflow-auto">
                  {suggestions.length > 0 ? (
                    suggestions.map((worker) => (
                      <button
                        key={worker.dni}
                        type="button"
                        className="w-full text-left px-4 py-2 hover:bg-muted transition-colors flex flex-col border-b last:border-0"
                        onClick={() => selectWorker(worker)}
                      >
                        <span className="font-medium text-sm">{worker.trabajador}</span>
                        <span className="text-[10px] text-muted-foreground font-mono">
                          DNI: {worker.dni} {worker.codigo_trabajador ? `| CÓD: ${worker.codigo_trabajador}` : ''}
                        </span>
                      </button>
                    ))
                  ) : !isSearchingWorkers && (
                    <div className="px-4 py-3 text-sm text-muted-foreground text-center italic">
                      No se encontraron trabajadores
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <div className="flex items-center gap-1 bg-background p-1 rounded-md border h-11">
                <span className="text-[10px] uppercase font-bold px-2 text-muted-foreground">Año</span>
                <select 
                  value={selectedYear} 
                  onChange={(e) => setSelectedYear(e.target.value)}
                  className="text-sm bg-transparent border-none focus:ring-0 px-2 outline-none"
                >
                  <option value="all">Todos</option>
                  {years.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-1 bg-background p-1 rounded-md border h-11">
                <span className="text-[10px] uppercase font-bold px-2 text-muted-foreground">Sem.</span>
                <select 
                  value={selectedWeek} 
                  onChange={(e) => setSelectedWeek(e.target.value)}
                  className="text-sm bg-transparent border-none focus:ring-0 px-2 outline-none"
                >
                  <option value="all">Todas</option>
                  {weeks.map(w => <option key={w} value={w}>{w}</option>)}
                </select>
              </div>
              <Button type="submit" className="h-11 px-8" disabled={loading}>
                {loading ? "Buscando..." : "Consultar"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {error && (
        <div className="flex items-center gap-2 p-4 text-destructive bg-destructive/10 rounded-lg border border-destructive/20">
          <AlertCircle className="h-5 w-5" />
          <p className="text-sm font-medium">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : hasSearched ? (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Historial de Asistencias</CardTitle>
              <CardDescription>
                {filteredData.length > 0 
                  ? `Se encontraron ${filteredData.length} registros para la búsqueda.` 
                  : "No se encontraron registros con los filtros aplicados."}
              </CardDescription>
            </div>
            {filteredData.length > 0 && (
              <Badge variant="secondary" className="font-mono">
                Total Horas: {filteredData.reduce((acc, curr) => acc + parseIntervalToHours(curr.total_horas), 0).toFixed(2)}h
              </Badge>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-md border overflow-hidden">
              <div className="overflow-x-auto">
                <div className="min-w-[800px]">
                  <Table>
                    <TableHeader className="sticky top-0 bg-background z-20 shadow-sm">
                      <TableRow className="bg-muted/50">
                        <TableHead className="py-3 sticky top-0 bg-background z-20">Fecha</TableHead>
                        <TableHead className="py-3 sticky top-0 bg-background z-20">Trabajador</TableHead>
                        <TableHead className="py-3 sticky top-0 bg-background z-20">Fundo / Lote</TableHead>
                        <TableHead className="py-3 sticky top-0 bg-background z-20">Actividad</TableHead>
                        <TableHead className="py-3 sticky top-0 bg-background z-20 text-right">Horas</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedData.map((record, i) => (
                        <TableRow key={i} className="hover:bg-muted/50 transition-colors">
                          <TableCell className="font-medium py-3">
                            {format(parseISO(record.fecha), 'dd/MM/yyyy')}
                          </TableCell>
                          <TableCell className="py-3">
                            <div className="flex flex-col">
                              <span className="font-semibold text-sm leading-tight">{record.trabajador}</span>
                              <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                                <span className="font-mono">DNI: {normalizeDni(record.dni)}</span>
                                {record.codigo_trabajador && (
                                  <span className="font-mono">CÓD: {record.codigo_trabajador}</span>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="py-3">
                            <div className="flex items-center gap-1 text-xs">
                              <MapPin className="w-3 h-3" />
                              {record.fundo} {record.lote ? `- ${record.lote}` : ''}
                            </div>
                          </TableCell>
                          <TableCell className="py-3">
                            <Badge variant="outline" className="font-normal text-[10px] py-0 h-5">
                              {record.actividad}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono font-bold py-3">
                            {parseIntervalToHours(record.total_horas).toFixed(2)}h
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between py-2 border-t">
                <div className="text-sm text-muted-foreground">
                  Página <span className="font-medium text-foreground">{currentPage}</span> de <span className="font-medium text-foreground">{totalPages}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                    className="h-8 w-8 p-0"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  
                  <div className="flex items-center gap-1">
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let pageNum;
                      if (totalPages <= 5) {
                        pageNum = i + 1;
                      } else if (currentPage <= 3) {
                        pageNum = i + 1;
                      } else if (currentPage >= totalPages - 2) {
                        pageNum = totalPages - 4 + i;
                      } else {
                        pageNum = currentPage - 2 + i;
                      }
                      
                      return (
                        <Button
                          key={pageNum}
                          variant={currentPage === pageNum ? "default" : "outline"}
                          size="sm"
                          onClick={() => setCurrentPage(pageNum)}
                          className="h-8 w-8 p-0 text-xs"
                        >
                          {pageNum}
                        </Button>
                      );
                    })}
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    disabled={currentPage === totalPages}
                    className="h-8 w-8 p-0"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-center border-2 border-dashed rounded-xl bg-muted/10">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4 text-primary">
            <User className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-semibold">Inicia una búsqueda</h3>
          <p className="text-muted-foreground max-w-xs">
            Ingresa el nombre, DNI o código del trabajador para consultar su historial de horas.
          </p>
        </div>
      )}
    </div>
  );
}
