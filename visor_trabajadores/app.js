// Configuración de Supabase
const SUPABASE_URL = 'https://jdtgsudjgasgtmfbmeyu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpkdGdzdWRqZ2FzZ3RtZmJtZXl1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4MzE0MjMsImV4cCI6MjA4OTQwNzQyM30.8GfTn99z_XdTmOKPB2dgQKdJ_UphjO-5ynlflx8PajQ';

const dbClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { 
        persistSession: true, // Re-activado para garantizar el acceso.
        autoRefreshToken: true,
        detectSessionInUrl: false
    },
    global: { headers: { 'x-application-name': 'portal-talento' } }
});

// Autenticación Global
let currentUser = null;

// Variables Globales
Chart.register(ChartDataLabels);
const PAGE_SIZE = 15;
let currentPage = 0;
let searchQuery = '';
let data = [];
let currentView = 'trabajador';

// activeFilter guardará: { column: 'fundo', value: '...', label: 'Fundo: xyz' }
let activeFilter = null; 
let rankingData = []; // Guardará el pool de especialistas agrupados (Top 1500)
let activityChartInstance = null; // Instancia global para evitar duplicados de Chart.js
let profileActivityChartInstance = null; // Instancia para gráfico en perfil de trabajador
let priceEvolutionChartInstance = null; // Instancia para dashboard visual de precios
let agtActivityChartInstance = null; // Instancia para distribución de horas por actividad
let agtFundoChartInstance = null;    // Instancia para concentración por fundo
let agtAttendanceChartInstance = null; // Instancia para evolución de asistencia diaria
// Elementos del DOM
const cardsContainer = document.getElementById('cardsContainer');
const tableContainer = document.getElementById('tableContainer');
const tableHead = document.getElementById('tableHead');
const tableBody = document.getElementById('tableBody');
const totalCountElement = document.getElementById('totalCount');
const totalCountLabel = document.getElementById('totalCountLabel');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const pageInfo = document.getElementById('pageInfo');
const searchInput = document.getElementById('searchInput');

// Titles & Controls
const mainTitle = document.getElementById('mainTitle');
const mainSubtitle = document.getElementById('mainSubtitle');
const mainIcon = document.getElementById('mainIcon');
const tableTitle = document.getElementById('tableTitle');
const navButtons = document.querySelectorAll('.nav-btn');
const opCards = document.querySelectorAll('.op-card');
const clearFilterBtn = document.getElementById('clearFilterBtn');
const filterLabel = document.getElementById('filterLabel');

// Ranking Specific
const CONSTANCY_THRESHOLD = 100;
const START_YEAR = 2022;
const getRankingYears = () => {
    const current = new Date().getFullYear();
    const years = [];
    for (let y = current; y >= START_YEAR; y--) years.push(y);
    return years;
};

const rankingFiltersContainer = document.getElementById('rankingFilters');
const rankingFilterBtns = document.querySelectorAll('.ranking-filter-btn');
const yearFilter = document.getElementById('yearFilter');
let activeRankingActivity = 'PODA';
let activeValidityYear = 'all'; 

function formatDateOnly(dateString) {
    if (!dateString) return '-';
    return dateString.split('T')[0]; 
}

/**
 * Función genérica para obtener TODOS los registros de una tabla paginada.
 * Supera el límite de 1000 registros de Supabase.
 */
async function fetchFullTable(tableName, queryBuilder) {
    let allData = [];
    let from = 0;
    let to = 999;
    let finished = false;

    while (!finished) {
        const { data: page, error } = await queryBuilder(dbClient.from(tableName)).range(from, to);
        if (error) { console.error(`Error en ${tableName}:`, error); break; }
        if (page && page.length > 0) {
            allData = allData.concat(page);
            from += 1000;
            to += 1000;
        } else {
            finished = true;
        }
        // Seguridad para no entrar en loop infinito si el API falla raro
        if (page && page.length < 1000) finished = true;
    }
    return allData;
}

// Configuración de Modelos por Vista
const viewsConfig = {
    trabajador: {
        title: 'Directorio Inteligente',
        subtitle: 'Directorio de Personal y Análisis de Rendimiento',
        icon: 'ph-users',
        searchPlaceholder: 'Ingresa nombre, DNI o código...',
        tableTitle: 'Catálogo de Trabajadores',
        emptySearchMessage: 'Buscando datos de trabajadores...',
        table: 'mv_estadisticas_trabajador',
        select_query: '*',
        searchFields: ['dni', 'trabajador', 'codigo_trabajador', 'telefono_principal', 'procedencia', 'genero'],
        get headers() {
            const criterion = document.getElementById('rankingCriterionFilter')?.value || 'directorio';
            if (criterion === 'directorio') {
                return [
                    'DNI', 
                    'Nombres', 
                    'Código', 
                    '<i class="ph-duotone ph-calendar-check" style="color:var(--primary-color)"></i> Último Día Labor',
                    '<i class="ph-duotone ph-briefcase" style="color:var(--primary-color)"></i> Perfil y Contacto'
                ];
            } else if (criterion === 'asistencia') {
                return ['Pos.', 'Trabajador', '<i class="ph ph-phone"></i> Teléfono', 'Total Jornales', 'Acción'];
            } else {
                return ['Pos.', 'Trabajador', '<i class="ph ph-phone"></i> Teléfono', 'Rendimiento Medio (%)', 'Acción'];
            }
        },
        renderRow: (i, index) => {
            const criterion = document.getElementById('rankingCriterionFilter')?.value || 'directorio';
            let activity = 'general';
            const activeBtn = document.querySelector('.t-chip.active');
            if(activeBtn) { activity = activeBtn.dataset.act || 'general'; }
            
            let phoneHtml = '<span style="color:#94a3b8">-</span>';
            if (i.telefono_principal) {
                const iconClass = i.tiene_whatsapp ? 'ph-whatsapp-logo' : 'ph-phone';
                const iconStyle = i.tiene_whatsapp ? 'style="color:#22c55e"' : '';
                phoneHtml = `
                    <div style="display:flex; align-items:center; gap:0.4rem;">
                        <i class="ph ${iconClass}" ${iconStyle} title="${i.tiene_whatsapp ? 'Tiene WhatsApp' : 'Solo Teléfono'}"></i>
                        <span style="font-weight: 500;">${i.telefono_principal}</span>
                    </div>`;
            }
            
            if (criterion === 'directorio') {
                // Lógica de Último Día Labor
                let lastWorkHtml = '<span style="color:#94a3b8; font-size:0.8rem; font-style:italic;">Sin registro</span>';
                if (i.ultimo_dia_labor) {
                    const lastDate = new Date(i.ultimo_dia_labor);
                    const diffDays = Math.floor((new Date() - lastDate) / (1000 * 60 * 60 * 24));
                    let statusClass = 'last-work-old';
                    if (diffDays <= 7) statusClass = 'last-work-recent';
                    else if (diffDays <= 30) statusClass = 'last-work-active';
                    
                    lastWorkHtml = `
                        <div class="last-work-container">
                            <span class="last-work-badge ${statusClass}">
                                ${formatDateOnly(i.ultimo_dia_labor)}
                            </span>
                            <span class="last-work-time-ago">Hace ${diffDays} días</span>
                        </div>
                    `;
                }

                // Celda Fusionada: Perfil y Contacto
                let genderIcon = 'ph-gender-intersex';
                if (i.genero && i.genero.toUpperCase().startsWith('M')) genderIcon = 'ph-gender-male';
                if (i.genero && i.genero.toUpperCase().startsWith('F')) genderIcon = 'ph-gender-female';

                return `
                    <td class="fw-medium">${i.dni || '-'}</td>
                    <td>${i.trabajador || '-'}</td>
                    <td>${i.codigo_trabajador ? `<span class="tag tag-secondary">${i.codigo_trabajador}</span>` : '<span style="color:#94a3b8">-</span>'}</td>
                    <td>${lastWorkHtml}</td>
                    <td>
                        <div class="fusion-cell-container">
                            <div class="fusion-info-group">
                                <div class="fusion-info-main">
                                    <i class="ph ${genderIcon}"></i>
                                    ${i.telefono_principal ? `
                                        <i class="ph ${i.tiene_whatsapp ? 'ph-whatsapp-logo' : 'ph-phone'}" ${i.tiene_whatsapp ? 'style="color:#22c55e"' : ''}></i>
                                        <span>${i.telefono_principal}</span>
                                    ` : '<span>Sin Teléfono</span>'}
                                </div>
                                <div class="fusion-info-sub" title="${i.procedencia || 'Sin procedencia'}">
                                    <i class="ph ph-map-pin"></i>
                                    ${i.procedencia || '-'}
                                </div>
                            </div>
                            <button class="quick-edit-btn" onclick="event.stopPropagation(); window.openEditModalDirectly('${i.dni}')" title="Editar datos">
                                <i class="ph-duotone ph-note-pencil"></i>
                            </button>
                        </div>
                    </td>
                `;
            } else {
                const realIndex = (window.currentPage || 0) * (window.PAGE_SIZE || 20) + index;
                const isTop3 = realIndex < 3;
                const rankClass = realIndex === 0 ? 'rank-1' : (realIndex === 1 ? 'rank-2' : (realIndex === 2 ? 'rank-3' : ''));
                const rankContent = isTop3 ? `<i class="ph ph-medal"></i>` : `<span style="font-size:0.8rem">${realIndex + 1}</span>`;
                
                let statsHtml = '';
                if (criterion === 'asistencia') {
                    const val = i[`total_jornales_${activity}`] || 0;
                    statsHtml = `<span class="total-badge" style="background:#0f172a;color:white">${val}</span>`;
                } else if (criterion === 'rendimiento') {
                    const activityCol = activity === 'general' ? 'global' : activity;
                    const val = Number(i[`promedio_rendimiento_${activityCol}`] || 0).toFixed(2);
                    statsHtml = `<span class="total-badge" style="background:#fef08a;color:#854d0e">${val}%</span>`;
                }
                
                return `
                    <td class="text-center"><span class="rank-chip ${rankClass}">${rankContent}</span></td>
                    <td>
                        <div class="fw-medium">${i.trabajador || '-'}</div>
                        <div style="font-size:0.7rem; color:var(--text-secondary)">DNI: ${i.dni}</div>
                    </td>
                    <td>${phoneHtml}</td>
                    <td class="text-center">${statsHtml}</td>
                    <td class="text-center">
                        <button class="quick-edit-btn" onclick="event.stopPropagation(); window.openEditModalDirectly('${i.dni}')" title="Editar datos">
                            <i class="ph-duotone ph-note-pencil"></i>
                        </button>
                    </td>
                `;
            }
        },
        suggestionTable: 't_trabajador',
        suggestionField: 'trabajador'
    },
    subgerencia_detail: {
        title: 'Dashboard de Sede',
        subtitle: 'Gestión y Control de Subgerencia',
        icon: 'ph-buildings',
        table: 't_fundo_gnrl'
    },
    operacion: {
        title: 'Gestión de Subgerencias',
        subtitle: 'Catálogo de Subgerencias',
        icon: 'ph-wrench',
        searchPlaceholder: 'Buscar Subgerencia...',
        tableTitle: 'Lista de Subgerencias',
        emptySearchMessage: 'Comienza a escribir para buscar en el registro',
        table: 't_operacion',
        select_query: '*, t_fundo_gnrl(count)',
        searchFields: ['codigo_operacion', 'operacion'],
        headers: ['Sede', 'Subgerencia', 'Fundos Gnr.', 'Explorar Nivel Inferior', 'Fecha'],
        renderRow: (i) => {
            const numFundos = (i.t_fundo_gnrl && i.t_fundo_gnrl[0]) ? i.t_fundo_gnrl[0].count : 0;
            return `
            <td>${i.codigo_sede ? i.codigo_sede : '<span style="color:#94a3b8">-</span>'}</td>
            <td class="fw-medium">Subgerencia ${i.operacion || '-'}</td>
            <td><span class="tag tag-secondary" style="font-weight:600;"><i class="ph ph-tree"></i> ${numFundos} Fundos</span></td>
            <td>
                <button class="drilldown-btn" onclick="window.goToView('fundo_gnrl', 't_operacion.operacion', \`${i.operacion}\`, \`Subgerencia: ${i.operacion}\`)">
                    Ver Fundos Generales <i class="ph ph-arrow-right"></i>
                </button>
            </td>
            <td>${formatDate(i.fecha_creacion)}</td>
        `;
        },
        suggestionTable: 't_operacion',
        suggestionField: 'operacion'
    },
    fundo_gnrl: {
        title: 'Fundos Generales',
        subtitle: 'Estructura Operativa Nivel 2',
        icon: 'ph-tree',
        searchPlaceholder: 'Buscar Fundo General...',
        tableTitle: 'Catálogo de Fundos Generales',
        emptySearchMessage: 'Busca por código o nombre del fundo general.',
        table: 't_fundo_gnrl',
        select_query: '*, t_operacion!inner(operacion)',
        searchFields: ['codigo_fundo_gnrl', 'fundo_general'],
        headers: ['Subgerencia Responsable', 'Fundo General', 'Explorar Nivel Inferior', 'Fecha'],
        renderRow: (i) => {
            const opName = i.t_operacion?.operacion || i.codigo_operacion || '-';
            return `
            <td><span class="tag tag-secondary">Subgerencia ${opName}</span></td>
            <td class="fw-medium">${i.fundo_general || '-'}</td>
            <td>
                <button class="drilldown-btn" onclick="window.goToView('fundo', 't_fundo_gnrl.fundo_general', \`${i.fundo_general}\`, \`Fundo Padre: ${i.fundo_general}\`)">
                    Ver Fundos Secundarios <i class="ph ph-arrow-down-right"></i>
                </button>
            </td>
            <td>${formatDate(i.fecha_creacion)}</td>
        `;
        },
        suggestionTable: 't_fundo_gnrl',
        suggestionField: 'fundo_general'
    },
    fundo: {
        title: 'Fundos Específicos',
        subtitle: 'Estructura Operativa Nivel 3',
        icon: 'ph-leaf',
        searchPlaceholder: 'Buscar Fundo...',
        tableTitle: 'Desglose de Fundos',
        emptySearchMessage: 'Busca un fundo específico por nombre o código.',
        table: 't_fundo',
        select_query: '*, t_fundo_gnrl!inner(fundo_general, t_operacion(operacion))',
        searchFields: ['codigo_fundo', 'fundo'],
        headers: ['Jerarquía Padre', 'Fundo Destino', 'Código Fundo', 'Lotes', 'Fecha'],
        renderRow: (i) => {
            const op = i.t_fundo_gnrl?.t_operacion?.operacion || 'Sin Op';
            const fg = i.t_fundo_gnrl?.fundo_general || 'Sin Padre';
            return `
            <td>
                <div style="font-size:0.75rem; color:var(--text-secondary)">Op. ${op}</div>
                <div style="font-weight:500">${fg}</div>
            </td>
            <td class="fw-medium" style="color:var(--primary-color)">${i.fundo || '-'}</td>
            <td><span class="tag">${i.codigo_fundo || '-'}</span></td>
            <td>
                <button class="drilldown-btn" onclick="window.goToView('fundo_lote', 'codigo_fundo', \`${i.codigo_fundo}\`, \`Fundo: ${i.fundo}\`)">
                    Ver Lotes <i class="ph ph-squares-four"></i>
                </button>
            </td>
            <td>${formatDate(i.fecha_creacion)}</td>
        `;
        },
        suggestionTable: 't_fundo',
        suggestionField: 'fundo'
    },
    fundo_lote: {
        title: 'Lotes de Producción',
        subtitle: 'Estructura Operativa Nivel 4',
        icon: 'ph-squares-four',
        searchPlaceholder: 'Buscar Código Lote...',
        tableTitle: 'Catálogo de Lotes Asignados',
        emptySearchMessage: 'Busca el código de lote o ingresa para un fundo',
        table: 'v_lote_fundo_actual',
        orderField: 'codigo_lote',
        select_query: '*',
        searchFields: ['codigo_lote'],
        headers: ['Fundo Destino', 'Código Lote', 'Datos Lote', 'Temporada', 'Vigencia en Fundo'],
        renderRow: (i) => {
            const fundoName = i.nombre_fundo || i.codigo_fundo || '-';
            const loteName = i.lote || 'Lote Enlazado'; 
            const periodo = `Año ${i.anio || '-'} | Sem ${i.semana || '-'}`;
            const vigencia = `Inicio: ${formatDateOnly(i.fecha_inicio)}<br/>Fin: ${i.fecha_fin ? formatDateOnly(i.fecha_fin) : '<span style="color:#10b981;font-weight:600">Actualidad</span>'}`;
            return `
            <td><div style="font-weight:500">${fundoName}</div></td>
            <td><span class="tag tag-secondary" style="font-size:0.8rem">${i.codigo_lote || '-'}</span></td>
            <td class="fw-medium">${loteName}</td>
            <td><span class="tag" style="background:#fef08a;color:#854d0e">${periodo}</span></td>
            <td><div style="font-size:0.8rem; line-height:1.4">${vigencia}</div></td>
        `;
        },
        suggestionTable: 't_lote',
        suggestionField: 'codigo_lote'
    },

    actividad: {
        title: 'Gestión de Actividades',
        subtitle: 'Catálogo Maestro de Labores (Agritracer)',
        icon: 'ph-list-checks',
        searchPlaceholder: 'Buscar Actividad o Código...',
        tableTitle: 'Lista de Actividades AGT',
        emptySearchMessage: 'Comienza a escribir para buscar una actividad',
        table: 't_actividad',
        orderField: 'actividad_agt', // Orden alfabético
        orderAsc: true, // A-Z
        select_query: '*, t_labor(labor)', // Join para nombre de labor
        searchFields: ['codigo_actividad', 'actividad_agt'],
        headers: ['Código', 'Actividad AGT', 'Labor Beta', 'Fecha Registro', 'Acciones'],
        renderRow: (i) => {
            const laborName = i.t_labor?.labor || i.codigo_labor || '-';
            const isAssigned = !!i.codigo_labor;
            
            // Lógica de botones premium con colores corporativos
            const actionButtons = isAssigned 
                ? `<button class="btn-edit" onclick="openAssignModal('${i.actividad_agt}', '${i.codigo_actividad}')" title="Modificar Labor"><i class="ph ph-pencil-simple-line"></i></button>
                   <button class="btn-delete" onclick="unassignLabor('${i.codigo_actividad}')" title="Quitar Labor"><i class="ph ph-link-break"></i></button>`
                : `<button class="btn-edit" style="background:var(--accent-color); color:white; border-color:var(--accent-hover);" onclick="openAssignModal('${i.actividad_agt}', '${i.codigo_actividad}')" title="Asignar Labor"><i class="ph ph-plus-circle"></i></button>`;
            
            return `
            <td class="fw-medium">${i.codigo_actividad || '-'}</td>
            <td style="font-size: 0.85rem;">${i.actividad_agt || '-'}</td>
            <td>
                ${i.codigo_labor ? `<span class="tag tag-primary" title="Código: ${i.codigo_labor}"><i class="ph ph-hash"></i> ${laborName}</span>` : '<span style="color:#94a3b8">Sin Asignar</span>'}
            </td>
            <td>${formatDateOnly(i.fecha_creacion)}</td>
            <td>
                <div class="table-actions">
                    ${actionButtons}
                </div>
            </td>
        `;
        },
        suggestionTable: 't_actividad',
        suggestionField: 'actividad_agt'
    },
    labor: {
        title: 'Gestión de Labores (Beta)',
        subtitle: 'Catálogo de Definiciones Técnicas',
        icon: 'ph-plant',
        searchPlaceholder: 'Buscar Labor...',
        tableTitle: 'Maestro de Labores',
        emptySearchMessage: 'Busca por nombre o código de labor',
        table: 't_labor',
        orderField: 'labor',
        orderAsc: true,
        select_query: '*',
        searchFields: ['codigo_labor', 'labor'],
        headers: ['Código', 'Labor', 'U. Medida', 'Acciones'],
        renderRow: (i) => `
            <td class="fw-medium">${i.codigo_labor || '-'}</td>
            <td>${i.labor || '-'}</td>
            <td><span class="tag tag-secondary">${i.unid_medida || '-'}</span></td>
            <td>
                <button class="btn-edit" onclick="editLabor('${i.codigo_labor}')" title="Editar"><i class="ph ph-pencil"></i></button>
                <button class="btn-delete" onclick="deleteLabor('${i.codigo_labor}')" title="Eliminar"><i class="ph ph-trash"></i></button>
            </td>
        `,
        suggestionTable: 't_labor',
        suggestionField: 'labor'
    },
    precio: {
        title: 'Gestión de Tarifas y Metas',
        subtitle: 'Análisis Comparativo por Año y Lote',
        icon: 'ph-currency-dollar',
        searchPlaceholder: 'Buscar actividad...',
        tableTitle: 'Tablero de Métricas Técnicas (2023 - 2026)',
        emptySearchMessage: 'Busca por nombre de actividad',
        table: 't_precio', 
        orderField: ['codigo_actividad', 'codigo_lote', 'semana'],
        orderAsc: true,
        select_query: '*, t_actividad(actividad_agt), t_lote(lote)', 
        searchFields: ['t_actividad.actividad_agt'], 
        headers: ['Sem.', 'Actividad / Lote', 'Métricas 2023', 'Métricas 2024', 'Métricas 2025', 'Métricas 2026'],
        renderRow: (i, index, maxVal, prevWeekItem) => {
            const formatPrice = (v) => parseFloat(v || 0).toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
            const actName = i.actividad || '-';
            
            // Lógica para el badge de Lote/General
            let lotLabel = '';
            if (i.codigo_lote === null) {
                lotLabel = '<span class="status-pill-subtle status-general">General / Sin Lote</span>';
            } else if (i.lote === null && i.codigo_lote === null) { 
                 lotLabel = '<span class="status-pill-subtle status-general">Vista Consolidada</span>';
            } else {
                lotLabel = `<span class="status-pill-subtle status-lote">Lote: ${i.lote || i.codigo_lote || '-'}</span>`;
            }

            const renderYearCell = (currentVal, prevYearVal, year) => {
                if (!currentVal) return '<div class="empty-evolution">—</div>';
                
                // 1. Tendencia Interanual (↑/↓ vs Año Anterior)
                let yearTrendBadge = '';
                if (prevYearVal && prevYearVal.precio && currentVal.precio) {
                    const diff = ((currentVal.precio - prevYearVal.precio) / prevYearVal.precio) * 100;
                    if (Math.abs(diff) > 0.01) {
                        const isUp = diff > 0;
                        const icon = isUp ? 'ph-trend-up' : 'ph-trend-down';
                        const cls = isUp ? 'up' : 'down';
                        yearTrendBadge = `<span class="trend-badge-pill ${cls}" title="vs Año Anterior"><i class="ph ${icon}"></i> ${Math.abs(diff).toFixed(1)}%</span>`;
                    } else {
                        yearTrendBadge = `<span class="trend-badge-pill neutral">-</span>`;
                    }
                }

                // 2. Tendencia Semanal (⬈/⬊ vs Semana Anterior en el mismo año)
                let weeklyTrendBadge = '';
                if (prevWeekItem && prevWeekItem.years[year] && prevWeekItem.years[year].precio && currentVal.precio) {
                    const prevPrice = prevWeekItem.years[year].precio;
                    const wDiff = ((currentVal.precio - prevPrice) / prevPrice) * 100;
                    if (Math.abs(wDiff) > 0.01) {
                        const isUp = wDiff > 0;
                        const icon = isUp ? 'ph-arrow-up-right' : 'ph-arrow-down-right';
                        const cls = isUp ? 'up' : 'down';
                        weeklyTrendBadge = `<span class="weekly-trend-badge ${cls}" title="vs Semana Anterior (Mismo Año)"><i class="ph ${icon}"></i> ${Math.abs(wDiff).toFixed(1)}% sem</span>`;
                    }
                }

                return `
                    <div class="metric-glass-card">
                        <div class="metric-row-main">
                            <span class="metric-price-premium">S/ ${formatPrice(currentVal.precio)}</span>
                            ${yearTrendBadge}
                        </div>
                        <div class="metric-footer-container">
                            <div class="metric-footer-subtle">
                                <span>Tar: ${currentVal.tarea || '-'}</span>
                                <span>Met: ${currentVal.meta || '-'}</span>
                            </div>
                            ${weeklyTrendBadge}
                        </div>
                    </div>
                `;
            };

            return `
                <td style="text-align: center; font-weight: 800; color: var(--primary-color); font-size: 1.1rem;">${i.semana}</td>
                <td style="min-width: 250px;">
                    <div class="activity-display-group">
                        <div class="activity-title-premium">${actName}</div>
                        ${lotLabel}
                    </div>
                </td>
                <td class="metric-year-col">${renderYearCell(i.years[2023], null, 2023)}</td>
                <td class="metric-year-col">${renderYearCell(i.years[2024], i.years[2023], 2024)}</td>
                <td class="metric-year-col">${renderYearCell(i.years[2025], i.years[2024], 2025)}</td>
                <td class="metric-year-col">${renderYearCell(i.years[2026], i.years[2025], 2026)}</td>
            `;
        },
        suggestionTable: 't_actividad',
        suggestionField: 'actividad_agt'
    },
    agritracer: {
        title: 'Métricas Operativas Agritracer',
        subtitle: 'Análisis de Jornadas, Horas y Rendimientos',
        icon: 'ph-chart-bar',
        searchPlaceholder: 'Búsqueda no disponible en esta vista',
        tableTitle: 'Resumen Mensual Agritracer',
        headers: [],
        renderRow: () => ''
    }
};

// Utilidad para cambiar de vista por el usuario vía botones (Drill Down)
window.goToView = function(viewName, filterCol, filterVal, labelStr) {
    currentView = viewName;
    activeFilter = filterCol ? { column: filterCol, value: filterVal, label: labelStr } : null;
    navButtons.forEach(b => {
        if(b.dataset.view === viewName) b.classList.add('active');
        else b.classList.remove('active');
    });
    searchQuery = '';
    currentPage = 0;
    setupView();
};

function formatDate(date) {
    if (!date) return '-';
    return new Intl.DateTimeFormat('es-PE', {
        year: 'numeric', month: 'short', day: '2-digit', 
        hour: '2-digit', minute: '2-digit'
    }).format(new Date(date));
}

function setupView() {
    const config = viewsConfig[currentView];
    
    // Toggle class for layout specific offsets (vía CSS)
    const dashboardLayout = document.getElementById('dashboardLayout');
    if (dashboardLayout) {
        if (currentView === 'trabajador') dashboardLayout.classList.add('view-trabajador');
        else dashboardLayout.classList.remove('view-trabajador');
    }
    
    // 1. Reset de visibilidad universal (Siempre se ejecuta)
    cardsContainer.style.display = 'none';
    tableContainer.style.display = 'none';
    if (typeof workerProfileContainer !== 'undefined') workerProfileContainer.style.display = 'none';
    if (clearFilterBtn) clearFilterBtn.style.display = 'none';
    
    // Ocultar todos los HUBs para evitar solapamientos
    if (document.getElementById('subgerenciaHub')) document.getElementById('subgerenciaHub').style.display = 'none';
    if (document.getElementById('subgerenciaDetailHub')) document.getElementById('subgerenciaDetailHub').style.display = 'none';
    if (document.getElementById('fundoGnrlHub')) document.getElementById('fundoGnrlHub').style.display = 'none';
    if (document.getElementById('fundoHub')) document.getElementById('fundoHub').style.display = 'none';
    if (document.getElementById('loteHub')) document.getElementById('loteHub').style.display = 'none';
    const agtMetricsContainer = document.getElementById('agtMetricsContainer');
    if (agtMetricsContainer) agtMetricsContainer.style.display = 'none';

    const unifiedControls = document.getElementById('unifiedControlsContainer');
    if (unifiedControls) {
        unifiedControls.style.display = currentView === 'trabajador' ? 'flex' : 'none';
    }

    // 2. Configuración de títulos e iconos
    mainTitle.textContent = config.title;
    mainSubtitle.textContent = config.subtitle;
    mainIcon.className = `ph ${config.icon} logo-icon`;

    // 3. Manejo de Acciones específicas
    const laborActions = document.getElementById('laborActions');
    const priceActions = document.getElementById('priceActions');
    if (laborActions) laborActions.style.display = currentView === 'labor' ? 'block' : 'none';
    if (priceActions) priceActions.style.display = currentView === 'precio' ? 'block' : 'none';

    // 3.1 Manejo de Filtros Avanzados para Precios y Buscador Global
    const priceFilters = document.getElementById('priceFiltersContainer');
    const globalSearch = document.getElementById('globalSearchBox');

    if (currentView === 'precio') {
        if (priceFilters) priceFilters.style.display = 'block';
        if (globalSearch) globalSearch.style.display = 'none';
        initPriceFilters();
    } else {
        if (priceFilters) priceFilters.style.display = 'none';
        if (globalSearch) globalSearch.style.display = 'flex';
    }

    const priceChartWrapper = document.getElementById('priceChartWrapper');
    if (priceChartWrapper) {
        if (currentView === 'precio') {
            priceChartWrapper.style.display = 'block';
            const chartContent = document.getElementById('priceChartContent');
            const emptyState = document.getElementById('priceChartEmptyState');
            if (searchQuery) {
                chartContent.style.display = 'block';
                emptyState.style.display = 'none';
            } else {
                chartContent.style.display = 'none';
                emptyState.style.display = 'flex';
            }
        } else {
            priceChartWrapper.style.display = 'none';
        }
    }

    if (currentView === 'agritracer') {
        const agtContainer = document.getElementById('agtMetricsContainer');
        if (agtContainer) {
            agtContainer.style.display = 'block';
            initAgtFilters(); // Asegurar que inicie en el periodo actual
        }
        fetchAgtMetricsView();
        return;
    }

    // 4. Lógica de vista de Hub de Subgerencias (Alto Impacto)
    if (currentView === 'operacion') {
        cardsContainer.style.display = 'block';
        document.getElementById('subgerenciaHub').style.display = 'grid';
        getTotalCount();
        renderSubgerenciaHub();
        return;
    }

    if (currentView === 'subgerencia_detail') {
        cardsContainer.style.display = 'block';
        document.getElementById('subgerenciaDetailHub').style.display = 'grid';
        getTotalCount(); // AGREGADO: Para actualizar la etiqueta de Fundos Generales
        renderSubgerenciaDetailHub(activeFilter.value);
        return;
    }

    // 4.5 Lógica de vista de Hub de Fundos Generales (Siempre Hub, con o sin filtro)
    if (currentView === 'fundo_gnrl') {
        cardsContainer.style.display = 'block';
        document.getElementById('fundoGnrlHub').style.display = 'grid';
        
        // Mostrar botón de limpiar filtro si existe
        if (activeFilter && activeFilter.column) {
            clearFilterBtn.style.display = 'inline-flex';
            filterLabel.textContent = `Quitar Filtro (${activeFilter.label})`;
            // Subtítulo premium dinámico
            mainSubtitle.innerHTML = `<span style="color:var(--primary-color); font-weight:700;">Filtrado por:</span> ${activeFilter.label}`;
        }

        getTotalCount();
        renderFundoGnrlHub();
        return;
    }

    // 4.6 Lógica de vista de Hub de Fundos (Específicos)
    if (currentView === 'fundo') {
        cardsContainer.style.display = 'block';
        document.getElementById('fundoHub').style.display = 'grid';
        
        if (activeFilter && activeFilter.column) {
            clearFilterBtn.style.display = 'inline-flex';
            filterLabel.textContent = `Quitar Filtro (${activeFilter.label})`;
            mainSubtitle.innerHTML = `<span style="color:var(--primary-color); font-weight:700;">Filtrado por:</span> ${activeFilter.label}`;
        }
        getTotalCount();
        renderFundoHub();
        return;
    }

    // 4.7 Lógica de vista de Hub de Lotes de Producción
    if (currentView === 'fundo_lote') {
        cardsContainer.style.display = 'block';
        document.getElementById('loteHub').style.display = 'grid';
        
        if (activeFilter && activeFilter.column) {
            clearFilterBtn.style.display = 'inline-flex';
            filterLabel.textContent = `Quitar Filtro (${activeFilter.label})`;
            mainSubtitle.innerHTML = `<span style="color:var(--primary-color); font-weight:700;">Filtrado por:</span> ${activeFilter.label}`;
        }
        getTotalCount();
        renderLoteHub();
        return;
    }

    // 5. Lógica de vista de Tablas (Dashboard de Trabajadores vs Otros)
    tableContainer.style.display = 'block';

    if (currentView === 'trabajador') {
        const unifiedControls = document.getElementById('unifiedControlsContainer');
        if (unifiedControls) unifiedControls.style.display = 'flex';
        
        const metricsDash = document.getElementById('workerMetricsDash');
        if (metricsDash) {
            metricsDash.style.display = 'grid';
            fetchWorkerDashboardMetrics();
        }
    } else {
        const unifiedControls = document.getElementById('unifiedControlsContainer');
        if (unifiedControls) unifiedControls.style.display = 'none';
        
        const metricsDash = document.getElementById('workerMetricsDash');
        if (metricsDash) metricsDash.style.display = 'none';
    }

    if (activeFilter) {
        if (tableTitle) tableTitle.textContent = config.tableTitle;
        if (clearFilterBtn) clearFilterBtn.style.display = 'inline-flex';
        if (filterLabel) filterLabel.textContent = `Quitar Filtro (${activeFilter.label})`;
    } else {
        if (tableTitle) tableTitle.textContent = config.tableTitle;
        if (clearFilterBtn) clearFilterBtn.style.display = 'none';
    }
    
    searchInput.placeholder = config.searchPlaceholder;
    searchInput.value = searchQuery;
    tableHead.innerHTML = `<tr>${config.headers.map(h => `<th>${h}</th>`).join('')}</tr>`;
    
    const statsContainer = document.getElementById('tabStats');
    const statsCards = document.getElementById('statsCards');
    if (statsContainer) statsContainer.style.display = 'none';
    if (statsCards) statsCards.innerHTML = '';
    
    if (currentView === 'actividad') renderActivityStats();

    getTotalCount();
    fetchData();
}

async function renderActivityStats() {
    const statsContainer = document.getElementById('tabStats');
    const statsCards = document.getElementById('statsCards');
    
    statsContainer.style.display = 'grid';
    if (statsCards) {
        statsCards.innerHTML = `
            <div class="stat-card skeleton"></div>
            <div class="stat-card skeleton"></div>
            <div class="stat-card skeleton"></div>
        `;
    }

    try {
        // 1. Obtener conteos
        const { count: total } = await dbClient.from('t_actividad').select('*', { count: 'exact', head: true });
        const { count: destajo } = await dbClient.from('t_actividad').select('*', { count: 'exact', head: true }).not('codigo_labor', 'is', null);
        const jornal = total - destajo;

        // 2. Renderizar Tarjetas
        if (statsCards) {
            statsCards.innerHTML = `
                <div class="stat-card stat-total">
                    <div class="stat-icon" style="background:#eff6ff;color:#3b82f6;"><i class="ph ph-list-checks"></i></div>
                    <div class="stat-info">
                        <span class="stat-label">Total Actividades</span>
                        <span class="stat-value">${total}</span>
                        <span class="stat-desc">Catálogo Maestro</span>
                    </div>
                </div>
                <div class="stat-card stat-destajo">
                    <div class="stat-icon" style="background:#ecfdf5;color:#10b981;"><i class="ph ph-hand-coins"></i></div>
                    <div class="stat-info">
                        <span class="stat-label">Pago Destajo</span>
                        <span class="stat-value">${destajo}</span>
                        <span class="stat-desc">${((destajo/total)*100).toFixed(1)}% del total</span>
                    </div>
                </div>
                <div class="stat-card stat-jornal">
                    <div class="stat-icon" style="background:#fff7ed;color:#f59e0b;"><i class="ph ph-calendar-check"></i></div>
                    <div class="stat-info">
                        <span class="stat-label">Pago Jornal</span>
                        <span class="stat-value">${jornal}</span>
                        <span class="stat-desc">${((jornal/total)*100).toFixed(1)}% sin labor</span>
                    </div>
                </div>
            `;
        }

        // 3. Renderizar Gráfico
        const ctx = document.getElementById('activityChart');
        if (ctx) {
            if (activityChartInstance) activityChartInstance.destroy();

            activityChartInstance = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: ['Destajo', 'Jornal'],
                    datasets: [{
                        data: [destajo, jornal],
                        backgroundColor: ['#10b981', '#f59e0b'],
                        borderWidth: 0,
                        hoverOffset: 4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { position: 'bottom', labels: { usePointStyle: true, padding: 20 } },
                        tooltip: { backgroundColor: '#1e293b', padding: 12 },
                        datalabels: {
                            color: '#fff',
                            font: { weight: 'bold', size: 12 },
                            formatter: (value, ctx) => {
                                let sum = 0;
                                let dataArr = ctx.chart.data.datasets[0].data;
                                dataArr.map(data => { sum += data; });
                                let percentage = Math.round(value * 100 / sum) + "%";
                                return `${value}\n(${percentage})`;
                            },
                        }
                    },
                    cutout: '70%'
                }
            });
        }
    } catch (e) {
        console.error('Error rendering activity stats:', e);
        statsContainer.style.display = 'none';
    }
}

function renderPriceEvolutionChart(displayData) {
    const ctx = document.getElementById('priceEvolutionChart');
    if (!ctx) return;
    
    if (priceEvolutionChartInstance) {
        priceEvolutionChartInstance.destroy();
    }
    
    const years = [2023, 2024, 2025, 2026];
    
    // Construir línea de tiempo cronológica, filtrando solo semanas con datos
    let timelinePoints = [];
    
    years.forEach(y => {
        let pointsForYear = [];
        displayData.forEach(item => {
            if (item.years[y] && item.years[y].precio !== null && item.years[y].precio !== undefined) {
                pointsForYear.push({
                    year: y,
                    week: item.semana,
                    price: parseFloat(item.years[y].precio)
                });
            }
        });
        // Orden cronológico por semana ascendente
        pointsForYear.sort((a,b) => a.week - b.week);
        timelinePoints = timelinePoints.concat(pointsForYear);
    });

    const labels = timelinePoints.map(p => `Sem ${p.week} - ${p.year}`);
    
    const yearColors = {
        2023: '#94a3b8', // Gris
        2024: '#f59e0b', // Naranja
        2025: '#3b82f6', // Azul
        2026: '#10b981', // Verde
        2027: '#8b5cf6'  // Morado
    };
    const pointColorsMap = timelinePoints.map(p => yearColors[p.year] || '#004b93');

    const datasets = [{
        label: `Tarifa S/`,
        data: timelinePoints.map(p => p.price),
        borderColor: '#004b93',
        borderWidth: 3,
        pointBackgroundColor: pointColorsMap,
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
        pointRadius: 6,
        pointHoverRadius: 8,
        tension: 0.2,
        fill: false,
        segment: {
            borderColor: ctx => {
                const idx = ctx.p0DataIndex;
                if (idx !== undefined && timelinePoints[idx]) {
                    return yearColors[timelinePoints[idx].year] || '#004b93';
                }
                return '#004b93';
            }
        }
    }];

    priceEvolutionChartInstance = new Chart(ctx, {
        type: 'line',
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            plugins: {
                legend: { position: 'top', labels: { usePointStyle: true, padding: 20 } },
                tooltip: {
                    backgroundColor: '#1e293b',
                    padding: 12,
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) label += ': ';
                            if (context.parsed.y !== null) {
                                label += 'S/ ' + context.parsed.y.toFixed(4);
                            }
                            return label;
                        }
                    }
                },
                datalabels: { 
                    display: true,
                    align: 'top',
                    color: '#0f172a',
                    font: { weight: 'bold', size: 10 },
                    formatter: function(value) {
                        return 'S/ ' + value.toFixed(4);
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: { display: false },
                    ticks: { display: false },
                    border: { display: false }
                },
                x: {
                    grid: { display: false },
                    ticks: {
                        color: (context) => {
                            const idx = context.index;
                            if (timelinePoints[idx]) {
                                return yearColors[timelinePoints[idx].year] || '#64748b';
                            }
                            return '#64748b';
                        },
                        font: {
                            weight: '600',
                            size: 11
                        }
                    }
                }
            }
        }
    });

    const kpiContainer = document.getElementById('priceLatestKPIs');
    if (kpiContainer && displayData.length > 0) {
        const latestItem = displayData[0];
        let targetYearObj = null;
        let latestYear = null;
        for (let i = years.length - 1; i >= 0; i--) {
            if (latestItem.years[years[i]] && latestItem.years[years[i]].precio) {
                targetYearObj = latestItem.years[years[i]];
                latestYear = years[i];
                break;
            }
        }
        
        if (targetYearObj) {
            kpiContainer.innerHTML = `
                <div class="stat-card" style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px;">
                    <div style="font-size:0.8rem; color:var(--text-secondary); margin-bottom:0.25rem;">Meta Actual (Sem ${latestItem.semana} - ${latestYear})</div>
                    <div style="font-size:1.5rem; font-weight:700; color:var(--title-color);">${targetYearObj.meta || '-'}</div>
                </div>
                <div class="stat-card" style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px;">
                    <div style="font-size:0.8rem; color:var(--text-secondary); margin-bottom:0.25rem;">Tarea Actual (Sem ${latestItem.semana} - ${latestYear})</div>
                    <div style="font-size:1.5rem; font-weight:700; color:var(--title-color);">${targetYearObj.tarea || '-'}</div>
                </div>
                <div class="stat-card" style="background:#eff6ff; border:1px solid #bfdbfe; border-radius:12px; border-left: 4px solid var(--primary-color);">
                    <div style="font-size:0.8rem; color:var(--text-secondary); margin-bottom:0.25rem;">Tarifa Actual (Sem ${latestItem.semana} - ${latestYear})</div>
                    <div style="font-size:1.5rem; font-weight:700; color:var(--primary-color);">S/ ${parseFloat(targetYearObj.precio).toFixed(4)}</div>
                </div>
            `;
        } else {
            kpiContainer.innerHTML = '';
        }
    }
}

async function getTotalCount() {
    const config = viewsConfig[currentView];
    if (currentView === 'ranking_asistencia' || currentView === 'ranking_rendimientos') return;
    
    const headerKPIs = document.getElementById('headerKPIs');
    if (!headerKPIs) return;

    // Lógica especial para Detalle de Subgerencia (Multitarjetas)
    if (currentView === 'subgerencia_detail' && activeFilter) {
        try {
            const metrics = await getSubgerenciaUnitMetrics(activeFilter.value);
            updateHeaderKPIs([
                { label: 'Fundos Gnr.', value: metrics.total_fundos, icon: 'ph-buildings', color: '#004b93' },
                { label: 'Subfundos', value: metrics.total_subfundos, icon: 'ph-leaf', color: '#059669' },
                { label: 'Lotes Prod.', value: metrics.total_lotes, icon: 'ph-grid-four', color: '#a855f7' }
            ]);
            return;
        } catch (err) {
            console.error('Error fetching subgerencia metrics:', err);
        }
    }

    // Asegurar que el contenedor tenga la estructura estándar para otras vistas
    if (!document.getElementById('totalCount')) {
        updateHeaderKPIs(); 
    }

    let targetTable = config.table;
    const criterion = document.getElementById('rankingCriterionFilter')?.value || 'directorio';
    
    if (currentView === 'trabajador' && criterion === 'directorio') {
        targetTable = 't_trabajador';
    }
    
    const totalCountElement = document.getElementById('totalCount');
    const totalCountLabel = document.getElementById('totalCountLabel');
    if (totalCountElement) totalCountElement.textContent = '...';

    // 1. Actualizar Etiqueta dinámicamente
    if (totalCountLabel) {
        if (currentView === 'fundo_gnrl' && activeFilter) {
            totalCountLabel.textContent = 'Total Subgerencias';
        } else if (currentView === 'fundo' && activeFilter) {
            totalCountLabel.textContent = 'Total Fundos Gnr.';
        } else if (currentView === 'fundo_lote' && activeFilter) {
            totalCountLabel.textContent = 'Total Lotes';
        } else if (currentView === 'fundo' || currentView === 'fundo_gnrl' || currentView === 'fundo_lote') {
            totalCountLabel.textContent = (currentView === 'fundo_lote') ? 'Total Lotes' : (currentView === 'fundo' ? 'Total Fundos' : 'Total Registrados');
        } else if (currentView === 'subgerencia_detail') {
            totalCountLabel.textContent = 'Fundos Generales';
        } else {
            totalCountLabel.textContent = 'Total Registrados';
        }
    }

    try {
        let query = dbClient.from(targetTable).select('*', { count: 'exact', head: true });

        // 2. Aplicar filtros al conteo si existen
        if (activeFilter && activeFilter.column) {
            if (activeFilter.operator === 'in') {
                query = query.in(activeFilter.column, activeFilter.value);
            } else if (activeFilter.column.includes('t_operacion')) {
                if (currentView === 'fundo_gnrl') {
                    query = dbClient.from(targetTable).select('*, t_operacion!inner(operacion)', { count: 'exact', head: true })
                                   .eq('t_operacion.operacion', activeFilter.value);
                } else {
                    query = query.eq(activeFilter.column, activeFilter.value);
                }
            } else if (activeFilter.column.includes('t_fundo_gnrl')) {
                if (currentView === 'fundo') {
                    query = dbClient.from(targetTable).select('*, t_fundo_gnrl!inner(fundo_general)', { count: 'exact', head: true })
                                   .eq('t_fundo_gnrl.fundo_general', activeFilter.value);
                } else {
                    query = query.eq(activeFilter.column, activeFilter.value);
                }
            } else if (activeFilter.column.includes('codigo_fundo') && currentView === 'fundo_lote') {
                // Usar la vista de pertenencia actual para el conteo
                query = dbClient.from('v_lote_fundo_actual').select('*', { count: 'exact', head: true })
                               .eq('codigo_fundo', activeFilter.value);
            } else {
                query = query.eq(activeFilter.column, activeFilter.value);
            }
        }

        const { count, error } = await query;
        if (error) throw error;
        if (totalCountElement) totalCountElement.textContent = new Intl.NumberFormat('es-PE').format(count);
    } catch (error) { 
        console.warn('Error en getTotalCount:', error);
        if (totalCountElement) totalCountElement.textContent = '-'; 
    }

}

function renderSkeleton() {
    const config = viewsConfig[currentView];
    tableBody.innerHTML = `
        <tr>
            <td colspan="${config.headers.length}" style="text-align:center; padding: 2rem;">
                <div style="display:flex; flex-direction:column; align-items:center; gap:1rem; color:var(--text-secondary);">
                    <i class="ph ph-spinner ph-spin" style="font-size:2rem; color:var(--primary-color);"></i>
                    <span style="font-weight:500;">Cargando información...</span>
                </div>
            </td>
        </tr>
    `;
    
    // Añadir algunas filas de esqueleto por debajo para mantener la estructura visual
    for(let i=0; i<3; i++){
        const tr = document.createElement('tr');
        tr.innerHTML = config.headers.map(() => `<td><div class="skeleton skeleton-text" style="width:${Math.floor(Math.random()*(150-80+1)+80)}px;"></div></td>`).join('');
        tableBody.appendChild(tr);
    }
}

function renderTable() {
    tableBody.innerHTML = '';
    const config = viewsConfig[currentView];

    if (!data || data.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="${config.headers.length}" style="text-align:center;padding:3rem;color:#64748b;">No se encontraron registros</td></tr>`;
        return;
    }

    let displayData = data;

    // --- LÓGICA DE PIVOTE PARA VISTA PRECIO ---
    if (currentView === 'precio') {
        const grouped = {};
        const loteFilterValue = document.getElementById('priceFilterLote')?.value || 'all';
        
        data.forEach(item => {
            // Consolidación inteligente: 
            // - Si no hay filtro de lote Y NO hay búsqueda de actividad -> Agrupamos por ACTIVIDAD + SEMANA (Vista Resumen)
            // - Si hay filtro de lote O hay búsqueda de actividad -> Agrupamos por ACTIVIDAD + LOTE + SEMANA (Vista Detalle)
            const isDetailedView = loteFilterValue !== 'all' || (searchQuery && searchQuery.length > 0);
            
            const key = !isDetailedView
                ? `${item.codigo_actividad}-${item.semana}`
                : `${item.codigo_actividad}-${item.codigo_lote}-${item.semana}`;

            if (!grouped[key]) {
                grouped[key] = {
                    semana: item.semana,
                    codigo_actividad: item.codigo_actividad,
                    actividad: item.t_actividad?.actividad_agt || item.codigo_actividad,
                    codigo_lote: !isDetailedView ? null : item.codigo_lote,
                    lote: !isDetailedView ? null : (item.t_lote?.lote || item.codigo_lote),
                    years: {}
                };
            }
            
            // Si el precio es único en la operación para esa semana, tomamos el primer registro disponible por año.
            if (!grouped[key].years[item.campana]) {
                grouped[key].years[item.campana] = {
                    precio: item.precio,
                    tarea: item.tarea,
                    meta: item.meta
                };
            }
        });
        displayData = Object.values(grouped).sort((a,b) => b.semana - a.semana || a.actividad.localeCompare(b.actividad));
    }

    let maxVal = (currentView === 'ranking_asistencia' || currentView === 'ranking_rendimientos') ? Math.max(...data.map(i => i.total || 0)) : 0;
    
    displayData.forEach((item, index) => {
        const tr = document.createElement('tr');
        tr.style.opacity = '0';
        tr.style.animation = `slideDown 0.3s ease-out ${index * 0.05}s forwards`;
        
        if (currentView === 'trabajador' || currentView === 'ranking_asistencia' || currentView === 'ranking_rendimientos') {
            tr.classList.add('clickable-row');
            tr.onclick = () => showWorkerDetails(item);
        }
        
        // Para la vista de precios, pasamos el "siguiente" item como la semana cronológicamente anterior
        // ya que la lista está ordenada por semana DESC.
        const prevWeekItem = (currentView === 'precio') ? displayData[index + 1] : null;
        
        tr.innerHTML = config.renderRow(item, index, maxVal, prevWeekItem);
        tableBody.appendChild(tr);
    });

    if (currentView === 'precio') {
        const chartContent = document.getElementById('priceChartContent');
        const emptyState = document.getElementById('priceChartEmptyState');
        if (searchQuery) {
            if (chartContent) chartContent.style.display = 'block';
            if (emptyState) emptyState.style.display = 'none';
            renderPriceEvolutionChart(displayData);
        } else {
            if (chartContent) chartContent.style.display = 'none';
            if (emptyState) emptyState.style.display = 'flex';
        }
    }
}

async function fetchData() {
    const config = viewsConfig[currentView];
    
    // Si estamos en trabajador no forzamos búsqueda obligatoria ya, 
    // pues tenemos la vista ordenada como directorio maestro.
    renderSkeleton();
    try {
        const start = currentPage * PAGE_SIZE;
        const end = start + PAGE_SIZE - 1;
        let tableName = config.table;
        const criterion = document.getElementById('rankingCriterionFilter')?.value || 'directorio';
        
        if (currentView === 'trabajador' && criterion === 'directorio') {
            tableName = 't_trabajador';
        }

        let selectStr = config.select_query || '*';

        // --- LÓGICA DINÁMICA: Inner Join solo para Búsqueda ---
        if (currentView === 'precio' && searchQuery) {
             // Solo si detectamos que no tiene ya el !inner
             if (!selectStr.includes('!inner')) {
                 selectStr = selectStr.replace('t_actividad(', 't_actividad!inner(');
             }
        }

        let query = dbClient.from(tableName).select(selectStr);
        
        if (currentView === 'trabajador') {
            let activity = 'general';
            const activeBtn = document.querySelector('.ranking-filter-chip.active');
            if(activeBtn) { activity = activeBtn.dataset.act || 'general'; }
            
            // Filtro de Año: SOLO si la tabla NO es t_trabajador (porque no tiene esa columna)
            const selectedYear = document.getElementById('yearFilter')?.value || 'all';
            if (selectedYear !== 'all' && tableName !== 't_trabajador') {
                query = query.eq('anio', parseInt(selectedYear));
            }

            if (criterion === 'asistencia') {
                query = query.gt(`total_jornales_${activity}`, 0).order(`total_jornales_${activity}`, { ascending: false, nullsFirst: false });
            } else if (criterion === 'rendimiento') {
                const activityCol = activity === 'general' ? 'global' : activity;
                query = query.gt(`promedio_rendimiento_${activityCol}`, 0).order(`promedio_rendimiento_${activityCol}`, { ascending: false, nullsFirst: false });
            } else {
                query = query.order('trabajador', { ascending: true, nullsFirst: false });
            }
            
            if (searchQuery) {
                // Buscamos en múltiples campos (DNI, Nombre, Código, Procedencia)
                const fields = ['dni', 'trabajador', 'codigo_trabajador', 'procedencia'];
                const orQuery = fields.map(f => `${f}.ilike.%${searchQuery}%`).join(',');
                query = query.or(orQuery);
            }

            // --- Aplicación de filtros dinámicos ---
            if (activeFilter) {
                if (activeFilter.operator === 'in') {
                    query = query.in(activeFilter.column, activeFilter.value);
                } else {
                    query = query.eq(activeFilter.column, activeFilter.value);
                }
            }

        } else {
            // --- Filtro de Lote para Tarifas y Precios ---
            if (currentView === 'precio') {
                const lote = document.getElementById('priceFilterLote')?.value;
                if (lote === 'null_lote') {
                    query = query.is('codigo_lote', null);
                } else if (lote && lote !== 'all') {
                    query = query.eq('codigo_lote', lote);
                }
            }

            if (Array.isArray(config.orderField)) {
                config.orderField.forEach(field => {
                    query = query.order(field, { ascending: config.orderAsc ?? false, nullsFirst: false });
                });
            } else {
                query = query.order(config.orderField || 'fecha_creacion', { ascending: config.orderAsc ?? false, nullsFirst: false });
            }

            if (activeFilter) {
                if (activeFilter.operator === 'in') {
                    query = query.in(activeFilter.column, activeFilter.value);
                } else {
                    query = query.eq(activeFilter.column, activeFilter.value);
                }
            }
            if (searchQuery) {
                // Solución para Error 400: PostgREST .or() falla con joins en algunas versiones.
                // Si solo buscamos por un campo vinculado (ej: t_actividad.actividad_agt), usamos .ilike directo.
                if (config.searchFields.length === 1 && config.searchFields[0].includes('.')) {
                    query = query.ilike(config.searchFields[0], `%${searchQuery}%`);
                } else {
                    query = query.or(config.searchFields.map(f => `${f}.ilike.%${searchQuery}%`).join(','));
                }
            }
        }
        
        if (currentView === 'precio' && searchQuery) {
            query = query.limit(2000); // Historial completo sin paginación parcial
        } else {
            query = query.range(start, end);
        }
        
        const { data: records, error } = await query;
        if (error) throw error;
        
        // --- NUEVA LÓGICA: Obtener Último Día Labor para Directorio ---
        if (currentView === 'trabajador' && criterion === 'directorio' && records.length > 0) {
            const dnis = records.map(r => r.dni).filter(Boolean);
            if (dnis.length > 0) {
                // Consultamos de forma paralela el registro más reciente en rpt_horas_agritracer
                const workdaysPromises = dnis.map(dni => {
                    const normalizedDni = dni.toString().replace(/^0+/, '');
                    return dbClient
                        .from('rpt_horas_agritracer')
                        .select('fecha')
                        .in('dni', [dni, normalizedDni])
                        .order('fecha', { ascending: false })
                        .limit(1);
                });
                
                const results = await Promise.all(workdaysPromises);
                
                records.forEach((record, index) => {
                    const res = results[index];
                    record.ultimo_dia_labor = (res.data && res.data[0]) ? res.data[0].fecha : null;
                });
            }
        }
        
        data = records;
        renderTable();
        updatePagination();
    } catch (error) { 
        console.error("Error crítico en fetchData:", error); 
        const errorMsg = error.message || error.details || "Error desconocido";
        const errorCode = error.code || "N/A";

        tableBody.innerHTML = `
            <tr>
                <td colspan="10" style="text-align:center; padding:3rem;">
                    <div style="background:#fef2f2; border:1px solid #fecaca; border-radius:12px; padding:2rem; display:inline-block; max-width:400px;">
                        <i class="ph ph-warning-circle" style="font-size:3rem; color:#ef4444; margin-bottom:1rem;"></i>
                        <h3 style="color:#991b1b; margin-bottom:0.5rem;">Fallo de conexión crítico</h3>
                        <p style="color:#b91c1c; font-size:0.9rem; margin-bottom:1rem;">${errorMsg}</p>
                        <div style="font-family:monospace; background:#fee2e2; padding:0.5rem; border-radius:6px; font-size:0.75rem; color:#991b1b; margin-bottom:1.5rem; word-break:break-all;">
                            Cod: ${errorCode} | View: ${currentView}
                        </div>
                        <button onclick="fetchData()" class="action-btn primary-btn" style="background:#ef4444; border-color:#dc2626; width:100%;">
                            <i class="ph ph-arrows-clockwise"></i> Reintentar Forzando Carga
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }
}

function updatePagination() {
    prevBtn.disabled = currentPage === 0;
    nextBtn.disabled = data.length < PAGE_SIZE;
    pageInfo.textContent = `Página ${currentPage + 1}`;
}

navButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
        const targetBtn = e.currentTarget;
        const selectedView = targetBtn.dataset.view;
        if (selectedView !== currentView) {
            navButtons.forEach(b => b.classList.remove('active'));
            targetBtn.classList.add('active');
            currentView = selectedView;
            activeFilter = null; searchQuery = ''; currentPage = 0;
            setupView();
        }
    });
});


opCards.forEach(card => {
    card.addEventListener('click', () => {
        const opName = card.dataset.op;
        window.goToView('fundo_gnrl', 't_operacion.operacion', opName, `Subgerencia: ${opName}`);
    });
});

clearFilterBtn?.addEventListener('click', () => { activeFilter = null; searchQuery = ''; currentPage = 0; setupView(); });

// Delegación de eventos para botones de actividad de Ranking (Ultra-Compact Chips)
document.getElementById('rankingFilters')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.t-chip');
    if (!btn) return;
    
    document.querySelectorAll('.t-chip').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    
    currentPage = 0;
    fetchData();
});

prevBtn.addEventListener('click', () => { if (currentPage > 0) { currentPage--; fetchData(); } });
nextBtn.addEventListener('click', () => { currentPage++; fetchData(); });

    // Inicialización del Autocompletado Inteligente Global
    initAutocompleteGlobal();

const workerProfileContainer = document.getElementById('workerProfileContainer');
const closeProfileBtn = document.getElementById('closeProfileBtn');
const profileWorkerName = document.getElementById('profileWorkerName');
const profileWorkerDni = document.getElementById('profileWorkerDni');
const profileWorkerCode = document.getElementById('profileWorkerCode');
const profileWorkerPhone = document.getElementById('profileWorkerPhone');
const profileWorkerProcedencia = document.getElementById('profileWorkerProcedencia');
const profileWorkerGenero = document.getElementById('profileWorkerGenero');
const profileLoader = document.getElementById('profileLoader');
const jornalesContainer = document.getElementById('jornalesContainer');
const noJornalesMessage = document.getElementById('noJornalesMessage');
const laboresSection = document.getElementById('laboresSection');
const priorityActivitiesContainer = document.getElementById('priorityActivitiesContainer');
const laboresContainer = document.getElementById('laboresContainer');

async function showWorkerDetails(worker) {
    window.currentWorker = worker; // Guardamos el estado
    document.getElementById('tableContainer').style.display = 'none';
    const globalHeader = document.getElementById('globalHeader');
    if (globalHeader) globalHeader.style.display = 'none';
    const unifiedControls = document.getElementById('unifiedControlsContainer');
    if (unifiedControls) unifiedControls.style.display = 'none';
    workerProfileContainer.style.display = 'block';
    
    profileWorkerName.textContent = worker.trabajador || 'Sin Nombre';
    const profileWorkerRole = document.getElementById('profileWorkerRole');
    if (profileWorkerRole) profileWorkerRole.textContent = worker.tipo_planilla || 'Trabajador(a) Agrícola';

    profileWorkerDni.innerHTML = `<i class="ph ph-identification-card"></i> ${worker.dni || '-'}`;
    if (profileWorkerCode) profileWorkerCode.innerHTML = `<i class="ph ph-hash"></i> ${worker.codigo_trabajador || '-'}`;
    
    if (profileWorkerPhone) {
        profileWorkerPhone.innerHTML = `<i class="ph ph-phone"></i> ${worker.telefono_principal || '-'}`;
    }
    
    if (profileWorkerProcedencia) profileWorkerProcedencia.innerHTML = `<i class="ph ph-map-pin"></i> ${worker.procedencia || '-'}`;
    
    if (profileWorkerGenero) {
        let genderIcon = 'ph-gender-intersex';
        if (worker.genero && worker.genero.toUpperCase().startsWith('M')) genderIcon = 'ph-gender-male';
        if (worker.genero && worker.genero.toUpperCase().startsWith('F')) genderIcon = 'ph-gender-female';
        profileWorkerGenero.innerHTML = `<i class="ph ${genderIcon}"></i> ${worker.genero || '-'}`;
    }

    // Botones Hero
    const btnCall = document.getElementById('btnCall');
    const btnWhatsapp = document.getElementById('btnWhatsapp');
    if (btnCall) {
        if (worker.telefono_principal) {
            btnCall.style.display = 'inline-flex';
            btnCall.onclick = () => window.open(`tel:${worker.telefono_principal}`);
        } else {
            btnCall.style.display = 'none';
        }
    }
    if (btnWhatsapp) {
        if (worker.tiene_whatsapp && worker.telefono_principal) {
            btnWhatsapp.style.display = 'inline-flex';
            btnWhatsapp.onclick = () => window.open(`https://wa.me/51${worker.telefono_principal.replace(/\s+/g,'')}?text=Hola%20${encodeURIComponent(worker.trabajador)},%20te%20escribimos%20de%20Recursos%20Humanos.`);
        } else {
            btnWhatsapp.style.display = 'none';
        }
    }

    // Resetear a pestaña resumen por defecto
    const firstTab = document.querySelector('.tab-item[data-tab="tab-resumen"]');
    if (firstTab) firstTab.click();

    profileLoader.style.display = 'flex';
    jornalesContainer.style.display = 'none';
    noJornalesMessage.style.display = 'none';
    laboresSection.style.display = 'none';
    jornalesContainer.innerHTML = '';
    laboresContainer.innerHTML = '';

    try {
        // --- 1. Llenar Tab: Resumen General (Agritracer Horas) ---
        // Implementamos fetch por lotes para superar el límite de 1000 de Supabase
        const fetchAllJornales = async (dni) => {
            let allData = [];
            let page = 0;
            const pageSize = 1000;
            let finished = false;
            
            while (!finished) {
                const normalizedDni = dni.toString().replace(/^0+/, '');
                const { data, error } = await dbClient
                    .from('rpt_horas_agritracer')
                    .select('fecha, tipo_proyecto, actividad')
                    .in('dni', [dni, normalizedDni])
                    .range(page * pageSize, (page + 1) * pageSize - 1);
                
                if (error) throw error;
                if (!data || data.length === 0) {
                    finished = true;
                } else {
                    allData = [...allData, ...data];
                    if (data.length < pageSize) finished = true;
                    else page++;
                }
            }
            return allData;
        };

        const jornalesData = await fetchAllJornales(worker.dni);
        
        if (!jornalesData || jornalesData.length === 0) { 
            noJornalesMessage.style.display = 'block'; 
            document.getElementById('profileSummaryHeader').style.display = 'none';
            document.getElementById('profileChartWrapper').style.display = 'none';
        } else {
            const statsPorAnio = {}; const statsPorLabor = {};
            const mapLabores = { 'Centro Costo': 'Centro de Costos', 'Orden': 'Ordenes de Control', 'Proyecto Obra en Curso': 'Obras en Curso', 'Proyecto Operacion (LT)': 'Operaciones', 'Proyecto Plantación (PT)': 'Plantaciones' };

            // Definición de actividades críticas y sus agrupaciones
            const statsPriority = { 'RALEO': 0, 'PODA': 0, 'COSECHA': 0 };
            const raleoDetails = { 'RALEO': 0, 'RALEO PL': 0, 'RALEO - FORANEO': 0 };
            const priorityMap = {
                'RALEO': 'RALEO',
                'RALEO PL': 'RALEO',
                'RALEO - FORANEO': 'RALEO',
                'PODA': 'PODA',
                'COSECHA': 'COSECHA'
            };

            jornalesData.forEach(row => {
                if (row.fecha) { const year = row.fecha.split('-')[0]; statsPorAnio[year] = (statsPorAnio[year] || 0) + 1; }
                if (row.tipo_proyecto) {
                    const laborName = mapLabores[row.tipo_proyecto] || row.tipo_proyecto;
                    const actName = row.actividad || 'Sin Especificar';
                    const normalizedAct = actName.trim().toUpperCase();

                    // 1. Verificar si es una actividad crítica (O agrupada en una)
                    if (priorityMap.hasOwnProperty(normalizedAct)) {
                        const targetGroup = priorityMap[normalizedAct];
                        statsPriority[targetGroup]++;
                        
                        // Guardar el desglose específico si es del grupo RALEO
                        if (targetGroup === 'RALEO') {
                            raleoDetails[normalizedAct] = (raleoDetails[normalizedAct] || 0) + 1;
                        }
                    } else {
                        // 2. Si no es crítica, se agrupa en "Otras Labores" por categoría
                        if (!statsPorLabor[laborName]) statsPorLabor[laborName] = { count: 0, activities: {} };
                        statsPorLabor[laborName].count++;
                        statsPorLabor[laborName].activities[actName] = (statsPorLabor[laborName].activities[actName] || 0) + 1;
                    }
                }
            });

            const years = Object.keys(statsPorAnio).sort((a, b) => b - a);
            if (years.length === 0 && Object.keys(statsPorLabor).length === 0) { 
                noJornalesMessage.style.display = 'block'; 
                document.getElementById('profileSummaryHeader').style.display = 'none';
                document.getElementById('profileChartWrapper').style.display = 'none';
            } else {
                // --- Actualización de Resumen Visual ---
                const totalHistorico = jornalesData.length;
                const peakYear = Object.entries(statsPorAnio).reduce((a, b) => a[1] > b[1] ? a : b, [null, 0])[0];
                
                document.getElementById('totalJornalesLabel').textContent = `${totalHistorico} Jornales`;
                document.getElementById('peakYearLabel').textContent = peakYear || '-';
                document.getElementById('profileSummaryHeader').style.display = 'flex';
                
                renderWorkerActivityChart(statsPorAnio);

                years.forEach(year => {
                    const count = statsPorAnio[year];
                    const div = document.createElement('div'); div.className = 'jornal-card';
                    div.innerHTML = `<span class="jornal-year">${year}</span><span class="jornal-count">${count} jornales</span>`;
                    jornalesContainer.appendChild(div);
                });

                renderPriorityActivities(statsPriority, raleoDetails);

                const labores = Object.keys(statsPorLabor).sort((a, b) => statsPorLabor[b].count - statsPorLabor[a].count);
                if (labores.length > 0) {
                    laboresSection.style.display = 'flex';
                    laboresContainer.innerHTML = '';
                    labores.forEach(labor => {
                        const stats = statsPorLabor[labor];
                        const div = document.createElement('div'); div.className = 'labor-item';
                        const activitiesHtml = Object.keys(stats.activities).sort((a, b) => stats.activities[b] - stats.activities[a]).map(act => `<div class="activity-item" style="padding:0.4rem 1rem; border-bottom:1px solid #f1f5f9; display:flex; justify-content:space-between; align-items:center;"><span class="activity-name" title="${act}" style="font-size:0.8rem">${act}</span> <span class="activity-count" style="font-size:0.8rem; font-weight:bold; color:var(--primary-color)">${stats.activities[act]} jor.</span></div>`).join('');
                        div.innerHTML = `<div class="labor-item-header"><span>${labor}</span><div style="display:flex;align-items:center;gap:0.5rem"><span class="labor-count">${stats.count}</span><i class="ph ph-caret-down"></i></div></div><div class="labor-activities-list" style="display:none; flex-direction:column;">${activitiesHtml}</div>`;
                        div.querySelector('.labor-item-header').addEventListener('click', () => {
                            const expanded = div.classList.contains('expanded');
                            
                            // Cerrar otros
                            Array.from(laboresContainer.children).forEach(c => { 
                                if (c !== div) {
                                    c.classList.remove('expanded'); 
                                    c.querySelector('.ph-caret-down').style.transform = 'rotate(0deg)'; 
                                    const list = c.querySelector('.labor-activities-list');
                                    if (list) list.style.display = 'none';
                                }
                            });

                            if (!expanded) { 
                                div.classList.add('expanded'); 
                                div.querySelector('.ph-caret-down').style.transform = 'rotate(180deg)'; 
                                div.querySelector('.labor-activities-list').style.display = 'flex';
                                
                                // El scroll ahora es manejado por la página de forma natural
                            } else {
                                div.classList.remove('expanded'); 
                                div.querySelector('.ph-caret-down').style.transform = 'rotate(0deg)'; 
                                div.querySelector('.labor-activities-list').style.display = 'none';
                            }
                        });
                        laboresContainer.appendChild(div);
                    });
                }
                jornalesContainer.style.display = 'grid';
            }
        }

        // --- 2. Llenar Tab: Rendimientos ---
        const rendimientosContainer = document.getElementById('rendimientosContainer');
        const noRendimientosMessage = document.getElementById('noRendimientosMessage');
        
        if (rendimientosContainer && noRendimientosMessage) {
            rendimientosContainer.innerHTML = '';
            const { data: rankData, error: rankErr } = await dbClient.from('vw_rendimiento_trabajador_actividad_anio')
                .select('anio, actividad, jornales, rendimiento_pct')
                .eq('trabajador', worker.trabajador);
                
            if (rankErr || !rankData || rankData.length === 0) {
                rendimientosContainer.style.display = 'none';
                noRendimientosMessage.style.display = 'block';
            } else {
                // Ordenar de mayor a menor rendimiento
                rankData.sort((a, b) => Number(b.rendimiento_pct || 0) - Number(a.rendimiento_pct || 0));
                
                rendimientosContainer.style.display = 'flex';
                rendimientosContainer.style.flexDirection = 'column';
                rendimientosContainer.style.gap = '0.85rem';
                
                rankData.forEach((r, index) => {
                    const div = document.createElement('div'); 
                    div.className = 'labor-item';
                    div.style.position = 'relative';
                    div.style.padding = '1.25rem 1.75rem';
                    
                    const actName = r.actividad || 'Global';
                    const rend = Number(r.rendimiento_pct || 0).toFixed(2);
                    let colorClass = '#10b981'; // Green
                    let bgColorClass = '#ecfdf5';
                    if(rend < 60) { colorClass = '#ef4444'; bgColorClass = '#fef2f2'; }
                    else if(rend < 90) { colorClass = '#f59e0b'; bgColorClass = '#fff7ed'; }
                    
                    // Medalla o Número de Ranking
                    let rankHtml = '';
                    if (index === 0) {
                        rankHtml = `<div style="position:absolute; top:-12px; left:-12px; color:#fff; background:linear-gradient(135deg, #fcd34d, #f59e0b); border-radius:50%; width:36px; height:36px; display:flex; align-items:center; justify-content:center; font-weight:900; box-shadow:0 4px 10px rgba(245,158,11,0.3); border:3px solid #fff; z-index:2;"><i class="ph-fill ph-trophy" style="font-size:1.1rem"></i></div>`;
                    } else if (index === 1) {
                        rankHtml = `<div style="position:absolute; top:-10px; left:-10px; color:#fff; background:linear-gradient(135deg, #cbd5e1, #94a3b8); border-radius:50%; width:32px; height:32px; display:flex; align-items:center; justify-content:center; font-weight:900; box-shadow:0 4px 6px rgba(148,163,184,0.3); border:2px solid #fff; z-index:2;">2</div>`;
                    } else if (index === 2) {
                        rankHtml = `<div style="position:absolute; top:-10px; left:-10px; color:#fff; background:linear-gradient(135deg, #fb923c, #c2410c); border-radius:50%; width:32px; height:32px; display:flex; align-items:center; justify-content:center; font-weight:900; box-shadow:0 4px 6px rgba(194,65,12,0.3); border:2px solid #fff; z-index:2;">3</div>`;
                    } else {
                        rankHtml = `<div style="font-weight:800; font-size:1.3rem; color:#cbd5e1; margin-right:1.2rem;">#${index+1}</div>`;
                    }
                    
                    div.innerHTML = `
                        ${index < 3 ? rankHtml : ''}
                        <div class="labor-item-header" style="cursor:default; align-items:center; border:none; padding:0; flex-wrap:wrap;">
                            <div style="display:flex; align-items:center; flex:1; min-width:250px;">
                                ${index >= 3 ? rankHtml : ''}
                                <div style="display:flex; flex-direction:column; gap:0.25rem; flex:1; min-width:0;">
                                    <span class="labor-name" style="font-weight:800; font-size:1.05rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${actName}">${actName}</span>
                                    <span style="font-size:0.85rem; color:var(--text-secondary)"><i class="ph ph-calendar"></i> Año de Evaluación: ${r.anio}</span>
                                </div>
                            </div>
                            <div style="text-align:right; display:flex; flex-direction:column; gap:0.35rem; align-items:flex-end;">
                                <span class="labor-count" style="color:${colorClass}; background:${bgColorClass}; padding:0.4rem 0.8rem; border-radius:8px; font-weight:900; font-size:1.2rem; box-shadow:0 1px 2px rgba(0,0,0,0.02);">${rend}%</span>
                                <span style="font-size:0.8rem; color:var(--text-secondary); font-weight:600;"><i class="ph ph-users"></i> ${Number(r.jornales).toFixed(1)} jornales de muestra</span>
                            </div>
                        </div>
                    `;
                    rendimientosContainer.appendChild(div);
                });
                noRendimientosMessage.style.display = 'none';
            }
        }
        
        profileLoader.style.display = 'none';
    } catch (error) {
        console.error('Error fetching worker details:', error);
        profileLoader.style.display = 'none';
        noJornalesMessage.style.display = 'block';
    }
}

closeProfileBtn.addEventListener('click', () => {
    workerProfileContainer.style.display = 'none';
    document.getElementById('tableContainer').style.display = 'block';
    
    // Restaurar cabecera global
    const globalHeader = document.getElementById('globalHeader');
    if (globalHeader) globalHeader.style.display = 'flex';
    
    // Restaurar filtros si corresponde
    const unifiedControls = document.getElementById('unifiedControlsContainer');
    if (unifiedControls && currentView === 'trabajador') {
        unifiedControls.style.display = 'flex';
    }
});

// --- LÓGICA EDICIÓN TRABAJADOR ---
const workerEditModal = document.getElementById('workerEditModal');
const editProfileBtn = document.getElementById('btnEditProfile');
const editGender = document.getElementById('editWorkerGenero');
const editPhone = document.getElementById('editWorkerPhone');
const editOrigin = document.getElementById('editWorkerProcedencia');

if (editProfileBtn) {
    editProfileBtn.addEventListener('click', () => {
        if (window.currentWorker) {
            // Cabecera del modal
            document.getElementById('editWorkerInfoName').textContent = window.currentWorker.trabajador || 'SIN NOMBRE';
            document.getElementById('editWorkerInfoDni').textContent = window.currentWorker.dni || '-';
            document.getElementById('editWorkerInfoCode').textContent = window.currentWorker.codigo_trabajador || '-';

            // Normalizar género para el select
            let gen = (window.currentWorker.genero || 'MASCULINO').toUpperCase();
            if (gen.startsWith('M')) gen = 'MASCULINO';
            else if (gen.startsWith('F')) gen = 'FEMENINO';
            
            editGender.value = gen;
            editPhone.value = window.currentWorker.telefono_principal || '';
            editOrigin.value = window.currentWorker.procedencia || '';
            workerEditModal.style.display = 'flex';
        }
    });
}

window.openEditModalDirectly = function(dni) {
    if (!data || data.length === 0) return;
    const worker = data.find(w => String(w.dni) === String(dni));
    if (!worker) {
        console.error('No se encontró el trabajador en la lista actual');
        return;
    }
    
    window.currentWorker = worker;
    
    // Cabecera del modal
    document.getElementById('editWorkerInfoName').textContent = worker.trabajador || 'SIN NOMBRE';
    document.getElementById('editWorkerInfoDni').textContent = worker.dni || '-';
    document.getElementById('editWorkerInfoCode').textContent = worker.codigo_trabajador || '-';

    // Normalizar género
    let gen = (worker.genero || 'MASCULINO').toUpperCase();
    if (gen.startsWith('M')) gen = 'MASCULINO';
    else if (gen.startsWith('F')) gen = 'FEMENINO';
    
    editGender.value = gen;
    editPhone.value = worker.telefono_principal || '';
    editOrigin.value = worker.procedencia || '';
    workerEditModal.style.display = 'flex';
};

window.closeWorkerEditModal = function() {
    workerEditModal.style.display = 'none';
};

window.saveWorkerEdit = async function() {
    if (!window.currentWorker || !window.currentWorker.dni) {
        alert('Error: No se detectó el DNI del trabajador para la actualización.');
        return;
    }
    
    const saveBtn = document.getElementById('saveWorkerEditBtn');
    const originalBtnHtml = saveBtn.innerHTML;
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<i class="ph ph-spinner ph-spin"></i> Guardando...';

    const updatedData = {
        genero: editGender.value,
        telefono_principal: editPhone.value.trim(),
        procedencia: editOrigin.value.trim().toUpperCase() // Mantener consistencia en mayúsculas
    };

    try {
        const { error } = await dbClient
            .from('t_trabajador')
            .update(updatedData)
            .eq('dni', window.currentWorker.dni);

        if (error) throw error;

        // Actualizar objeto en sesión
        Object.assign(window.currentWorker, updatedData);
        
        // OPTIMIZACIÓN: Solo actualizamos el DOM del perfil si está abierto
        const isProfileOpen = workerProfileContainer && workerProfileContainer.style.display !== 'none';
        
        if (isProfileOpen) {
            if (profileWorkerPhone) {
                profileWorkerPhone.innerHTML = `<i class="ph ph-phone"></i> ${updatedData.telefono_principal || '-'}`;
            }
            if (profileWorkerProcedencia) {
                profileWorkerProcedencia.innerHTML = `<i class="ph ph-map-pin"></i> ${updatedData.procedencia || '-'}`;
            }
            if (profileWorkerGenero) {
                let genderIcon = 'ph-gender-intersex';
                const g = updatedData.genero.toUpperCase();
                if (g.startsWith('M')) genderIcon = 'ph-gender-male';
                else if (g.startsWith('F')) genderIcon = 'ph-gender-female';
                profileWorkerGenero.innerHTML = `<i class="ph ${genderIcon}"></i> ${updatedData.genero}`;
            }
        }
        
        // REFUERZO: Refrescar la tabla principal en memoria para que se vea el cambio inmediatamente
        renderTable();
        
        closeWorkerEditModal();
        console.log('Trabajador actualizado correctamente');
    } catch (e) {
        console.error('Error al actualizar trabajador:', e);
        alert('Error al guardar cambios: ' + (e.message || e));
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = originalBtnHtml;
    }
};

function renderPriorityActivities(stats, raleoDetails) {
    if (!priorityActivitiesContainer) return;
    priorityActivitiesContainer.innerHTML = '';
    
    // Configuración de colores e iconos para las 3 tarjetas principales
    const config = {
        'RALEO': { 
            icon: 'ph-scissors', 
            color: '#f59e0b', 
            bg: '#fff7ed',
            subtitle: 'Desglose de Actividad:'
        },
        'PODA': { 
            icon: 'ph-plant', 
            color: '#10b981', 
            bg: '#ecfdf5',
            subtitle: 'Labor de Formación'
        },
        'COSECHA': { 
            icon: 'ph-basket', 
            color: '#3b82f6', 
            bg: '#eff6ff',
            subtitle: 'Labor de Recolección'
        }
    };

    Object.keys(stats).forEach(act => {
        const c = config[act];
        const count = stats[act];
        const isEmpty = count === 0;
        
        const card = document.createElement('div');
        card.className = `priority-card ${isEmpty ? 'priority-empty' : ''}`;
        
        let detailsHtml = '';
        if (act === 'RALEO' && !isEmpty) {
            detailsHtml = `
                <div class="priority-details-list">
                    <div class="detail-row"><span>RALEO:</span> <strong>${raleoDetails['RALEO']}</strong></div>
                    <div class="detail-row"><span>PL:</span> <strong>${raleoDetails['RALEO PL']}</strong></div>
                    <div class="detail-row"><span>FORANEO:</span> <strong>${raleoDetails['RALEO - FORANEO']}</strong></div>
                </div>
            `;
        } else if (c.subtitle) {
            detailsHtml = `<span class="priority-subtitle">${c.subtitle}</span>`;
        }

        card.innerHTML = `
            <div class="priority-icon" style="background: ${c.bg}; color: ${c.color}">
                <i class="ph ${c.icon}"></i>
            </div>
            <div class="priority-info">
                <span class="priority-name">${act}</span>
                <span class="priority-count">${count} <small>jor.</small></span>
                ${detailsHtml}
            </div>
        `;
        priorityActivitiesContainer.appendChild(card);
    });
}

function renderWorkerActivityChart(statsPorAnio) {
    const ctx = document.getElementById('workerActivityChart');
    if (!ctx) return;
    
    if (profileActivityChartInstance) profileActivityChartInstance.destroy();
    
    const years = Object.keys(statsPorAnio).sort((a,b) => a - b);
    if (years.length === 0) {
        document.getElementById('profileChartWrapper').style.display = 'none';
        return;
    }
    document.getElementById('profileChartWrapper').style.display = 'block';

    profileActivityChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: years,
            datasets: [
                {
                    label: 'Jornales por Año',
                    data: years.map(y => statsPorAnio[y]),
                    backgroundColor: 'rgba(0, 75, 147, 0.7)',
                    borderColor: '#004b93',
                    borderWidth: 2,
                    borderRadius: 6,
                    hoverBackgroundColor: 'rgba(142, 198, 63, 0.8)',
                    order: 2 // Detrás de la línea
                },
                {
                    label: 'Tendencia',
                    type: 'line',
                    data: years.map(y => statsPorAnio[y]),
                    borderColor: '#8ec63f', // Verde Beta
                    backgroundColor: 'rgba(142, 198, 63, 0.1)',
                    borderWidth: 3,
                    tension: 0.4,
                    pointRadius: 4,
                    pointBackgroundColor: '#ffffff',
                    pointBorderColor: '#8ec63f',
                    pointBorderWidth: 2,
                    fill: false,
                    order: 1, // Delante de las barras
                    datalabels: { display: false } // No duplicar etiquetas
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: {
                padding: {
                    top: 25 // Espacio para que las etiquetas no se corten
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: { 
                    backgroundColor: '#1e293b',
                    padding: 12,
                    displayColors: false
                },
                datalabels: {
                    display: true,
                    anchor: 'end',
                    align: 'top',
                    offset: 4,
                    color: '#475569',
                    font: { weight: 'bold', size: 11 },
                    formatter: (value) => value
                }
            },
            scales: {
                y: { 
                    beginAtZero: true, 
                    grid: { display: false }, 
                    ticks: { display: false },
                    suggestedMax: (Math.max(...Object.values(statsPorAnio)) * 1.15) // 15% de margen extra arriba
                },
                x: { grid: { display: false }, ticks: { font: { weight: '600' } } }
            }
        }
    });
}

// Lógica de Búsqueda Integrada en el Perfil
const profileSearchInput = document.getElementById('profileSearchInput');
if (profileSearchInput) {
    profileSearchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            const val = e.target.value;
            if (val.trim().length > 0) {
                const globalSearchInput = document.getElementById('searchInputGlobal');
                if (globalSearchInput) {
                    globalSearchInput.value = val;
                    searchQuery = val;
                    closeProfileBtn.click(); // Cierra el perfil y vuelve a resultados
                    globalSearchInput.focus();
                    
                    // Disparar búsqueda
                    currentPage = 0;
                    fetchData();
                }
            }
        }
    });
}

// Lógica de Pestañas en el Perfil Hero
const tabItems = document.querySelectorAll('.tab-item');
const tabContents = document.querySelectorAll('.tab-content');

tabItems.forEach(tab => {
    tab.addEventListener('click', () => {
        // Remover active de todos
        tabItems.forEach(t => t.classList.remove('active'));
        tabContents.forEach(c => {
            c.classList.remove('active');
            c.style.display = 'none';
        });
        
        // Agregar active al clickeado
        tab.classList.add('active');
        const targetId = tab.dataset.tab;
        const targetContent = document.getElementById(targetId);
        if (targetContent) {
            targetContent.classList.add('active');
            targetContent.style.display = 'block';
        }
    });
});

// --- LÓGICA CRUD LABORES ---
const laborModal = document.getElementById('laborModal');
const laborForm = document.getElementById('laborForm');
const laborModalTitle = document.getElementById('laborModalTitle');
const inputLaborCode = document.getElementById('laborCode');
const inputLaborName = document.getElementById('laborName');
const inputLaborUnit = document.getElementById('laborUnit');

let isEditMode = false;

async function generateNextLaborCode() {
    try {
        const { data: records, error } = await dbClient
            .from('t_labor')
            .select('codigo_labor')
            .order('codigo_labor', { ascending: false })
            .limit(1);
        
        if (error) throw error;
        
        let nextNum = 1;
        if (records && records.length > 0) {
            const lastCode = records[0].codigo_labor;
            const match = lastCode.match(/\d+/);
            if (match) nextNum = parseInt(match[0]) + 1;
        }
        
        // Formato L0001, L0045, etc (Padded to 4 digits + L = 5 chars)
        return `L${nextNum.toString().padStart(4, '0')}`;
    } catch (e) {
        console.error('Error generating code:', e);
        return 'L0001';
    }
}

window.editLabor = function(id) {
    const labor = data.find(item => item.codigo_labor === id);
    if (labor) openLaborModal(labor);
};

window.openLaborModal = async function(labor = null) {
    isEditMode = !!labor;
    laborModal.style.display = 'flex';
    laborForm.reset();

    if (isEditMode) {
        laborModalTitle.textContent = 'Editar Labor';
        inputLaborCode.value = labor.codigo_labor;
        inputLaborCode.readOnly = true;
        inputLaborCode.style.background = '#f1f5f9';
        inputLaborName.value = labor.labor;
        inputLaborUnit.value = labor.unid_medida;
    } else {
        laborModalTitle.textContent = 'Nueva Labor';
        inputLaborCode.readOnly = false;
        inputLaborCode.style.background = '#ffffff';
        inputLaborCode.value = 'Generando...';
        const nextCode = await generateNextLaborCode();
        inputLaborCode.value = nextCode;
    }
};

window.closeLaborModal = function() {
    laborModal.style.display = 'none';
};

window.saveLabor = async function() {
    const formData = {
        codigo_labor: inputLaborCode.value.trim(),
        labor: inputLaborName.value.trim(),
        unid_medida: inputLaborUnit.value
    };

    try {
        let result;
        if (isEditMode) {
            result = await dbClient.from('t_labor').update({
                labor: formData.labor,
                unid_medida: formData.unid_medida
            }).eq('codigo_labor', formData.codigo_labor);
        } else {
            result = await dbClient.from('t_labor').insert([formData]);
        }

        if (result.error) throw result.error;

        alert(`Labor ${isEditMode ? 'actualizada' : 'creada'} con éxito`);
        closeLaborModal();
        fetchData(); // Recargar tabla
    } catch (e) {
        console.error('Error saving labor:', e);
        alert('Error al guardar la labor. Verifique los datos.');
    }
};

window.deleteLabor = async function(id) {
    if (!confirm(`¿Está seguro de eliminar la labor ${id}? Esta acción no se puede deshacer.`)) return;

    try {
        const { error } = await dbClient.from('t_labor').delete().eq('codigo_labor', id);
        if (error) {
            if (error.code === '23503') alert('No se puede eliminar esta labor porque está siendo utilizada en otras actividades.');
            else throw error;
            return;
        }
        alert('Labor eliminada con éxito');
        fetchData();
    } catch (e) {
        console.error('Error deleting labor:', e);
        alert('Error al eliminar labor.');
    }
};

// --- LÓGICA DE ASIGNACIÓN ---
const assignModal = document.getElementById('assignLaborModal');
const laborSelectorBody = document.getElementById('laborSelectorBody');
const laborSearchInput = document.getElementById('laborSearchInput');
let pendingActivityId = null;
let allLabores = [];

window.openAssignModal = async function(actName, actId) {
    pendingActivityId = actId;
    document.getElementById('assignModalSubtitle').textContent = `Actividad: ${actName}`;
    assignModal.style.display = 'flex';
    laborSearchInput.value = '';
    
    // Cargar labores si no están cargadas
    if (allLabores.length === 0) {
        const { data: records } = await dbClient.from('t_labor').select('*').order('labor');
        allLabores = records || [];
    }
    
    renderLaborSelector(allLabores);
};

window.closeAssignModal = function() {
    assignModal.style.display = 'none';
};

function renderLaborSelector(list) {
    laborSelectorBody.innerHTML = list.map(l => `
        <tr>
            <td><span class="tag">${l.codigo_labor}</span></td>
            <td class="fw-medium">${l.labor}</td>
            <td>
                <button class="primary-btn" style="padding: 0.4rem 0.8rem; font-size: 0.75rem;" onclick="assignLabor('${l.codigo_labor}')">
                    Asignar
                </button>
            </td>
        </tr>
    `).join('');
    if (list.length === 0) laborSelectorBody.innerHTML = '<tr><td colspan="3" style="text-align:center; padding: 2rem;">No se encontraron labores</td></tr>';
}

window.searchLaborsForAssignment = function() {
    const term = laborSearchInput.value.toLowerCase();
    const filtered = allLabores.filter(l => l.labor.toLowerCase().includes(term) || l.codigo_labor.toLowerCase().includes(term));
    renderLaborSelector(filtered);
};

window.assignLabor = async function(laborCode) {
    if (!pendingActivityId) return;
    try {
        const { error } = await dbClient
            .from('t_actividad')
            .update({ codigo_labor: laborCode })
            .eq('codigo_actividad', pendingActivityId);
        
        if (error) throw error;
        
        alert('Labor asignada con éxito');
        closeAssignModal();
        fetchData(); // Refrescar tabla actividades
        renderActivityStats(); // Actualizar indicadores
    } catch (e) {
        console.error('Error assigning labor:', e);
        alert('Error al asignar labor');
    }
};

window.unassignLabor = async function(actId) {
    if (!confirm('¿Desea quitar la labor de esta actividad? Pasará a ser considerada como Jornal.')) return;
    try {
        const { error } = await dbClient
            .from('t_actividad')
            .update({ codigo_labor: null })
            .eq('codigo_actividad', actId);
        if (error) throw error;
        
        fetchData();
        renderActivityStats();
    } catch (e) {
        console.error('Error unassigning labor:', e);
    }
};

// Función para obtener la semana ISO actual
function getCurrentISOWeek() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 4 - (d.getDay() || 7));
    const yearStart = new Date(d.getFullYear(), 0, 1);
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return weekNo;
}

// ... despues de viewsConfig ...


// --- LÓGICA CRUD PRECIOS (Ajustada 2024-12) ---
const priceModal = document.getElementById('priceModal');
const priceForm = document.getElementById('priceForm');
const priceModalTitle = document.getElementById('priceModalTitle');
const inputPriceId = document.getElementById('priceId');
const inputPriceCampana = document.getElementById('priceCampana');
const inputPriceSemana = document.getElementById('priceSemana');
const inputPriceEtapa = document.getElementById('priceEtapa');
const inputPriceActivity = document.getElementById('priceActivity');
const inputPriceLote = document.getElementById('priceLote');
const inputPriceTarea = document.getElementById('priceTarea');
const inputPriceValue = document.getElementById('priceValue');
const inputPriceMeta = document.getElementById('priceMeta');
const inputPriceCeco = document.getElementById('priceCeco');
const inputPriceGeneratedCode = document.getElementById('priceGeneratedId');

let cachedPriceActivities = [];
let cachedPriceLotes = [];

async function initPriceModalData() {
    try {
        // Llenar semanas 1-52 si está vacío
        if (inputPriceSemana.options.length <= 1) {
            for (let i = 1; i <= 52; i++) {
                const opt = document.createElement('option');
                opt.value = i; opt.textContent = `Semana ${i}`;
                inputPriceSemana.appendChild(opt);
            }
        }

        if (cachedPriceActivities.length === 0) {
            // CARGA EXHAUSTIVA utilizando la nueva función de paginación
            cachedPriceActivities = await fetchFullTable('t_actividad', (query) => 
                query.select('codigo_actividad, actividad_agt, codigo_labor')
                     .not('codigo_labor', 'is', null)
                     .order('actividad_agt')
            );
        }
        
        // Siempre configurar/actualizar el buscador con la data actual (por si se reabre el modal)
        setupSearchableSelect({
            containerId: 'priceActivityContainer',
            inputId: 'priceActivitySearch',
            hiddenId: 'priceActivity',
            dropdownId: 'priceActivityDropdown',
            data: cachedPriceActivities.map(a => ({ id: a.codigo_actividad, title: a.actividad_agt, subtitle: a.codigo_labor })),
            onSelect: (codigoActividad) => filterCpooByActivity(codigoActividad)
        });

        if (cachedPriceLotes.length === 0) {
            const { data: lotes, error } = await dbClient.from('t_lote').select('codigo_lote, lote').order('codigo_lote');
            if (!error) {
                cachedPriceLotes = lotes;
                inputPriceLote.innerHTML = '<option value="">Seleccione Lote...</option>';
                lotes.forEach(l => {
                    const opt = document.createElement('option');
                    opt.value = l.codigo_lote; opt.textContent = `${l.codigo_lote} - ${l.lote || 'Lote'}`;
                    inputPriceLote.appendChild(opt);
                });
            }
        }

        // Ya no cargamos 9000+ registros de CPOO al inicio.
        // Se cargan ON-DEMAND al elegir la actividad.
        setupSearchableSelect({
            containerId: 'priceCecoContainer',
            inputId: 'priceCecoSearch',
            hiddenId: 'priceCeco',
            dropdownId: 'priceCecoDropdown',
            data: [] // Vacío inicialmente
        });
    } catch (e) { console.error(e); }
}


// --- Función para actualizar el ID generado ---
window.updatePriceGeneratedId = function() {
    const activity = cachedPriceActivities.find(a => a.codigo_actividad === inputPriceActivity.value);
    const laborCode = activity ? activity.codigo_labor : 'LABOR';
    
    if (inputPriceCampana.value && inputPriceSemana.value && inputPriceActivity.value && inputPriceLote.value) {
        inputPriceGeneratedCode.value = `${inputPriceCampana.value}-${inputPriceSemana.value}-${laborCode}-${inputPriceLote.value}`;
    } else {
        inputPriceGeneratedCode.value = '---';
    }
};

// --- Filtrado Inteligente de CPOO por Actividad (Carga Dinámica) ---
async function filterCpooByActivity(codigoActividad) {
    updatePriceGeneratedId(); // Mantener actualización de código
    
    const cpooSearch = document.getElementById('priceCecoSearch');
    cpooSearch.placeholder = "Cargando Proyectos (CPOO)...";
    cpooSearch.disabled = true;

    // Limpiar selección previa al cambiar actividad
    const hiddenCpoo = document.getElementById('priceCeco');
    hiddenCpoo.value = '';
    cpooSearch.value = '';

    try {
        // Obtener los cod_cpoo relacionados a esta actividad
        const { data: rels, error: relError } = await dbClient
            .from('t_actividad_cpoo')
            .select('cod_cpoo')
            .eq('codigo_actividad', codigoActividad);

        if (relError) throw relError;

        if (!rels || rels.length === 0) {
            setupSearchableSelect({ containerId: 'priceCecoContainer', data: [] });
            cpooSearch.placeholder = "Sin proyectos vinculados a esta actividad";
            cpooSearch.disabled = false;
            return;
        }

        // Obtener códigos únicos (puede haber duplicados)
        const uniqueCodes = [...new Set(rels.map(r => r.cod_cpoo))];

        // Intentar obtener nombres descriptivos desde t_cpoo
        let cpooMap = {};
        try {
            const { data: cpoos } = await dbClient
                .from('t_cpoo')
                .select('cod_cpoo, cpoo')
                .in('cod_cpoo', uniqueCodes);
            if (cpoos && cpoos.length > 0) {
                cpoos.forEach(c => { cpooMap[c.cod_cpoo] = c.cpoo; });
            }
        } catch (e) { /* t_cpoo puede estar vacía, no es crítico */ }

        const filteredData = uniqueCodes.map(code => ({
            id: code,
            title: cpooMap[code] || code, // Usa nombre descriptivo si existe, sino el código
            subtitle: code
        }));

        // Actualizar el componente de búsqueda con los datos frescos
        setupSearchableSelect({
            containerId: 'priceCecoContainer',
            data: filteredData
        });

        cpooSearch.placeholder = `Buscar entre ${filteredData.length} proyecto(s)...`;
    } catch (e) {
        console.error("Error cargando CPOOs relacionados:", e);
        cpooSearch.placeholder = "Error al cargar proyectos";
    } finally {
        cpooSearch.disabled = false;
    }
}

window.openPriceModal = async function(price = null) {
    const isEdit = price && price.id_precio;
    priceModal.style.display = 'flex';
    priceForm.reset();
    await initPriceModalData();

    if (isEdit) {
        priceModalTitle.textContent = 'Editar Tarifa de Precio';
        inputPriceId.value = price.id_precio;
        inputPriceCampana.value = price.campana;
        inputPriceSemana.value = price.semana;
        inputPriceEtapa.value = price.id_etapa;
        inputPriceActivity.value = price.codigo_actividad;
        // Actualizar UI del buscador
        const act = cachedPriceActivities.find(a => a.codigo_actividad === price.codigo_actividad);
        if (act) document.getElementById('priceActivitySearch').value = `${act.actividad_agt} (${act.codigo_labor})`;

        inputPriceLote.value = price.codigo_lote;
        inputPriceTarea.value = price.tarea || '';
        inputPriceValue.value = price.precio || '';
        inputPriceMeta.value = price.meta || '';
        
        inputPriceCeco.value = price.cod_cpoo;
        // Cargar dinámicamente los CPOOs de esta actividad y luego restaurar el valor guardado
        if (price.codigo_actividad) {
            filterCpooByActivity(price.codigo_actividad).then(() => {
                // Restaurar: filterCpooByActivity limpia los campos, así que los reponemos
                inputPriceCeco.value = price.cod_cpoo || '';
                document.getElementById('priceCecoSearch').value = price.cod_cpoo || '';
            });
        }

        inputPriceGeneratedCode.value = price.codigo_precio;
    } else {
        priceModalTitle.textContent = 'Nueva Tarifa de Precio';
        inputPriceId.value = '';
        inputPriceCampana.value = new Date().getFullYear();
        inputPriceSemana.value = getCurrentISOWeek(); // Semana actual por defecto
        inputPriceEtapa.value = 1;
        document.getElementById('priceActivitySearch').value = '';
        document.getElementById('priceCecoSearch').value = '';
        updatePriceGeneratedId();
    }
};

// --- Utilidad para Dropdowns Buscables (Premium) ---
function setupSearchableSelect(config) {
    const { containerId, inputId, hiddenId, dropdownId, data, onSelect } = config;
    const container = document.getElementById(containerId);

    // PRIMERO: Si ya está inicializado, solo actualizamos la data y retornamos
    if (container && container.dataset.initialized === "true") {
        if (config.data) {
            container._updateData(config.data);
        }
        return; 
    }

    const input = document.getElementById(inputId);
    const hidden = document.getElementById(hiddenId);
    const dropdown = document.getElementById(dropdownId);

    if (!input || !dropdown) return;

    let currentData = data;

    const render = (filter = '') => {
        const allFiltered = currentData.filter(item => 
            item.title.toLowerCase().includes(filter.toLowerCase()) || 
            item.subtitle.toLowerCase().includes(filter.toLowerCase()) ||
            item.id.toLowerCase().includes(filter.toLowerCase())
        );
        const filtered = allFiltered.slice(0, 500); // Mostrar hasta 500 resultados

        if (filtered.length === 0) {
            dropdown.innerHTML = '<div class="search-select-empty">No se encontraron resultados</div>';
        } else {
            const remaining = allFiltered.length - filtered.length;
            dropdown.innerHTML = filtered.map(item => `
                <div class="search-select-item" data-id="${item.id}" data-title="${item.title}" data-subtitle="${item.subtitle}">
                    <span class="item-title">${item.title}</span>
                    <span class="item-subtitle">${item.subtitle}</span>
                </div>
            `).join('') + (remaining > 0 ? `<div class="search-select-empty" style="font-style:italic;">... y ${remaining} más. Escribe para filtrar.</div>` : '');
        }
        dropdown.style.display = 'block';
    };

    input.addEventListener('focus', () => render(input.value));
    input.addEventListener('input', () => render(input.value));

    dropdown.addEventListener('click', (e) => {
        const item = e.target.closest('.search-select-item');
        if (item) {
            const id = item.dataset.id;
            const title = item.dataset.title;
            const subtitle = item.dataset.subtitle;

            hidden.value = id;
            input.value = `${title} (${subtitle})`;
            dropdown.style.display = 'none';
            if (onSelect) onSelect(id);
        }
    });

    // Cerrar al hacer click fuera
    document.addEventListener('click', (e) => {
        if (!container.contains(e.target)) {
            dropdown.style.display = 'none';
        }
    });

    // Marcar como inicializado y guardar referencia para actualizar data
    container.dataset.initialized = "true";
    container._updateData = (newData) => {
        currentData = newData;
    };
}

window.closePriceModal = function() {
    priceModal.style.display = 'none';
};

window.editPrice = function(id) {
    const item = data.find(p => p.id_precio === id);
    if (item) openPriceModal(item);
};

window.savePrice = async function() {
    const id = inputPriceId.value;
    const codigo = inputPriceGeneratedCode.value;
    
    if (codigo === '---') { alert('Complete todos los campos de selección.'); return; }

    const activity = cachedPriceActivities.find(a => a.codigo_actividad === inputPriceActivity.value);
    
    const formData = {
        codigo_precio: codigo,
        campana: inputPriceCampana.value,
        semana: parseInt(inputPriceSemana.value),
        id_etapa: parseInt(inputPriceEtapa.value),
        codigo_lote: inputPriceLote.value,
        codigo_actividad: inputPriceActivity.value,
        codigo_labor: activity.codigo_labor,
        cod_cpoo: inputPriceCeco.value.trim().toUpperCase(),
        precio: parseFloat(inputPriceValue.value) || 0,
        tarea: parseFloat(inputPriceTarea.value) || 0,
        meta: parseFloat(inputPriceMeta.value) || 0
    };

    try {
        let result;
        if (id) {
            result = await dbClient.from('t_precio').update(formData).eq('id_precio', id);
        } else {
            result = await dbClient.from('t_precio').insert([formData]);
        }

        if (result.error) throw result.error;

        alert(`Tarifa ${id ? 'actualizada' : 'registrada'} con éxito.`);
        closePriceModal();
        fetchData();
    } catch (e) {
        console.error(e);
        alert('Error al guardar: Verifique que no exista una tarifa con el mismo código.');
    }
};

window.deletePrice = async function(id) {
    if (!confirm('¿Desea eliminar esta tarifa permanentemente?')) return;
    try {
        const { error } = await dbClient.from('t_precio').delete().eq('id_precio', id);
        if (error) throw error;
        alert('Tarifa eliminada.');
        fetchData();
    } catch (e) { console.error(e); alert('Error al eliminar.'); }
};

/* =========================================================
   SISTEMA DE AUTENTICACIÓN (LOGIN / LOGOUT)
   ========================================================= */

async function initAuth() {
    const loginScreen = document.getElementById('loginScreen');
    const dashboardLayout = document.getElementById('dashboardLayout');
    const loginForm = document.getElementById('loginForm');
    const loginEmail = document.getElementById('loginEmail');
    const loginPassword = document.getElementById('loginPassword');
    const loginSubmitBtn = document.getElementById('loginSubmitBtn');
    const loginErrorMsg = document.getElementById('loginErrorMsg');
    const logoutBtn = document.getElementById('logoutBtn');
    const currentUserEmail = document.getElementById('currentUserEmail');

    // 1. Revisar si hay sesión activa
    const { data: { session } } = await dbClient.auth.getSession();
    
    if (session) {
        currentUser = session.user;
        loginScreen.style.display = 'none';
        dashboardLayout.style.display = 'flex';
        currentUserEmail.textContent = currentUser.email;
        setupView();
    } else {
        loginScreen.style.display = 'flex';
        dashboardLayout.style.display = 'none';
    }

    // 2. Manejar envío del Login
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const email = loginEmail.value.trim();
            const password = loginPassword.value;
            
            if (!email || !password) return;

            loginSubmitBtn.disabled = true;
            loginSubmitBtn.innerHTML = '<i class="ph ph-spinner ph-spin"></i> Verificando...';
            loginErrorMsg.style.display = 'none';

            const { data, error } = await dbClient.auth.signInWithPassword({
                email: email,
                password: password,
            });

            if (error) {
                loginSubmitBtn.disabled = false;
                loginSubmitBtn.innerHTML = '<span>Iniciar Sesión</span> <i class="ph ph-sign-in"></i>';
                loginErrorMsg.innerHTML = `<i class="ph ph-warning-circle"></i> ${error.message || 'Credenciales inválidas'}. Por favor intente de nuevo.`;
                loginErrorMsg.style.display = 'flex';
            } else {
                currentUser = data.user;
                loginScreen.style.display = 'none';
                dashboardLayout.style.display = 'flex';
                if (currentUserEmail) currentUserEmail.textContent = currentUser.email;
                
                // IMPORTANTE: Eliminamos el reload para asegurar que la sesión se mantenga activa 
                // incluso si el almacenamiento local es restringido por el navegador.
                setupView();
            }
        });
    }

    // 3. Manejar Cierre de Sesión
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            await dbClient.auth.signOut();
            window.location.reload();
        });
    }
}

// --- LÓGICA DE FILTROS AVANZADOS PRECIOS ---
let priceFiltersInitialized = false;

async function initPriceFilters() {
    if (priceFiltersInitialized) return;
    
    const loteSelect = document.getElementById('priceFilterLote');
    if (!loteSelect) return;

    try {
        // Poblar Lotes desde base de datos
        const { data: lotes, error } = await dbClient
            .from('t_lote')
            .select('codigo_lote, lote')
            .order('codigo_lote');
        
        if (!error && lotes) {
            // Guardar lista maestra de lotes para reseteos
            window.masterLotes = lotes;
            // Re-poblar dropdown inicial
            populateLoteDropdown(lotes);
        }
        
        priceFiltersInitialized = true;
    } catch (e) {
        console.error('Error initializing price filters:', e);
    }
}

function populateLoteDropdown(lotes) {
    const loteSelect = document.getElementById('priceFilterLote');
    if (!loteSelect) return;
    
    loteSelect.innerHTML = '<option value="all">Todos los Lotes</option>';
    
    // Añadir opción para Precios Generales (Sin Lote)
    const nullOpt = document.createElement('option');
    nullOpt.value = 'null_lote';
    nullOpt.textContent = 'PRECIOS GENERALES (Sin Lote)';
    nullOpt.style.fontWeight = '700';
    nullOpt.style.color = 'var(--accent-color)';
    loteSelect.appendChild(nullOpt);

    lotes.forEach(l => {
        const opt = document.createElement('option');
        opt.value = l.codigo_lote;
        opt.textContent = `${l.codigo_lote} - ${l.lote || 'Lote'}`;
        loteSelect.appendChild(opt);
    });
}

window.resetPriceFilters = function() {
    const sInput = document.getElementById('searchInput');
    if (sInput) sInput.value = '';
    
    const loteSelect = document.getElementById('priceFilterLote');
    if (loteSelect) loteSelect.value = 'all';
    
    searchQuery = '';
    updateLoteDropdown(null);
    currentPage = 0;
    fetchData();
};

async function updateLoteDropdown(activityName) {
    const loteSelect = document.getElementById('priceFilterLote');
    if (!loteSelect) return;

    if (!activityName) {
        if (window.masterLotes) populateLoteDropdown(window.masterLotes);
        return;
    }

    try {
        // 1. Encontrar el código de la actividad basándonos en el nombre exacto de la sugerencia
        const { data: actData } = await dbClient
            .from('t_actividad')
            .select('codigo_actividad')
            .eq('actividad_agt', activityName)
            .limit(1);
        
        const activityCode = actData?.[0]?.codigo_actividad;
        
        // 2. Si no hay código (búsqueda parcial manual), volvemos a la lista maestra
        if (!activityCode) {
            if (window.masterLotes) populateLoteDropdown(window.masterLotes);
            return;
        }

        // 3. Buscar lotes únicos que tengan precio para esta actividad
        const { data: priceData, error } = await dbClient
            .from('t_precio')
            .select('codigo_lote, t_lote(lote)')
            .eq('codigo_actividad', activityCode);
        
        if (error) throw error;

        // 4. Mapear y filtrar lotes únicos
        const uniqueLotesMap = {};
        priceData.forEach(p => {
            if (p.codigo_lote) {
                uniqueLotesMap[p.codigo_lote] = p.t_lote?.lote || 'Lote';
            }
        });

        const filteredLotes = Object.entries(uniqueLotesMap).map(([code, name]) => ({
            codigo_lote: code,
            lote: name
        }));

        populateLoteDropdown(filteredLotes);
    } catch (e) {
        console.warn('Error al filtrar lotes por actividad:', e);
    }
}

function initRankingYearFilter() {
    const yearSelect = document.getElementById('yearFilter');
    if (!yearSelect) return;
    
    // Solo agregar si está vacío (excepto la opción 'all')
    if (yearSelect.options.length <= 1) {
        const years = getRankingYears();
        years.forEach(y => {
            const opt = document.createElement('option');
            opt.value = y;
            opt.textContent = `Ranking ${y}`;
            yearSelect.appendChild(opt);
        });
    }
}

// --- RENDERIZADO DEL HUB DE SUBGERENCIAS (DINÁMICO) ---
async function renderSubgerenciaHub() {
    const hubContainer = document.getElementById('subgerenciaHub');
    if (!hubContainer) return;

    hubContainer.innerHTML = `
        <div style="grid-column: 1 / -1; padding: 4rem; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center;">
            <div class="loader-primary" style="width: 40px; height: 40px; border: 3px solid #f3f3f3; border-top: 3px solid var(--primary-color); border-radius: 50%; animation: spin 1s linear infinite; margin-bottom: 1rem;"></div>
            <p style="color: var(--text-secondary); font-weight: 500;">Sincronizando Sedes y Evolución...</p>
        </div>
    `;

    try {
        // 1. Obtener todas las subgerencias activas desde la base de datos con sus códigos
        const { data: subgerenciasData, error: dbError } = await dbClient
            .from('t_operacion')
            .select('operacion, codigo_operacion, t_fundo_gnrl(count)')
            .order('operacion', { ascending: true });

        if (dbError) throw dbError;

        // 1.1 Obtener mapeo de Nombres de Proyectos
        const { data: mappingData } = await dbClient
            .from('t_tipo_proyecto')
            .select('tipo_proyecto, proyecto');
        const projectMap = {};
        if (mappingData) {
            mappingData.forEach(m => projectMap[m.tipo_proyecto] = m.proyecto);
        }

        const hubImages = {
            'LA ENCANTADA': 'assets/la_encantada_hero_1775674894813.png',
            'CRUZ VERDE': 'assets/cruz_verde_hero_1775674880362.png'
        };
        const subLogos = {
            'LA ENCANTADA': 'assets/LogoBeta_SG_LaEncantada.png',
            'CRUZ VERDE': 'assets/LogoBeta_SG_CruzVerde.png'
        };
        const defaultImage = 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?q=80&w=1632&auto=format&fit=crop';

        const hubHtml = await Promise.all(subgerenciasData.map(async (sede) => {
            const op = sede.operacion;
            const codOp = sede.codigo_operacion;
            const numFundos = (sede.t_fundo_gnrl && sede.t_fundo_gnrl[0]) ? sede.t_fundo_gnrl[0].count : 0;
            
            // Consultas en paralelo para máximo rendimiento
            const [history, projectStats] = await Promise.all([
                getSubgerenciaKPIs(op),
                getSubgerenciaProjectStats(op)
            ]);

            const bgImage = hubImages[op] || defaultImage;

            // Calcular Totales
            const totalJornales = history.reduce((acc, row) => acc + (row.total_jornales || 0), 0);
            const totalTrabajadores = history.reduce((acc, row) => acc + (row.total_trabajadores || 0), 0);

            const historyRows = history.map(row => `
                <div class="evolution-row">
                    <span class="evolution-year">${row.anio}</span>
                    <span class="evolution-val">${row.total_jornales.toLocaleString()} jor.</span>
                    <span class="evolution-val workers">${row.total_trabajadores.toLocaleString()} pers.</span>
                </div>
            `).join('');

            const totalRow = `
                <div class="evolution-row" style="border-top: 2px solid rgba(255,255,255,0.3); background: rgba(0,0,0,0.2); margin-top: 4px; font-weight: 800; position: sticky; bottom: 0; backdrop-filter: blur(4px);">
                    <span class="evolution-year">TOTAL ACUM.</span>
                    <span class="evolution-val" style="color: #60a5fa;">${totalJornales.toLocaleString()} jor.</span>
                    <span class="evolution-val workers" style="color: #4ade80;">${totalTrabajadores.toLocaleString()} pers.</span>
                </div>
            `;

            // Mapeo de colores para tipos de proyecto
            const projectTypeColors = {
                'Centro Costo': '#3b82f6',
                'Proyecto Operacion (LT)': '#f59e0b',
                'Proyecto Plantación (PT)': '#10b981',
                'Proyecto Obra en Curso': '#8b5cf6',
                'Orden': '#ef4444'
            };

            const projectStatsHtml = projectStats.map(stat => `
                <div class="project-stat-tag" style="border-left: 3px solid ${projectTypeColors[stat.tipo_proyecto] || '#64748b'};">
                    <span class="tag-label">${projectMap[stat.tipo_proyecto] || stat.tipo_proyecto || 'OTROS'}</span>
                    <span class="tag-val">${stat.total_registros.toLocaleString()} <span style="font-size: 0.7rem; opacity: 0.7; font-weight: 500; margin-left: 2px;">jor.</span></span>
                </div>
            `).join('');

            return `
                <div class="hub-card" style="min-height: 520px;">
                    <img src="${bgImage}" alt="${op}" class="hub-card-bg">
                    <div class="hub-card-overlay"></div>
                    <div class="hub-action" onclick="window.goToView('subgerencia_detail', 'codigo_operacion', \`${codOp}\`, \`Subgerencia ${op}\`)"></div>
                    <div class="hub-action-btn">
                        <i class="ph ph-arrow-up-right"></i>
                    </div>
                    <div class="hub-card-content">
                        ${subLogos[op] ? `
                            <div class="subgerencia-recreated-logo" style="margin-bottom: 1rem; display: flex; flex-direction: column; gap: 4px;">
                                <img src="assets/logo-beta-top.png" alt="Beta" style="height: 20px; width: fit-content; object-fit: contain;">
                                <div style="display: flex; flex-direction: column; border-left: 2px solid ${op === 'CRUZ VERDE' ? '#8ec63f' : '#a855f7'}; padding-left: 10px; margin-top: 2px;">
                                    <span style="font-size: 0.6rem; text-transform: uppercase; letter-spacing: 1.5px; font-weight: 700; color: rgba(255,255,255,0.9);">Subgerencia</span>
                                    <span style="font-size: 1rem; font-weight: 800; color: #ffffff; letter-spacing: -0.02em;">
                                        ${op === 'CRUZ VERDE' ? '<span style="color:#8ec63f">Cruz</span> Verde' : '<span style="color:#a855f7">La</span> Encantada'}
                                    </span>
                                </div>
                            </div>
                        ` : ''}

                        <div style="display: flex; gap: 0.5rem; margin-bottom: 0.75rem; flex-wrap: wrap;">
                            <div class="hub-tag hub-fundo-tag" style="background: rgba(0, 75, 147, 0.4);"><i class="ph-fill ph-tree"></i> ${numFundos} Fundos</div>
                        </div>

                        <h3 class="hub-title" style="margin-bottom: 0.25rem;">${op}</h3>
                        <p class="hub-subtitle" style="margin-bottom: 1.25rem; font-size: 0.8rem; opacity: 0.8;">Gestión operativa centralizada y despliegue técnico.</p>

                        <div class="project-stats-grid" style="margin-bottom: 1.5rem;">
                            ${projectStatsHtml}
                        </div>
                        
                        <div class="hub-evolution">
                            <div class="evolution-header">
                                <span>Año</span>
                                <span>Intensidad Jornales</span>
                                <span>Personal Total</span>
                            </div>
                            <div class="evolution-body">
                                ${historyRows}
                                ${totalRow}
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }));

        hubContainer.innerHTML = hubHtml.join('');
    } catch (error) {
        console.error('Error al cargar Hub de Subgerencias:', error);
        hubContainer.innerHTML = `<p style="color: #ef4444; padding: 2rem;">Error al cargar evolución histórica. Por favor, reintente.</p>`;
    }
}

async function getSubgerenciaKPIs(opName) {
    try {
        const { data, error } = await dbClient
            .from('mvw_resumen_anual_subgerencia')
            .select('*')
            .eq('empresa', opName)
            .order('anio', { ascending: false });

        if (error) return [];
        return data || [];
    } catch (e) {
        return [];
    }
}

async function getSubgerenciaProjectStats(opName) {
    try {
        const { data, error } = await dbClient
            .from('mvw_tipo_proyecto_subgerencia')
            .select('*')
            .eq('codigo_operacion', opName) 
            .order('total_registros', { ascending: false });

        if (error) return [];
        return data || [];
    } catch (e) {
        console.warn(`Error en Stats de Proyecto para ${opName}:`, e);
        return [];
    }
}

// --- RENDERIZADO DEL HUB DE FUNDOS GENERALES (DINÁMICO Y OPTIMIZADO) ---
async function renderSubgerenciaDetailHub(opName) {
    const hubContainer = document.getElementById('subgerenciaDetailHub');
    if (!hubContainer) return;

    hubContainer.innerHTML = `
        <div style="grid-column: 1 / -1; padding: 4rem; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center;">
            <div class="loader-primary" style="width: 40px; height: 40px; border: 3px solid #f3f3f3; border-top: 3px solid var(--primary-color); border-radius: 50%; animation: spin 1s linear infinite; margin-bottom: 1rem;"></div>
            <p style="color: var(--text-secondary); font-weight: 500;">Generando Bloque Operativo de Sede...</p>
        </div>
    `;

    try {
        const hubImages = {
            'O02': 'assets/la_encantada_wide_hero.png',
            'O01': 'assets/cruz_verde_wide_hero.png'
        };
        const defaultImage = 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?q=80&w=1632&auto=format&fit=crop';
        const bgHero = hubImages[opName] || defaultImage; 

        // Obtener el nombre limpio desde la etiqueta del filtro
        const displayName = activeFilter.label || opName; 
        const cleanName = displayName.replace('Subgerencia ', '').toUpperCase();

        // Actualizar Título Global
        if (mainTitle) mainTitle.textContent = displayName;

        // 1. Obtener LISTADO de Fundos Generales usando el CÓDIGO (O01, O02)
        const { data: fundosData, error: fgError } = await dbClient
            .from('t_fundo_gnrl')
            .select('*')
            .eq('codigo_operacion', opName)
            .order('fundo_general', { ascending: true });

        if (fgError) throw fgError;

        // 2. Renderizar Bloque 1 (Hero)
        const block1Html = `
            <!-- Bloque 1: Hero de Subgerencia -->
            <div class="hub-hero" style="background-image: url('${bgHero}'); height: 350px; background-size: cover; background-position: center; border-radius: 16px; margin-bottom: 2rem; grid-column: 1 / -1;">
                <div class="hub-hero-overlay"></div>
                <div class="hub-hero-content" style="padding: 3rem 4rem; display: flex; flex-direction: column; justify-content: flex-start; gap: 1.5rem;">
                    <div class="subgerencia-recreated-logo" style="display: flex; flex-direction: column; gap: 8px; transform: scale(1.1); transform-origin: left;">
                        <img src="assets/logo-beta-top.png" alt="Beta" style="height: 28px; width: fit-content; object-fit: contain; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));">
                        <div style="display: flex; flex-direction: column; border-left: 3px solid ${cleanName.includes('CRUZ VERDE') ? '#8ec63f' : '#a855f7'}; padding-left: 14px; margin-top: 4px;">
                            <span style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 2px; font-weight: 700; color: rgba(255,255,255,0.95); line-height: 1;">Subgerencia</span>
                            <span style="font-size: 1.6rem; font-weight: 800; color: #ffffff; letter-spacing: -0.02em; line-height: 1.1;">
                                ${cleanName.includes('CRUZ VERDE') ? '<span style="color:#8ec63f">Cruz</span> Verde' : '<span style="color:#a855f7">La</span> Encantada'}
                            </span>
                        </div>
                    </div>
                    <p style="max-width: 550px; color: rgba(255,255,255,0.95); font-size: 1.05rem; line-height: 1.6; margin-top: 0.5rem; text-shadow: 0 2px 4px rgba(0,0,0,0.3);">
                        Bienvenido al Dashboard Centralizado de la ${displayName}. Explore a continuación las unidades técnicas de producción asociadas a esta sede.
                    </p>
                </div>
            </div>
        `;

        // 3. Renderizar Bloque 2 (Cuadrícula de Fundos en una sola FILA)
        const fundoImages = ['assets/fundo_gnrl_1.png', 'assets/fundo_gnrl_2.png', 'assets/fundo_gnrl_3.png', 'assets/fundo_gnrl_4.png'];
        
        const block2CardsHtml = await Promise.all(fundosData.map(async (fundo, index) => {
            const fg = fundo.fundo_general;
            const history = await getFundoGnrlKPIs(fg);
            const bgCard = fundoImages[index % fundoImages.length];

            // Calcular Totales
            const totalJornales = history.reduce((acc, row) => acc + (row.total_jornales || 0), 0);
            const totalTrabajadores = history.reduce((acc, row) => acc + (row.total_trabajadores || 0), 0);

            const historyRows = history.length > 0 ? history.map(row => `
                <div class="evolution-row">
                    <span class="evolution-year">${row.anio}</span>
                    <span class="evolution-val">${row.total_jornales.toLocaleString()} jor.</span>
                    <span class="evolution-val workers">${row.total_trabajadores.toLocaleString()} pers.</span>
                </div>
            `).join('') : `
                <div style="padding: 1rem; text-align: center; color: rgba(255,255,255,0.5); font-style: italic; font-size: 0.8rem;">
                    Historial en fase de consolidación técnica...
                </div>
            `;

            const totalRow = history.length > 0 ? `
                <div class="evolution-row" style="border-top: 2px solid rgba(255,255,255,0.3); background: rgba(0,0,0,0.2); margin-top: 4px; font-weight: 800; position: sticky; bottom: 0; backdrop-filter: blur(4px);">
                    <span class="evolution-year">TOTAL ACUM.</span>
                    <span class="evolution-val" style="color: #60a5fa;">${totalJornales.toLocaleString()} jor.</span>
                    <span class="evolution-val workers" style="color: #4ade80;">${totalTrabajadores.toLocaleString()} pers.</span>
                </div>
            ` : '';

            return `
                <div class="hub-card" style="min-height: 480px; animation: fadeIn 0.4s ease-out;">
                    <img src="${bgCard}" alt="${fg}" class="hub-card-bg">
                    <div class="hub-card-overlay"></div>
                    <div class="hub-action" onclick="window.goToView('fundo', 't_fundo_gnrl.fundo_general', \`${fg}\`, \`Fundo Padre: ${fg}\`)"></div>
                    <div class="hub-action-btn"><i class="ph ph-tree"></i></div>
                    <div class="hub-card-content">
                        <div style="display: flex; gap: 0.75rem; margin-bottom: 1rem;">
                            <div class="hub-tag"><i class="ph-fill ph-check-circle"></i> Activo</div>
                            <div class="hub-tag hub-fundo-tag"><i class="ph-fill ph-buildings"></i> ${displayName}</div>
                        </div>
                        <h3 class="hub-title" style="font-size: 2.2rem;">${fg}</h3>
                        <p class="hub-subtitle" style="margin-bottom: 1.5rem;">Unidad técnica de producción de Uva de mesa de alta calidad para exportación.</p>
                        <div class="hub-evolution">
                            <div class="evolution-header"><span>Año</span><span>Intensidad</span><span>Personal</span></div>
                            <div class="evolution-body">
                                ${historyRows}
                                ${totalRow}
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }));

        hubContainer.innerHTML = block1Html + `
            <!-- Marco Bloque 2: Fundos Generales -->
            <div style="grid-column: 1 / -1; background: rgba(0, 75, 147, 0.02); border: 1px solid rgba(0, 75, 147, 0.05); border-radius: 24px; padding: 2rem; margin-bottom: 2rem;">
                <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 2rem; padding-left: 0.5rem;">
                    <div style="width: 40px; height: 40px; background: var(--primary-color); color: white; border-radius: 12px; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 12px rgba(0,75,147,0.2);">
                        <i class="ph-fill ph-tree-structure" style="font-size: 1.5rem;"></i>
                    </div>
                    <div>
                        <h3 style="margin: 0; font-size: 1.3rem; font-weight: 800; color: #1e293b; letter-spacing: -0.01em; text-transform: uppercase;">Fundos Generales</h3>
                        <p style="margin: 0; font-size: 0.85rem; color: var(--text-secondary);">Principales sedes administrativas y de control operativo.</p>
                    </div>
                </div>
                <div id="bloque2" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(350px, 1fr)); gap: 1.5rem;">
                    ${block2CardsHtml.join('')}
                </div>
            </div>

            <!-- Fila Inferior (Sticky Enabled): Bloques 3 y 4 -->
            <div style="grid-column: 1 / -1; display: grid; grid-template-columns: 1.2fr 1fr; gap: 2.5rem; padding: 1rem 0 4rem 0; align-items: flex-start;">
                
                <!-- Bloque 3: Subfundos (Columna Exploratoria) -->
                <div id="bloque3" style="display: flex; flex-direction: column; gap: 1.25rem; background: rgba(0, 150, 64, 0.02); border: 1px solid rgba(0, 150, 64, 0.05); border-radius: 24px; padding: 2rem;">
                    <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 1.5rem; padding-left: 0.5rem;">
                        <div style="width: 40px; height: 40px; background: var(--accent-color); color: white; border-radius: 12px; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 12px rgba(0,150,64,0.2);">
                            <i class="ph-fill ph-plant" style="font-size: 1.5rem;"></i>
                        </div>
                        <div>
                            <h3 style="margin: 0; font-size: 1.3rem; font-weight: 800; color: #1e293b; letter-spacing: -0.01em; text-transform: uppercase;">Subfundos</h3>
                            <p style="margin: 0; font-size: 0.85rem; color: var(--text-secondary);">Seleccione un sector para ver sus lotes actuales.</p>
                        </div>
                    </div>
                    <div id="sectoresList" style="display: flex; flex-direction: column; gap: 1rem;">
                        <!-- Se cargará dinámicamente -->
                    </div>
                </div>

                <!-- Bloque 4: Detalle de Lotes (Columna Sticky/Anclada) -->
                <div id="bloque4" style="position: sticky; top: 100px; z-index: 10;">
                    <div style="height: 100%; min-height: 480px; border: 2px dashed rgba(0, 75, 147, 0.1); border-radius: 24px; display: flex; flex-direction: column; align-items: center; justify-content: center; background: rgba(255,255,255,0.4); padding: 3rem; text-align: center; transition: all 0.3s ease;">
                        <div style="background: white; width: 64px; height: 64px; border-radius: 16px; display: flex; align-items: center; justify-content: center; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.05); margin-bottom: 1.5rem;">
                            <i class="ph ph-hand-tap" style="font-size: 1.8rem; color: #cbd5e1;"></i>
                        </div>
                        <h4 style="color: #64748b; font-weight: 700; margin-bottom: 0.5rem;">Visualizador Pro</h4>
                        <p style="color: #94a3b8; font-size: 0.9rem; max-width: 250px;">Seleccione un subfundo de la izquierda para anclar aquí sus lotes operativos.</p>
                    </div>
                </div>
            </div>
        `;

        // 4. Cargar y Renderizar Bloque 3 (Fundos Específicos)
        renderBloque3(opName, displayName);

    } catch (e) {
        console.error('Error en renderSubgerenciaDetailHub:', e);
        hubContainer.innerHTML = `<p style="color: #ef4444; padding: 2rem;">Error al cargar el bloque operativo de sede.</p>`;
    }
}

async function renderBloque3(opCode, opName) {
    const listContainer = document.getElementById('sectoresList');
    if (!listContainer) return;

    try {
        const { data: sectoresData, error } = await dbClient
            .from('t_fundo')
            .select('*, t_fundo_gnrl!inner(codigo_operacion, fundo_general)')
            .eq('t_fundo_gnrl.codigo_operacion', opCode)
            .order('fundo', { ascending: true });

        if (error) throw error;

        const subImages = ['assets/fundo_1.png', 'assets/fundo_2.png', 'assets/fundo_3.png', 'assets/fundo_4.png'];

        const sectoresHtml = await Promise.all(sectoresData.map(async (f, index) => {
            const history = await getFundoKPIs(f.fundo);
            const bgImage = subImages[index % subImages.length];
            
            // Tomamos solo el año más reciente para el resumen compacto
            const historyListHtml = history.map(row => `
                <div style="display: flex; gap: 1rem; align-items: center; justify-content: space-between; padding: 4px 0; border-bottom: 1px dasehd #f1f5f9; font-size: 0.7rem;">
                    <span style="font-weight: 800; color: #94a3b8; min-width: 35px;">${row.anio}</span>
                    <span style="color: #1e293b; font-weight: 700; flex: 1;">${row.total_jornales.toLocaleString()} <small style="font-weight: 400; font-size: 0.6rem;">jor.</small></span>
                    <span style="color: var(--accent-color); font-weight: 700; min-width: 60px; text-align: right;">${row.total_trabajadores.toLocaleString()} <small style="font-weight: 400; font-size: 0.6rem;">pers.</small></span>
                </div>
            `).join('');

            return `
                <div class="hub-card-compact subfundo-selector" style="display: flex; gap: 1.5rem; background: white; border-radius: 16px; padding: 1.25rem; border: 1px solid rgba(0,0,0,0.05); box-shadow: 0 4px 6px -1px rgba(0,0,0,0.01); transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); cursor: pointer; position: relative; overflow: hidden;" 
                     onclick="window.loadLotesIntoBlock4(\`${f.codigo_fundo}\`, \`${f.fundo}\`, event)">
                    
                    <div style="width: 100px; height: 100px; border-radius: 12px; overflow: hidden; flex-shrink: 0; border: 1px solid rgba(0,0,0,0.05);">
                        <img src="${bgImage}" style="width: 100%; height: 100%; object-fit: cover;">
                    </div>

                    <div style="width: 180px; display: flex; flex-direction: column; justify-content: center; border-right: 1px solid #f1f5f9; padding-right: 1rem;">
                        <h4 style="margin: 0; font-size: 1.1rem; font-weight: 800; color: #1e293b; margin-bottom: 0.25rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${f.fundo}">${f.fundo}</h4>
                        <div style="display: flex; gap: 0.75rem; align-items: center; margin-bottom: 0.75rem;">
                            <span style="font-size: 0.65rem; font-weight: 700; color: var(--accent-color); background: rgba(0, 150, 64, 0.05); padding: 1px 6px; border-radius: 4px; text-transform: uppercase;">Activo</span>
                        </div>
                        
                        <div style="display: flex; flex-direction: column; gap: 4px;">
                            <span style="font-size: 0.6rem; color: #94a3b8; font-weight: 700; text-transform: uppercase;">Total Acumulado</span>
                            <span style="font-size: 1rem; color: var(--primary-color); font-weight: 900;">
                                ${history.reduce((a,b)=>a+(b.total_jornales||0),0).toLocaleString()} <small style="font-weight: 400; font-size: 0.7rem;">jor.</small>
                            </span>
                        </div>
                    </div>

                    <div style="flex: 1; display: flex; flex-direction: column; justify-content: center; padding-right: 2rem;">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 4px; border-bottom: 1px solid #e2e8f0; padding-bottom: 2px;">
                             <span style="font-size: 0.6rem; font-weight: 800; color: #94a3b8; text-transform: uppercase;">Evolución Anual</span>
                             <span style="font-size: 0.6rem; font-weight: 800; color: #94a3b8; text-transform: uppercase;">Personal</span>
                        </div>
                        <div style="padding-right: 4px;">
                            ${history.length > 0 ? historyListHtml : '<span style="font-size: 0.7rem; color: #cbd5e1; font-style: italic;">Sin historial...</span>'}
                        </div>
                    </div>

                    <div style="position: absolute; right: 1.25rem; top: 50%; transform: translateY(-50%); color: #e2e8f0;">
                        <i class="ph ph-caret-right" style="font-size: 1.5rem;"></i>
                    </div>
                </div>
            `;
        }));

        listContainer.innerHTML = sectoresHtml.join('');

    } catch (e) {
        console.error('Error en Bloque 3:', e);
        listContainer.innerHTML = '<p style="color: #94a3b8; font-size: 0.85rem; padding: 1rem;">No se pudieron cargar los sectores asociados.</p>';
    }
}

// Expone la función globalmente
window.loadLotesIntoBlock4 = async function(fCode, fName, event) {
    const bloque4 = document.getElementById('bloque4');
    if (!bloque4) return;

    // 1. Efecto Visual de selección Pro
    document.querySelectorAll('.subfundo-selector').forEach(card => {
        card.style.border = '1px solid rgba(0,0,0,0.05)';
        card.style.transform = 'scale(1)';
        card.style.boxShadow = '0 4px 6px -1px rgba(0,0,0,0.01)';
        card.style.background = 'white';
    });

    const selectedCard = event.currentTarget;
    if (selectedCard) {
        selectedCard.style.border = '1px solid var(--accent-color)';
        selectedCard.style.background = 'rgba(0, 150, 64, 0.02)';
        selectedCard.style.transform = 'scale(1.02)';
        selectedCard.style.boxShadow = '0 10px 15px -3px rgba(0, 150, 64, 0.1)';
        
        // 2. Auto-Scroll suave Pro
        bloque4.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'nearest' });
    }

    // Loader
    bloque4.innerHTML = `
        <div style="background: white; border-radius: 24px; padding: 3rem; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; border: 1px solid rgba(0,0,0,0.05); min-height: 400px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.05);">
            <div class="loader-primary" style="width: 40px; height: 40px; border: 3px solid #f3f3f3; border-top: 3px solid var(--accent-color); border-radius: 50%; animation: spin 1s linear infinite; margin-bottom: 1.5rem;"></div>
            <h4 style="color: #1e293b; font-weight: 700; margin: 0;">Sincronizando Lotes</h4>
            <p style="color: #64748b; font-size: 0.9rem; margin-top: 0.5rem;">Explorando datos de ${fName}...</p>
        </div>
    `;
    try {
        // 1. Obtener Periodos de Vigencia (Activos e Históricos)
        const { data: lotes, error: lotesError } = await dbClient
            .from('v_lote_vigencia_por_fundo')
            .select('lote, semana_inicio, anio_inicio, semana_fin, anio_fin, es_vigente, variedad, densidad, hectareas, plantas_lote')
            .eq('codigo_fundo', fCode)
            .order('es_vigente', { ascending: false })
            .order('lote', { ascending: true });

        if (lotesError) throw lotesError;

        if (!lotes || lotes.length === 0) {
            bloque4.innerHTML = `
                <div style="background: white; border-radius: 24px; padding: 3rem; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; border: 1px solid rgba(0,0,0,0.05); min-height: 400px;">
                    <i class="ph ph-folder-not-found" style="font-size: 3rem; color: #cbd5e1; margin-bottom: 1rem;"></i>
                    <h4 style="color: #475569; font-weight: 700;">Sin Lotes Disponibles</h4>
                    <p style="color: #94a3b8; font-size: 0.9rem;">No se registra actividad técnica (vigente o histórica) en este sector.</p>
                </div>
            `;
            return;
        }

        const activeCount = lotes.filter(l => l.es_vigente).length;
        
        // --- SISTEMA DE IDENTIDAD VISUAL POR VARIEDAD (PALETA BETA) ---
        const getVarietyTheme = (v) => {
            if (!v) return { color: '#64748b', bg: '#f1f5f9', icon: 'ph-plant' };
            const name = v.toUpperCase();
            
            // Colores específicos solicitados por el usuario
            if (name.includes('THOMPSON')) return { color: '#ffffff', bg: '#9ab46c', icon: 'ph-leaf' };
            if (name.includes('SWEET GLOBE')) return { color: '#ffffff', bg: '#b0cc1f', icon: 'ph-leaf' };
            if (name.includes('SWEET CELEBRATION')) return { color: '#ffffff', bg: '#b9574d', icon: 'ph-cherry' };
            if (name.includes('RED GLOBE')) return { color: '#ffffff', bg: '#6e4854', icon: 'ph-cherry' };
            if (name.includes('CRIMSON')) return { color: '#ffffff', bg: '#bd271e', icon: 'ph-cherry' };
            if (name.includes('ALLISON')) return { color: '#ffffff', bg: '#b8628b', icon: 'ph-cherry' };

            // Grupos por defecto si no es específico
            if (['SUGAR CRISP', 'IVORY', 'EARLY SWEET', 'ARRA 15'].some(x => name.includes(x))) {
                return { color: '#ffffff', bg: '#9ab46c', icon: 'ph-leaf' };
            }
            if (['TIMCO', 'MAGENTA', 'SCARLOTTA'].some(x => name.includes(x))) {
                return { color: '#ffffff', bg: '#bd271e', icon: 'ph-cherry' };
            }
            if (['AUTUMN ROYAL', 'SABLE', 'MIDNIGHT BEAUTY', 'SWEET SAPPHIRE', 'ADORA'].some(x => name.includes(x))) {
                return { color: '#ffffff', bg: '#4c1d95', icon: 'ph-moon-stars' };
            }
            return { color: '#ffffff', bg: '#4338ca', icon: 'ph-plant' };
        };

        // 3. Renderizar Lotes con Estética Premium
        const lotesHtml = lotes.map((l, index) => {
            const isHistorical = !l.es_vigente;
            const theme = getVarietyTheme(l.variedad);
            
            const vigenciaText = isHistorical 
                ? `${l.semana_inicio} (${l.anio_inicio}) a ${l.semana_fin} (${l.anio_fin})`
                : `${l.semana_inicio} (${l.anio_inicio}) — Actualidad`;
            
            return `
            <div class="lote-card-premium ${isHistorical ? 'historical' : 'active'}" style="--delay: ${index * 0.05}s">
                <div class="card-top-header">
                    <div class="lote-id-container">
                        <div class="lote-icon-box ${isHistorical ? 'historical' : 'active'}">
                            <i class="ph ${isHistorical ? 'ph-clock-history' : 'ph-hash-straight'}"></i>
                        </div>
                        <div class="lote-name-group">
                            <span class="lote-title">${l.lote || 'Sin Nombre'}</span>
                            <div class="vid-badge">
                                <i class="ph ph-calendar-blank"></i>
                                <span>${vigenciaText}</span>
                            </div>
                        </div>
                    </div>
                    <div class="status-indicator-group">
                        ${isHistorical 
                            ? '<span class="status-pill historical">HISTORIAL</span>' 
                            : '<div class="live-pill"><span class="pulse"></span><span>LIVE</span></div>'
                        }
                    </div>
                </div>

                <div class="technical-stats-grid">
                    <!-- Variedad Re-diseñada -->
                    <div class="variety-hero-badge" style="background: ${theme.bg}; color: ${theme.color}; border: 1px solid ${theme.color}20">
                        <i class="ph-fill ${theme.icon}"></i>
                        <span class="v-name">${l.variedad || 'VARIEDAD NO REGISTRADA'}</span>
                    </div>

                    <!-- Métricas Técnicas Secundarias -->
                    <div class="tech-metrics-cols">
                        <div class="tech-item">
                            <i class="ph ph-unite"></i>
                            <div class="t-dat">
                                <span class="t-lab">ÁREA</span>
                                <span class="t-val">${l.hectareas || '0'} <sub>HAS</sub></span>
                            </div>
                        </div>
                        <div class="tech-item">
                            <i class="ph ph-dots-nine"></i>
                            <div class="t-dat">
                                <span class="t-lab">DEN</span>
                                <span class="t-val">${l.densidad || '0'}</span>
                            </div>
                        </div>
                        <div class="tech-item full-w">
                            <i class="ph ph-tree-evergreen"></i>
                            <div class="t-dat">
                                <span class="t-lab">POBLACIÓN</span>
                                <span class="t-val">${l.plantas_lote ? l.plantas_lote.toLocaleString() : '0'} <sub>PLT</sub></span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            `;
        }).join('');

        bloque4.innerHTML = `
            <div class="premium-hub-container">
                <style>
                    .premium-hub-container {
                        background: linear-gradient(145deg, #ffffff, #f8fafc);
                        border: 1px solid rgba(0,0,0,0.05);
                        border-radius: 32px;
                        padding: 2.5rem;
                        height: 100%;
                        box-shadow: 0 20px 50px -12px rgba(0,0,0,0.05);
                        animation: slideUpFade 0.5s ease-out;
                        display: flex;
                        flex-direction: column;
                    }

                    .hub-header-pro {
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                        margin-bottom: 2.5rem;
                        padding-bottom: 1.5rem;
                        border-bottom: 1px solid rgba(0,0,0,0.04);
                    }

                    .hub-title-group h4 {
                        margin: 0;
                        color: #0f172a;
                        font-size: 1.4rem;
                        font-weight: 900;
                        letter-spacing: -0.02em;
                        text-transform: uppercase;
                    }

                    .glass-badge-pro {
                        background: rgba(var(--primary-rgb, 0, 150, 64), 0.08);
                        backdrop-filter: blur(10px);
                        border: 1px solid rgba(var(--primary-rgb, 0, 150, 64), 0.1);
                        color: var(--primary-color);
                        padding: 8px 16px;
                        border-radius: 14px;
                        font-size: 0.75rem;
                        font-weight: 800;
                        letter-spacing: 0.05em;
                        box-shadow: 0 4px 12px rgba(0,0,0,0.03);
                    }

                    .lotes-grid-pro {
                        display: grid;
                        grid-template-columns: 1fr;
                        gap: 1rem;
                        max-height: 520px;
                        overflow-y: auto;
                        padding-right: 1rem;
                        margin-bottom: 1rem;
                    }

                    .lotes-grid-pro::-webkit-scrollbar { width: 6px; }
                    .lotes-grid-pro::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }

                    .lote-card-premium {
                        background: white;
                        border: 1px solid #f1f5f9;
                        border-radius: 24px;
                        padding: 1.5rem;
                        margin-bottom: 0.5rem;
                        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                        animation: lotEntry 0.5s ease-out forwards;
                        animation-delay: var(--delay);
                        opacity: 0;
                        box-shadow: 0 4px 6px -1px rgba(0,0,0,0.02);
                    }

                    .lote-card-premium:hover {
                        transform: translateY(-5px);
                        box-shadow: 0 20px 25px -5px rgba(0,0,0,0.05);
                        border-color: #e2e8f0;
                    }

                    .card-top-header {
                        display: flex;
                        justify-content: space-between;
                        align-items: flex-start;
                        margin-bottom: 1.25rem;
                    }

                    .lote-id-container {
                        display: flex;
                        align-items: center;
                        gap: 1rem;
                    }

                    .lote-icon-box {
                        width: 44px;
                        height: 44px;
                        border-radius: 12px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-size: 1.1rem;
                    }

                    .lote-icon-box.active { background: #f8fafc; color: #1e293b; border: 1px solid #f1f5f9; }
                    .lote-icon-box.historical { background: #f1f5f9; color: #94a3b8; }

                    .lote-title {
                        color: #0f172a;
                        font-weight: 900;
                        font-size: 1.1rem;
                        display: block;
                        letter-spacing: -0.01em;
                    }

                    .vid-badge {
                        display: flex;
                        align-items: center;
                        gap: 6px;
                        font-size: 0.65rem;
                        font-weight: 700;
                        color: #64748b;
                        text-transform: uppercase;
                        margin-top: 2px;
                    }

                    .live-pill {
                        display: flex;
                        align-items: center;
                        gap: 6px;
                        background: #f0fdf4;
                        color: #16a34a;
                        padding: 4px 10px;
                        border-radius: 100px;
                        font-size: 0.6rem;
                        font-weight: 900;
                        border: 1px solid #dcfce7;
                    }

                    .status-pill.historical {
                        background: #f1f5f9;
                        color: #94a3b8;
                        padding: 4px 10px;
                        border-radius: 100px;
                        font-size: 0.6rem;
                        font-weight: 900;
                    }

                    /* Technical Stats Layout */
                    .technical-stats-grid {
                        padding: 1rem;
                        background: #fbfcfd;
                        border-radius: 16px;
                        border: 1px solid #f1f5f9;
                    }

                    .variety-hero-badge {
                        display: flex;
                        align-items: center;
                        gap: 10px;
                        padding: 10px 14px;
                        border-radius: 12px;
                        margin-bottom: 1rem;
                        transition: all 0.2s ease;
                    }

                    .variety-hero-badge i { font-size: 1.1rem; }
                    .v-name { font-weight: 900; font-size: 0.8rem; letter-spacing: 0.02em; }

                    .tech-metrics-cols {
                        display: grid;
                        grid-template-columns: 1fr 1fr;
                        gap: 0.75rem;
                    }

                    .tech-item {
                        display: flex;
                        align-items: center;
                        gap: 10px;
                        background: white;
                        padding: 8px 12px;
                        border-radius: 10px;
                        border: 1px solid #f1f5f9;
                    }

                    .tech-item.full-w { grid-column: 1 / -1; }
                    .tech-item i { color: #64748b; font-size: 0.9rem; }

                    .t-dat { display: flex; flex-direction: column; }
                    .t-lab { font-size: 0.55rem; font-weight: 800; color: #94a3b8; letter-spacing: 0.05em; }
                    .t-val { font-size: 0.8rem; font-weight: 900; color: #1e293b; }
                    .t-val sub { font-size: 0.55rem; font-weight: 700; color: #94a3b8; bottom: 0; }

                    @keyframes lotEntry {
                        from { opacity: 0; transform: translateY(15px); }
                        to { opacity: 1; transform: translateY(0); }
                    }

                    @keyframes pulse-ring {
                        0% { transform: scale(0.7); opacity: 1; }
                        80%, 100% { transform: scale(2.5); opacity: 0; }
                    }

                    .pulse {
                        width: 6px;
                        height: 6px;
                        background: #16a34a;
                        border-radius: 50%;
                        position: relative;
                    }

                    .pulse::after {
                        content: '';
                        position: absolute;
                        top: 0; left: 0; right: 0; bottom: 0;
                        background: inherit;
                        border-radius: inherit;
                        animation: pulse-ring 1.5s cubic-bezier(0.455, 0.03, 0.515, 0.955) infinite;
                    }

                    @keyframes slideUpFade {
                        from { opacity: 0; transform: translateY(20px); }
                        to { opacity: 1; transform: translateY(0); }
                    }
                </style>

                <div class="hub-header-pro">
                    <div class="hub-title-group">
                        <h4>Lotes: ${fName}</h4>
                    </div>
                    <div class="glass-badge-pro">
                        ${activeCount} ACTIVOS / ${lotes.length} TOTAL
                    </div>
                </div>
                
                <div class="lotes-grid-pro">
                    ${lotesHtml}
                </div>

                <div style="margin-top: 1rem; padding-top: 1.5rem; border-top: 1px solid rgba(0,0,0,0.04);">
                    <button class="nav-btn" style="width: 100%; background: #0f172a; justify-content: center; color: white; height: 50px; border-radius: 16px; font-weight: 800; font-size: 0.85rem; box-shadow: 0 10px 20px -5px rgba(15, 23, 42, 0.2); transition: all 0.3s ease;" 
                            onclick="window.goToView('fundo_lote', 'codigo_fundo', \`${fCode}\`, \`Sector: ${fName}\`)">
                        VER PANEL TÉCNICO COMPLETO <i class="ph ph-arrow-right" style="margin-left: 10px;"></i>
                    </button>
                    <p style="font-size: 0.75rem; color: #94a3b8; margin-top: 1.25rem; text-align: center; font-weight: 500;">Pulse para acceder al análisis detallado de rendimientos.</p>
                </div>
            </div>
        `;

    } catch (e) {
        console.error('Error al cargar Lotes en Bloque 4:', e);
        bloque4.innerHTML = `<p style="color: #ef4444; padding: 2rem;">Error crítico de sincronización.</p>`;
    }
}




async function renderFundoGnrlHub() {
    const hubContainer = document.getElementById('fundoGnrlHub');
    const filterBar = document.getElementById('fundoGnrlFilterBar');
    const indicatorBar = document.getElementById('fundoGnrlIndicator');
    const cardsGrid = document.getElementById('fundoGnrlCardsGrid');
    
    if (!hubContainer || !cardsGrid) return;

    // 1. Mostrar estado de carga SOLO en la grilla de tarjetas
    cardsGrid.innerHTML = `
        <div style="grid-column: 1 / -1; padding: 4rem; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center;">
            <div class="loader-primary" style="width: 40px; height: 40px; border: 3px solid #f3f3f3; border-top: 3px solid var(--primary-color); border-radius: 50%; animation: spin 1s linear infinite; margin-bottom: 1rem;"></div>
            <p style="color: var(--text-secondary); font-weight: 500;">Sincronizando datos operativos...</p>
        </div>
    `;

    try {
        // 2. Cargar catálogo de subgerencias SOLO si la barra está vacía (Persistencia)
        if (filterBar && filterBar.innerHTML.trim() === "") {
            const { data: opsData } = await dbClient
                .from('t_operacion')
                .select('operacion')
                .order('operacion', { ascending: true });
            
            const subgerencias = opsData.map(o => o.operacion);
            filterBar.innerHTML = `
                <div class="hub-filter-bar" style="margin-bottom: 2rem; display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: center; animation: fadeIn 0.5s ease-out;">
                    <span style="font-size: 0.8rem; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; margin-right: 0.5rem; display: flex; align-items: center; gap: 0.4rem;">
                        <i class="ph ph-funnel" style="color: var(--primary-color);"></i> Filtrar por Subgerencia:
                    </span>
                    <div id="fundoGnrlChipsContainer" style="display: flex; flex-wrap: wrap; gap: 0.75rem;">
                        <!-- Los chips se actualizan independientemente -->
                    </div>
                </div>
            `;
            const chipsContainer = document.getElementById('fundoGnrlChipsContainer');
            chipsContainer.innerHTML = `
                <button class="filter-chip" onclick="window.goToView('fundo_gnrl', null, null, null)">Ver Todos</button>
                ${subgerencias.map(op => `<button class="filter-chip" onclick="window.goToView('fundo_gnrl', 't_operacion.operacion', \`${op}\`, \`Subgerencia: ${op}\`)">${op}</button>`).join('')}
            `;
        }

        // 3. Actualizar estado "active" de los chips sin re-renderizar la barra
        const chips = document.querySelectorAll('.filter-chip');
        chips.forEach(chip => {
            const opName = chip.textContent.trim();
            const isActive = (!activeFilter && opName === "Ver Todos") || (activeFilter && activeFilter.value === opName);
            if (isActive) chip.classList.add('active');
            else chip.classList.remove('active');
        });

        // 4. Actualizar Indicador de Filtro
        if (indicatorBar) {
            if (activeFilter && activeFilter.column) {
                indicatorBar.innerHTML = `
                    <div class="hub-filter-indicator" style="margin-bottom: 1rem; animation: slideDown 0.4s ease-out;">
                        <div style="background: rgba(0, 75, 147, 0.05); border: 1px solid rgba(0, 75, 147, 0.1); padding: 1rem 1.5rem; border-radius: 16px; display: flex; align-items: center; justify-content: space-between;">
                            <div style="display: flex; align-items: center; gap: 1rem;">
                                <div style="background: var(--primary-color); color: white; width: 40px; height: 40px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 1.25rem;">
                                    <i class="ph-fill ph-funnel"></i>
                                </div>
                                <div>
                                    <h4 style="margin: 0; font-size: 0.9rem; color: var(--primary-color); font-weight: 700;">Vista Filtrada</h4>
                                    <p style="margin: 0; font-size: 0.8rem; color: var(--text-secondary);">${activeFilter.label}</p>
                                </div>
                            </div>
                            <button onclick="window.goToView('fundo_gnrl', null, null, null)" class="drilldown-btn" style="background: white; border: 1px solid var(--border-color);">
                                Ver Todos los Fundos <i class="ph ph-arrow-left"></i>
                            </button>
                        </div>
                    </div>
                `;
            } else {
                indicatorBar.innerHTML = "";
            }
        }

        // 5. Cargar Datos de Fundos
        let query = dbClient
            .from('t_fundo_gnrl')
            .select('fundo_general, codigo_fundo_gnrl, t_operacion!inner(operacion)')
            .order('fundo_general', { ascending: true });

        if (activeFilter && activeFilter.column) {
            if (activeFilter.column.includes('t_operacion')) {
                query = query.eq('t_operacion.operacion', activeFilter.value);
            } else {
                query = query.eq(activeFilter.column, activeFilter.value);
            }
        }

        const { data: fundosData, error: dbError } = await query;
        if (dbError) throw dbError;

        const hubImages = ['assets/fundo_gnrl_1.png', 'assets/fundo_gnrl_2.png', 'assets/fundo_gnrl_3.png', 'assets/fundo_gnrl_4.png'];

        const hubHtml = await Promise.all(fundosData.map(async (fundo, index) => {
            const codGnrl = fundo.codigo_fundo_gnrl;
            const fg = fundo.fundo_general;
            const op = fundo.t_operacion?.operacion || 'Operación Beta';
            const bgImage = hubImages[index % hubImages.length];

            // 1. Obtener Datos en paralelo (Histórico y Proyectos)
            const [history, projectStats] = await Promise.all([
                getFundoGnrlKPIs(fg),
                getFundoGnrlProjectStats(fundo.codigo_fundo_gnrl) // Cambié a usar el código si es ID
            ]);

            // Obtener nombres de proyectos amigables
            const { data: mappingData } = await dbClient.from('t_tipo_proyecto').select('tipo_proyecto, proyecto');
            const projectMap = {};
            if (mappingData) mappingData.forEach(m => projectMap[m.tipo_proyecto] = m.proyecto);

            // Calcular Totales
            const totalJornales = history.reduce((acc, row) => acc + (row.total_jornales || 0), 0);
            const totalTrabajadores = history.reduce((acc, row) => acc + (row.total_trabajadores || 0), 0);

            const projectStatsHtml = projectStats.map(stat => `
                <div class="project-stat-tag" style="border-left: 3px solid ${projectTypeColors[stat.tipo_proyecto] || '#64748b'};">
                    <span class="tag-label">${projectMap[stat.tipo_proyecto] || stat.tipo_proyecto || 'OTROS'}</span>
                    <span class="tag-val">${stat.total_registros.toLocaleString()} <span style="font-size: 0.7rem; opacity: 0.7; font-weight: 500; margin-left: 2px;">jor.</span></span>
                </div>
            `).join('');

            const historyRows = history.length > 0 ? history.map(row => `
                <div class="evolution-row">
                    <span class="evolution-year">${row.anio}</span>
                    <span class="evolution-val">${row.total_jornales.toLocaleString()} jor.</span>
                    <span class="evolution-val workers">${row.total_trabajadores.toLocaleString()} pers.</span>
                </div>
            `).join('') : `
                <div style="padding: 1rem; text-align: center; color: rgba(255,255,255,0.5); font-style: italic; font-size: 0.8rem;">
                    Historial en fase de consolidación técnica...
                </div>
            `;

            const totalRow = history.length > 0 ? `
                <div class="evolution-row" style="border-top: 2px solid rgba(255,255,255,0.2); background: rgba(255,255,255,0.05); margin-top: 4px; font-weight: 800;">
                    <span class="evolution-year">TOTAL ACUM.</span>
                    <span class="evolution-val" style="color: #60a5fa;">${totalJornales.toLocaleString()} jor.</span>
                    <span class="evolution-val workers" style="color: #4ade80;">${totalTrabajadores.toLocaleString()} pers.</span>
                </div>
            ` : '';

            return `
                <div class="hub-card" style="min-height: 540px; animation: fadeIn 0.4s ease-out;">
                    <img src="${bgImage}" alt="${fg}" class="hub-card-bg">
                    <div class="hub-card-overlay"></div>
                    <div class="hub-action" onclick="window.goToView('fundo', 't_fundo_gnrl.fundo_general', \`${fg}\`, \`Fundo Padre: ${fg}\`)"></div>
                    <div class="hub-action-btn"><i class="ph ph-tree"></i></div>
                    <div class="hub-card-content">
                        <div style="display: flex; gap: 0.75rem; margin-bottom: 0.75rem;">
                            <div class="hub-tag"><i class="ph-fill ph-check-circle"></i> Activo</div>
                            <div class="hub-tag hub-fundo-tag" style="background: rgba(0, 75, 147, 0.4);"><i class="ph-fill ph-buildings"></i> Subgerencia ${op}</div>
                        </div>
                        <h3 class="hub-title" style="margin-bottom: 0.25rem;">${fg}</h3>
                        <p class="hub-subtitle" style="margin-bottom: 1.25rem; font-size: 0.8rem; opacity: 0.8;">Gestión operativa centralizada y despliegue técnico.</p>

                        <div class="project-stats-grid" style="margin-bottom: 1.5rem;">
                            ${projectStatsHtml}
                        </div>

                        <div class="hub-evolution">
                            <div class="evolution-header"><span>Año</span><span>Intensidad</span><span>Personal</span></div>
                            <div class="evolution-body">
                                ${historyRows}
                                ${totalRow}
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }));

        cardsGrid.innerHTML = hubHtml.join('');
    } catch (error) {
        console.error('Error al cargar Hub de Fundos Generales:', error);
        cardsGrid.innerHTML = `<p style="color: #ef4444; padding: 2rem;">Error al cargar fundos generales. Por favor, reintente.</p>`;
    }
}

async function getFundoGnrlKPIs(fgName) {
    try {
        // Intentamos consultar si existe una vista similar, si no fallback a vacío
        const { data, error } = await dbClient
            .from('mvw_resumen_anual_fundo_gnrl') // Asumimos esta posible vista o fallback
            .select('*')
            .eq('fundo_general', fgName)
            .order('anio', { ascending: false });

        if (error) return [];
        return data || [];
    } catch (e) {
        return [];
    }
}

document.addEventListener('DOMContentLoaded', () => { 
    initAuth();
    initRankingYearFilter();

    // Lógica de Menú Móvil
    const hamburgerBtn = document.getElementById('hamburgerBtn');
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    const navBtns = document.querySelectorAll('.nav-btn');

    const toggleMenu = () => {
        sidebar.classList.toggle('active');
        overlay.classList.toggle('active');
    };

    if (hamburgerBtn) hamburgerBtn.addEventListener('click', toggleMenu);
    if (overlay) overlay.addEventListener('click', toggleMenu);

    // Cerrar menú al seleccionar vista en móvil
    navBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            if (window.innerWidth <= 1024) toggleMenu();
        });
    });
});

// --- RENDERIZADO DEL HUB DE FUNDOS ESPECÍFICOS (MODERNO) ---
async function renderFundoHub() {
    const hubContainer = document.getElementById('fundoHub');
    const filterBar = document.getElementById('fundoFilterBar');
    const indicatorBar = document.getElementById('fundoIndicator');
    const cardsGrid = document.getElementById('fundoCardsGrid');
    
    if (!hubContainer || !cardsGrid) return;

    cardsGrid.innerHTML = `
        <div style="grid-column: 1 / -1; padding: 4rem; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center;">
            <div class="loader-primary" style="width: 40px; height: 40px; border: 3px solid #f3f3f3; border-top: 3px solid var(--primary-color); border-radius: 50%; animation: spin 1s linear infinite; margin-bottom: 1rem;"></div>
            <p style="color: var(--text-secondary); font-weight: 500;">Consolidando Fundos Específicos...</p>
        </div>
    `;

    try {
        // 1. Chips de Filtro (por Fundo General)
        if (filterBar && filterBar.innerHTML.trim() === "") {
            const { data: fgData } = await dbClient
                .from('t_fundo_gnrl')
                .select('fundo_general')
                .order('fundo_general', { ascending: true });
            
            const fundosGnrl = fgData.map(f => f.fundo_general);
            filterBar.innerHTML = `
                <div class="hub-filter-bar" style="margin-bottom: 2rem; display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: center; animation: fadeIn 0.5s ease-out;">
                    <span style="font-size: 0.8rem; font-weight: 700; color: var(--text-secondary); text-uppercase; margin-right: 0.5rem; display: flex; align-items: center; gap: 0.4rem;">
                        <i class="ph ph-funnel" style="color: var(--primary-color);"></i> Filtrar por Fundo General:
                    </span>
                    <div id="fundoChipsContainer" style="display: flex; flex-wrap: wrap; gap: 0.75rem;"></div>
                </div>
            `;
            const chipsContainer = document.getElementById('fundoChipsContainer');
            chipsContainer.innerHTML = `
                <button class="filter-chip" onclick="window.goToView('fundo', null, null, null)">Ver Todos</button>
                ${fundosGnrl.map(fg => `<button class="filter-chip" onclick="window.goToView('fundo', 't_fundo_gnrl.fundo_general', \`${fg}\`, \`Fundo Gnr: ${fg}\`)">${fg}</button>`).join('')}
            `;
        }

        // 2. Actualizar estado chips
        const chips = document.querySelectorAll('#fundoChipsContainer .filter-chip');
        chips.forEach(chip => {
            const fgName = chip.textContent.trim();
            const isActive = (!activeFilter && fgName === "Ver Todos") || (activeFilter && activeFilter.value === fgName);
            if (isActive) chip.classList.add('active');
            else chip.classList.remove('active');
        });

        // 3. Indicador
        if (indicatorBar) {
            if (activeFilter && activeFilter.column) {
                indicatorBar.innerHTML = `
                    <div class="hub-filter-indicator" style="margin-bottom: 1.5rem; animation: slideDown 0.4s ease-out;">
                        <div style="background: rgba(0, 150, 64, 0.05); border: 1px solid rgba(0, 150, 64, 0.1); padding: 1rem 1.5rem; border-radius: 16px; display: flex; align-items: center; justify-content: space-between;">
                            <div style="display: flex; align-items: center; gap: 1rem;">
                                <div style="background: var(--accent-color); color: white; width: 40px; height: 40px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 1.25rem;">
                                    <i class="ph-fill ph-plant"></i>
                                </div>
                                <div>
                                    <h4 style="margin: 0; font-size: 0.9rem; color: var(--accent-color); font-weight: 700;">Fundos de ${activeFilter.value}</h4>
                                    <p style="margin: 0; font-size: 0.8rem; color: var(--text-secondary);">Explorando unidades de producción específicas.</p>
                                </div>
                            </div>
                            <button onclick="window.goToView('fundo', null, null, null)" class="drilldown-btn" style="background: white; color: var(--accent-color); border-color: rgba(0, 150, 64, 0.2)">
                                Limpiar Filtro <i class="ph ph-x"></i>
                            </button>
                        </div>
                    </div>
                `;
            } else {
                indicatorBar.innerHTML = "";
            }
        }

        // 4. Datos
        let query = dbClient
            .from('t_fundo')
            .select('codigo_fundo, fundo, t_fundo_gnrl!inner(fundo_general)')
            .order('fundo', { ascending: true });

        if (activeFilter && activeFilter.column) {
            if (activeFilter.column.includes('t_fundo_gnrl')) {
                query = query.eq('t_fundo_gnrl.fundo_general', activeFilter.value);
            } else {
                query = query.eq(activeFilter.column, activeFilter.value);
            }
        }

        const { data: fundosData, error: dbError } = await query;
        if (dbError) throw dbError;

        const hubImages = ['assets/fundo_1.png', 'assets/fundo_2.png', 'assets/fundo_3.png', 'assets/fundo_4.png'];

        const hubHtml = await Promise.all(fundosData.map(async (f, index) => {
            const name = f.fundo;
            const code = f.codigo_fundo; // Usamos el código para filtrar lotes
            const parent = f.t_fundo_gnrl?.fundo_general || 'Fundo General';
            const bgImage = hubImages[index % hubImages.length]; 

            // 1. Obtener Historial (KPIs) para este fundo específico
            const history = await getFundoGnrlKPIs(f.fundo);

            // 2. Calcular Totales con seguridad
            const totalJornales = (history || []).reduce((acc, row) => acc + (row.total_jornales || 0), 0);
            const totalTrabajadores = (history || []).reduce((acc, row) => acc + (row.total_trabajadores || 0), 0);

            const historyRows = history.length > 0 ? history.map(row => `
                <div class="evolution-row">
                    <span class="evolution-year">${row.anio}</span>
                    <span class="evolution-val">${row.total_jornales.toLocaleString()} jor.</span>
                    <span class="evolution-val workers">${row.total_trabajadores.toLocaleString()} pers.</span>
                </div>
            `).join('') : `
                <div style="padding: 1rem; text-align: center; color: rgba(255,255,255,0.5); font-style: italic; font-size: 0.8rem;">
                    Historial en fase de consolidación técnica...
                </div>
            `;

            const totalRow = history.length > 0 ? `
                <div class="evolution-row" style="border-top: 2px solid rgba(255,255,255,0.2); background: rgba(255,255,255,0.05); margin-top: 4px; font-weight: 800;">
                    <span class="evolution-year">TOTAL ACUM.</span>
                    <span class="evolution-val" style="color: #60a5fa;">${totalJornales.toLocaleString()} jor.</span>
                    <span class="evolution-val workers" style="color: #4ade80;">${totalTrabajadores.toLocaleString()} pers.</span>
                </div>
            ` : '';

            return `
                <div class="hub-card" style="min-height: 480px; animation: fadeIn 0.4s ease-out;">
                    <img src="${bgImage}" alt="${name}" class="hub-card-bg">
                    <div class="hub-card-overlay"></div>
                    <div class="hub-action" onclick="window.goToView('fundo_lote', 'codigo_fundo', \`${code}\`, \`Fundo: ${name}\`)"></div>
                    <div class="hub-action-btn" style="background: var(--accent-color);"><i class="ph ph-squares-four"></i></div>
                    <div class="hub-card-content">
                        <div style="display: flex; gap: 0.75rem; margin-bottom: 1rem;">
                            <div class="hub-tag" style="background: rgba(255,255,255,0.15);"><i class="ph-fill ph-map-pin"></i> Nivel 3</div>
                            <div class="hub-tag hub-fundo-tag" style="background: rgba(0, 150, 64, 0.4);"><i class="ph-fill ph-leaf"></i> ${parent}</div>
                        </div>
                        <h3 class="hub-title" style="font-size: 2rem;">${name}</h3>
                        <p class="hub-subtitle" style="margin-bottom: 1.5rem;">Unidad operativa especializada en el cultivo y cosecha de uva de exportación.</p>
                        
                        <div class="hub-evolution" style="background: rgba(0, 0, 0, 0.3);">
                            <div class="evolution-header" style="display:grid; grid-template-columns:0.8fr 1.5fr 1.5fr; gap:1rem; padding: 0.5rem 0; font-size:0.7rem; color:rgba(255,255,255,0.4); text-transform:uppercase; border-bottom:1px solid rgba(255,255,255,0.1);">
                                <span>Año</span><span>Intensidad</span><span>Personal</span>
                            </div>
                            <div class="evolution-body">
                                ${historyRows}
                                ${totalRow}
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }));

        cardsGrid.innerHTML = hubHtml.join('');
    } catch (error) {
        console.error('Error al cargar Hub de Fundos:', error);
        cardsGrid.innerHTML = `<p style="color: #ef4444; padding: 2rem;">Error al cargar fundos. Por favor, reintente.</p>`;
    }
}

async function getFundoGnrlProjectStats(fgId) {
    try {
        const { data, error } = await dbClient
            .from('mvw_tipo_proyecto_fundo_gnrl')
            .select('tipo_proyecto, total_registros')
            .eq('fundo_general', fgId); 

        if (error) return [];
        return data || [];
    } catch (e) {
        console.warn(`Aviso: Estadísticas de proyecto no disponibles para ${fgId}`, e);
        return [];
    }
}

function updateHeaderKPIs(cards = []) {
    const headerKPIs = document.getElementById('headerKPIs');
    if (!headerKPIs) return;

    if (cards.length === 0) {
        // No inyectamos la tarjeta genérica para mantener el diseño ultra-compacto
        headerKPIs.innerHTML = '';
        return;
    }


    headerKPIs.innerHTML = cards.map((c, idx) => `
        <div class="stat-card-mini" style="animation: slideDown 0.4s ease-out ${idx * 0.1}s both;">
            <div class="stat-icon" style="background: ${c.color}15; color: ${c.color};">
                <i class="ph ${c.icon}"></i>
            </div>
            <div class="stat-info">
                <span class="stat-label">${c.label}</span>
                <span class="stat-value" style="color: #1e293b;">${c.value}</span>
            </div>
        </div>
    `).join('');
}

async function getSubgerenciaUnitMetrics(opCode) {
    try {
        const { data, error } = await dbClient
            .from('mvw_metricas_operativas_subgerencia')
            .select('total_fundos, total_subfundos, total_lotes')
            .eq('codigo_operacion', opCode)
            .single();

        if (error) throw error;
        return data || { total_fundos: 0, total_subfundos: 0, total_lotes: 0 };
    } catch (e) {
        console.warn(`Error en métricas de unidades para Subgerencia ${opCode}:`, e);
        return { total_fundos: 0, total_subfundos: 0, total_lotes: 0 };
    }
}

async function getFundoKPIs(fundoName) {
    try {
        const { data, error } = await dbClient
            .from('mvw_resumen_anual_fundo')
            .select('*')
            .eq('fundo', fundoName)
            .order('anio', { ascending: false });

        if (error) return [];
        return data || [];
    } catch (e) {
        console.warn(`Error en KPIs Materializados para Fundo ${fundoName}:`, e);
        return [];
    }
}

// --- RENDERIZADO DEL HUB DE LOTES DE PRODUCCIÓN (MODERNO - NIVEL 4) ---
async function renderLoteHub() {
    const hubContainer = document.getElementById('loteHub');
    const filterBar = document.getElementById('loteFilterBar');
    const indicatorBar = document.getElementById('loteIndicator');
    const cardsGrid = document.getElementById('loteCardsGrid');
    
    if (!hubContainer || !cardsGrid) return;

    cardsGrid.innerHTML = `
        <div style="grid-column: 1 / -1; padding: 4rem; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center;">
            <div class="loader-primary" style="width: 40px; height: 40px; border: 3px solid #f3f3f3; border-top: 3px solid var(--primary-color); border-radius: 50%; animation: spin 1s linear infinite; margin-bottom: 1rem;"></div>
            <p style="color: var(--text-secondary); font-weight: 500;">Sincronizando Lotes y Estado Actual...</p>
        </div>
    `;

    try {
        // 1. Chips de Filtro (por Fundo Específico)
        if (filterBar && filterBar.innerHTML.trim() === "") {
            const { data: fData } = await dbClient
                .from('t_fundo')
                .select('codigo_fundo, fundo')
                .order('fundo', { ascending: true });
            
            filterBar.innerHTML = `
                <div class="hub-filter-bar" style="margin-bottom: 2rem; display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: center; animation: fadeIn 0.5s ease-out;">
                    <span style="font-size: 0.8rem; font-weight: 700; color: var(--text-secondary); text-uppercase; margin-right: 0.5rem; display: flex; align-items: center; gap: 0.4rem;">
                        <i class="ph ph-funnel" style="color: var(--primary-color);"></i> Filtrar por Fundo Específico:
                    </span>
                    <div id="loteChipsContainer" style="display: flex; flex-wrap: wrap; gap: 0.75rem;"></div>
                </div>
            `;
            const chipsContainer = document.getElementById('loteChipsContainer');
            chipsContainer.innerHTML = `
                <button class="filter-chip" onclick="window.goToView('fundo_lote', null, null, null)">Ver Todos</button>
                ${fData.map(f => `<button class="filter-chip" data-code="${f.codigo_fundo}" onclick="window.goToView('fundo_lote', 'codigo_fundo', \`${f.codigo_fundo}\`, \`Fundo: ${f.fundo}\`)">${f.fundo}</button>`).join('')}
            `;
        }

        // 2. Actualizar estado chips
        const chips = document.querySelectorAll('#loteChipsContainer .filter-chip');
        chips.forEach(chip => {
            const code = chip.getAttribute('data-code');
            const isActive = (!activeFilter && chip.textContent.trim() === "Ver Todos") || (activeFilter && activeFilter.value === code);
            if (isActive) chip.classList.add('active');
            else chip.classList.remove('active');
        });

        // 3. Indicador
        if (indicatorBar) {
            if (activeFilter && activeFilter.column) {
                indicatorBar.innerHTML = `
                    <div class="hub-filter-indicator" style="margin-bottom: 1.5rem; animation: slideDown 0.4s ease-out;">
                        <div style="background: rgba(0, 150, 64, 0.05); border: 1px solid rgba(0, 150, 64, 0.1); padding: 1rem 1.5rem; border-radius: 16px; display: flex; align-items: center; justify-content: space-between;">
                            <div style="display: flex; align-items: center; gap: 1rem;">
                                <div style="background: var(--accent-color); color: white; width: 40px; height: 40px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 1.25rem;">
                                    <i class="ph-fill ph-grid-four"></i>
                                </div>
                                <div>
                                    <h4 style="margin: 0; font-size: 0.9rem; color: var(--accent-color); font-weight: 700;">Lotes de ${activeFilter.label.split(': ')[1]}</h4>
                                    <p style="margin: 0; font-size: 0.8rem; color: var(--text-secondary);">Unidades de producción con asignación vigente.</p>
                                </div>
                            </div>
                            <button onclick="window.goToView('fundo_lote', null, null, null)" class="drilldown-btn" style="background: white; color: var(--accent-color); border-color: rgba(0, 150, 64, 0.2)">
                                Limpiar Filtro <i class="ph ph-x"></i>
                            </button>
                        </div>
                    </div>
                `;
            } else {
                indicatorBar.innerHTML = "";
            }
        }

        // 4. Datos (Usando la vista v_lote_fundo_actual)
        let query = dbClient
            .from('v_lote_fundo_actual')
            .select('*')
            .order('lote', { ascending: true });

        if (activeFilter && activeFilter.column) {
            query = query.eq(activeFilter.column, activeFilter.value);
        }

        const { data: lotesData, error: dbError } = await query;
        if (dbError) throw dbError;

        const hubImages = ['assets/lote_1.png', 'assets/lote_2.png', 'assets/lote_3.png', 'assets/lote_4.png'];

        const hubHtml = await Promise.all(lotesData.map(async (l, index) => {
            const name = l.lote;
            const parent = l.nombre_fundo || 'Fundo';
            const bgImage = hubImages[index % hubImages.length];
            
            // 1. Obtener Historial para este lote específico (Usando el mismo helper)
            // Nota: En esta etapa usamos el resumen del lote o fundo asociado
            const history = []; // Por ahora vacío para lotes a menos que definamos mvw_resumen_anual_lote

            // 2. Calcular Totales con seguridad
            const totalJornales = (history || []).reduce((acc, row) => acc + (row.total_jornales || 0), 0);
            const totalTrabajadores = (history || []).reduce((acc, row) => acc + (row.total_trabajadores || 0), 0);

            const historyRows = history.length > 0 ? history.map(row => `
                <div class="evolution-row">
                    <span class="evolution-year">${row.anio}</span>
                    <span class="evolution-val">${row.total_jornales.toLocaleString()} jor.</span>
                    <span class="evolution-val workers">${row.total_trabajadores.toLocaleString()} pers.</span>
                </div>
            `).join('') : `
                <div style="padding: 1rem; text-align: center; color: rgba(255,255,255,0.5); font-style: italic; font-size: 0.8rem;">
                    Sin historial previo registrado...
                </div>
            `;

            const totalRow = history.length > 0 ? `
                <div class="evolution-row" style="border-top: 2px solid rgba(255,255,255,0.2); background: rgba(255,255,255,0.05); margin-top: 4px; font-weight: 800;">
                    <span class="evolution-year">TOTAL ACUM.</span>
                    <span class="evolution-val" style="color: #60a5fa;">${totalJornales.toLocaleString()} jor.</span>
                    <span class="evolution-val workers" style="color: #4ade80;">${totalTrabajadores.toLocaleString()} pers.</span>
                </div>
            ` : '';

            return `
                <div class="hub-card" style="min-height: 480px; animation: fadeIn 0.4s ease-out;">
                    <img src="${bgImage}" alt="${name}" class="hub-card-bg">
                    <div class="hub-card-overlay"></div>
                    <div class="hub-action" onclick="window.goToView('actividad', 'lote', \`${name}\`, \`Lote: ${name}\`)"></div>
                    <div class="hub-action-btn" style="background: var(--accent-color);"><i class="ph ph-list-checks"></i></div>
                    <div class="hub-card-content">
                        <div style="display: flex; gap: 0.75rem; margin-bottom: 1rem;">
                            <div class="hub-tag" style="background: rgba(255,255,255,0.15);"><i class="ph-fill ph-slack-logo"></i> Lote</div>
                            <div class="hub-tag hub-fundo-tag" style="background: rgba(0, 150, 64, 0.4);"><i class="ph-fill ph-plant"></i> ${parent}</div>
                        </div>
                        <h3 class="hub-title" style="font-size: 2rem;">${name}</h3>
                        <p class="hub-subtitle" style="margin-bottom: 1.5rem;">Campaña operativa activa con seguimiento de labores culturales.</p>
                        
                        <div class="hub-evolution" style="background: rgba(0, 0, 0, 0.3);">
                            <div class="evolution-header" style="display:grid; grid-template-columns:0.8fr 1.5fr 1.5fr; gap:1rem; padding: 0.5rem 0; font-size:0.7rem; color:rgba(255,255,255,0.4); text-transform:uppercase; border-bottom:1px solid rgba(255,255,255,0.1);">
                                <span>Año</span><span>Intensidad</span><span>Personal</span>
                            </div>
                            <div class="evolution-body">
                                ${historyRows}
                                ${totalRow}
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }));

        cardsGrid.innerHTML = hubHtml.join('');
    } catch (error) {
        console.error('Error al cargar Hub de Lotes:', error);
        cardsGrid.innerHTML = `<p style="color: #ef4444; padding: 2rem;">Error al cargar lotes. Por favor, reintente.</p>`;
    }
}

async function getLoteKPIs(loteName) {
    try {
        const { data, error } = await dbClient
            .from('mvw_resumen_anual_lote')
            .select('*')
            .eq('lote', loteName)
            .order('anio', { ascending: false });

        if (error) return [];
        return data || [];
    } catch (e) {
        console.warn(`Error en KPIs Materializados para Lote ${loteName}:`, e);
        return [];
    }
}

// --- DASHBOARD DE MÉTRICAS DE TRABAJADORES ---
async function fetchWorkerDashboardMetrics() {
    const metricsContainer = document.getElementById('workerMetricsDash');
    if (!metricsContainer) return;

    metricsContainer.innerHTML = `
        <div class="talent-metric-card skeleton" style="height:140px"></div>
        <div class="talent-metric-card skeleton" style="height:140px"></div>
        <div class="talent-metric-card skeleton" style="height:140px"></div>
    `;

    try {
        // Fetch consolidado de campos necesarios
        const { data: workerData, error: dbError } = await dbClient
            .from('t_trabajador')
            .select('genero, procedencia, telefono_principal, tiene_whatsapp');
        
        if (dbError) throw dbError;

        const total = workerData.length;
        if (total === 0) {
            metricsContainer.innerHTML = '<p style="padding: 2rem; color: var(--text-secondary);">No hay suficientes datos para generar métricas.</p>';
            return;
        }

        // Cálculos de Género
        const males = workerData.filter(r => r.genero && r.genero.toUpperCase().startsWith('M')).length;
        const females = workerData.filter(r => r.genero && r.genero.toUpperCase().startsWith('F')).length;

        // Cálculos de Conectividad
        const withWA = workerData.filter(r => r.tiene_whatsapp).length;

        // Cálculos de Procedencia (Top Origins)
        const counts = {};
        workerData.forEach(r => {
            if (r.procedencia) {
                counts[r.procedencia] = (counts[r.procedencia] || 0) + 1;
            }
        });
        const topOrigins = Object.entries(counts)
            .sort((a,b) => b[1] - a[1])
            .slice(0, 3);

        renderWorkerMetrics({
            total,
            gender: { males, females, pM: (males/total*100).toFixed(0), pF: (females/total*100).toFixed(0) },
            connectivity: { withWA, pWA: (withWA/total*100).toFixed(0) },
            origins: topOrigins
        });

    } catch (err) {
        console.error("Error cargando métricas de dashboard:", err);
        metricsContainer.innerHTML = '<p style="padding: 2rem; color: #ef4444;">Error al cargar métricas dinámicas.</p>';
    }
}

function renderWorkerMetrics(stats) {
    const kpiContainer = document.getElementById('headerKPIs');
    if (!kpiContainer) return;

    // Preserve the Total Registrados and append other metrics compactly
    kpiContainer.innerHTML = `
        <div class="header-kpi-ribbon">
            <!-- Género -->
            <div class="kpi-micro-badge" title="Diversidad de Género">
                <div class="mini-gender-chart">
                    <div class="mini-fill male" style="width: ${stats.gender.pM}%"></div>
                    <div class="mini-fill female" style="width: ${stats.gender.pF}%"></div>
                </div>
                <span class="v">${stats.gender.pF}% <span style="font-weight:400; font-size:0.6rem">Fem</span></span>
            </div>

            <!-- Digital -->
            <div class="kpi-micro-badge" title="WhatsApp Validado">
                <i class="ph ph-whatsapp-logo" style="color: #10b981;"></i>
                <span class="v">${stats.connectivity.pWA}%</span>
            </div>

            <!-- Origen Principal -->
            <div class="kpi-micro-badge" title="Origen Principal: ${stats.origins[0][0]}">
                <i class="ph ph-map-pin" style="color: #f59e0b;"></i>
                <span class="v">${stats.origins[0][0]}</span>
            </div>
        </div>
    `;
}



// --- AUTOCOMPLETE GLOBAL ---
let suggestionTimeout = null;

async function initAutocompleteGlobal() {
    const inputs = [
        { el: document.getElementById('searchInput'), suggestions: 'searchSuggestions' },
        { el: document.getElementById('searchInputGlobal'), suggestions: 'searchSuggestionsGlobal' }
    ];

    inputs.forEach(target => {
        if (!target.el) return;

        target.el.addEventListener('input', (e) => {
            const val = e.target.value.trim();
            searchQuery = val;
            
            // Cerrar perfil de trabajador si está abierto al buscar
            const profileContainer = document.getElementById('workerProfileContainer');
            if (profileContainer && profileContainer.style.display === 'block') {
                profileContainer.style.display = 'none';
                document.getElementById('tableContainer').style.display = 'block';
                const globalHeader = document.getElementById('globalHeader');
                if (globalHeader) globalHeader.style.display = 'flex';
            }

            if (val.length < 1) {
                hideSearchSuggestions(target.suggestions);
                currentPage = 0;
                if (currentView === 'precio') updateLoteDropdown(null);
                fetchData();
                return;
            }

            clearTimeout(suggestionTimeout);
            suggestionTimeout = setTimeout(() => {
                fetchSearchSuggestions(val, target.suggestions);
            }, 150);
        });

        // Enter para ejecutar búsqueda y ocultar sugerencias
        target.el.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                hideSearchSuggestions(target.suggestions);
                currentPage = 0;
                fetchData();
            }
        });
    });

    document.addEventListener('click', (e) => {
        inputs.forEach(target => {
            const dropdown = document.getElementById(target.suggestions);
            if (dropdown && target.el && !target.el.contains(e.target) && !dropdown.contains(e.target)) {
                hideSearchSuggestions(target.suggestions);
            }
        });
    });
}

async function fetchSearchSuggestions(query, containerId) {
    const config = viewsConfig[currentView];
    if (!config || !config.suggestionTable || !config.suggestionField) return;

    try {
        const { data: suggestions, error } = await dbClient
            .from(config.suggestionTable)
            .select(config.suggestionField)
            .ilike(config.suggestionField, `%${query}%`)
            .limit(10);

        if (error) throw error;
        renderSearchSuggestions(suggestions, config.suggestionField, containerId);
    } catch (e) {
        console.warn('Autocomplete fetch error:', e);
    }
}

function renderSearchSuggestions(results, field, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = '';
    const uniqueValues = [...new Set(results.map(r => r[field]))].filter(Boolean);

    if (uniqueValues.length === 0) {
        container.innerHTML = `<div class="suggestion-item no-results">No se encontraron coincidencias</div>`;
    } else {
        uniqueValues.forEach(val => {
            const item = document.createElement('div');
            item.className = 'suggestion-item';
            item.innerHTML = `<i class="ph ph-magnifying-glass"></i> <span>${val}</span>`;
            item.onclick = () => {
                const targetInput = containerId === 'searchSuggestions' ? document.getElementById('searchInput') : document.getElementById('searchInputGlobal');
                if (targetInput) targetInput.value = val;
                searchQuery = val;
                hideSearchSuggestions(containerId);
                currentPage = 0;
                if (currentView === 'precio') updateLoteDropdown(val);
                fetchData();
            };
            container.appendChild(item);
        });
    }

    container.style.display = 'block';
}

function hideSearchSuggestions(containerId) {
    const container = document.getElementById(containerId || 'searchSuggestions');
    if (container) container.style.display = 'none';
}

function initAgtFilters() {
    const yearSelect = document.getElementById('agtFilterYear');
    const weekInput = document.getElementById('agtFilterWeek');
    const dateInput = document.getElementById('agtFilterDate');
    
    if (!yearSelect || !weekInput || !dateInput) return;

    // Inicialización predeterminada
    const now = new Date();
    yearSelect.value = "2026";
    const currentWeek = getCurrentISOWeek();
    weekInput.value = currentWeek;
    
    // Configurar rango inicial del datepicker basado en la semana actual
    const range = getWeekRange(2026, currentWeek);
    dateInput.min = range.startDate;
    dateInput.max = range.endDate;
    
    // Si la fecha actual está fuera del rango de la semana (ej: domingo vs lunes),
    // ponemos el lunes por defecto, si no, intentamos dejar hoy.
    const todayStr = now.toISOString().split('T')[0];
    if (todayStr >= range.startDate && todayStr <= range.endDate) {
        dateInput.value = todayStr;
    } else {
        dateInput.value = range.startDate;
    }

    // LISTENER: Al cambiar semana o año, sincronizar el rango de días permitido
    const syncDateRange = () => {
        const y = parseInt(yearSelect.value);
        const w = parseInt(weekInput.value);
        const r = getWeekRange(y, w);
        
        dateInput.min = r.startDate;
        dateInput.max = r.endDate;
        dateInput.value = r.startDate; // Saltamos al Lunes por defecto
        
        fetchAgtMetricsView();
    };

    weekInput.addEventListener('change', syncDateRange);
    yearSelect.addEventListener('change', syncDateRange);
    dateInput.addEventListener('change', () => fetchAgtMetricsView());
}

/**
 * Formatea una fecha como YYYY-MM-DD en hora local
 */
function formatDateLocal(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

/**
 * Calcula el rango de fechas (Lunes a Domingo) para una semana ISO
 */
function getWeekRange(year, week) {
    // 1 de Enero del año
    const d = new Date(year, 0, 1);
    // getDay() 0=Dom. Lo convertimos a 1=Lun...7=Dom
    const dayNum = d.getDay() || 7;
    
    // Encontrar el primer lunes del año (semana ISO 1)
    const firstMonday = new Date(d);
    if (dayNum <= 4) {
        // El jueves o posterior cae en la semana 1
        firstMonday.setDate(d.getDate() - dayNum + 1);
    } else {
        // Cae en la última semana del año anterior
        firstMonday.setDate(d.getDate() + 8 - dayNum);
    }

    const weekStart = new Date(firstMonday);
    weekStart.setDate(firstMonday.getDate() + (week - 1) * 7);
    
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);

    return {
        startDate: formatDateLocal(weekStart),
        endDate: formatDateLocal(weekEnd)
    };
}

// --- LOGICA DASHBOARD AGRITRACER ---
/**
 * Función auxiliar para hallar el día anterior cronológico real
 */
function getYesterday(dateStr) {
    // Usamos el constructor con T12:00:00 para evitar fugas de zona horaria
    const d = new Date(dateStr + 'T12:00:00');
    d.setDate(d.getDate() - 1);
    return formatDateLocal(d);
}

async function fetchAgtMetricsView() {
    const yearSelect = document.getElementById('agtFilterYear');
    const weekInput = document.getElementById('agtFilterWeek');
    const dateInput = document.getElementById('agtFilterDate');
    const kpiContainer = document.getElementById('agtKPIs');
    
    if (!yearSelect || !weekInput || !kpiContainer) return;

    const year = parseInt(yearSelect.value);
    const week = parseInt(weekInput.value);
    const selectedDate = dateInput?.value;

    // Calcular rango de la semana para el gráfico de evolución
    const range = getWeekRange(year, week);
    const startDate = range.startDate;
    const endDate = range.endDate;

    kpiContainer.innerHTML = `<div class="stat-card skeleton" style="height:100px"></div>`.repeat(4);

    try {
        let allData = [];
        let page = 0;
        const pageSize = 1000;
        let finished = false;

        // Bucle de carga exhaustiva para superar el límite de 1000 de Supabase
        while (!finished) {
            let query = dbClient
                .from('rpt_horas_agritracer')
                .select('*')
                .gte('fecha', startDate)
                .lte('fecha', endDate)
                .range(page * pageSize, (page + 1) * pageSize - 1);

            const { data, error } = await query;

            if (error) throw error;
            if (!data || data.length === 0) {
                finished = true;
            } else {
                allData = [...allData, ...data];
                if (data.length < pageSize) finished = true;
                else page++;
            }
            
            // Seguridad: No cargar más de 50k registros para evitar colapso de memoria del navegador
            if (allData.length > 50000) {
                console.warn("Límite de seguridad de datos alcanzado (50k filas).");
                finished = true;
            }
        }

        if (allData.length === 0) {
            kpiContainer.innerHTML = `<div style="grid-column: 1 / -1; padding: 2rem; text-align: center; color: var(--text-secondary);">No se encontraron registros en la Semana ${week} de ${year}.</div>`;
            return;
        }

        // --- FILTRADO ADICIONAL PARA KPIs ---
        // Si hay una fecha seleccionada, filtramos los datos de KPIs a ese día.
        // Si no, usamos la semana completa.
        const kpiData = selectedDate ? allData.filter(r => r.fecha === selectedDate) : allData;

        const uniqueWorkers = new Set();
        const uniqueLots = new Set();
        
        const activityMap = {};
        const fundoMap = {};
        const attendanceMap = {}; // Siempre usamos allData para el gráfico de evolución

        // Inicializar los 7 días de la semana (Lunes a Domingo) para asegurar visualización íntegra
        for (let i = 0; i < 7; i++) {
            const d = new Date(startDate + 'T12:00:00');
            d.setDate(d.getDate() + i);
            attendanceMap[formatDateLocal(d)] = new Set();
        }

        // 1. Procesar Asistencia Semanal (Puntos del gráfico) y Lotes Semanales
        allData.forEach(row => {
            let fechaKey = row.fecha;
            // Normalizar fecha si viene con hora o es objeto
            if (fechaKey && typeof fechaKey === 'string' && fechaKey.includes('T')) {
                fechaKey = fechaKey.split('T')[0];
            } else if (fechaKey instanceof Date) {
                fechaKey = formatDateLocal(fechaKey);
            }

            if (fechaKey && attendanceMap[fechaKey]) {
                if (row.dni) attendanceMap[fechaKey].add(row.dni);
            }
            // Lotes siempre semanales según requerimiento
            if (row.lote) uniqueLots.add(row.lote);
        });

        // 2. Procesar KPIs de Personal (Basado en kpiData: Día o Semana) y Gráficos Distributivos
        kpiData.forEach(row => {
            // Horas decimales
            if (row.total_horas) {
                let decimal = 0;
                if (typeof row.total_horas === 'string' && row.total_horas.includes(':')) {
                    const parts = row.total_horas.split(':');
                    const h = parseInt(parts[0]) || 0;
                    const m = parseInt(parts[1]) || 0;
                    const s = parseInt(parts[2]) || 0;
                    decimal = h + (m / 60) + (s / 3600);
                } else {
                    decimal = parseFloat(row.total_horas) || 0;
                }
                
                if (decimal > 0) {
                    const act = row.actividad || 'Otros';
                    activityMap[act] = (activityMap[act] || 0) + decimal;
                    
                    const fundo = row.fundo || 'Sin Fundo';
                    fundoMap[fundo] = (fundoMap[fundo] || 0) + decimal;
                }
            }

            if (row.dni) uniqueWorkers.add(row.dni);
        });

        // 3. Calcular Ausentes y Retornos (Relativo a selectedDate)
        let ausentesCount = 0;
        let retornosCount = 0;
        let variacionAparente = 0;
        
        if (selectedDate && attendanceMap[selectedDate]) {
            const yesterdayDate = getYesterday(selectedDate);
            const todaySet = attendanceMap[selectedDate] || new Set();
            const yesterdaySet = attendanceMap[yesterdayDate] || new Set();
            
            const ausentesSet = new Set();
            const retornosSet = new Set();
            
            yesterdaySet.forEach(dni => { if (!todaySet.has(dni)) ausentesSet.add(dni); });
            todaySet.forEach(dni => { if (!yesterdaySet.has(dni)) retornosSet.add(dni); });
            
            ausentesCount = ausentesSet.size;
            retornosCount = retornosSet.size;
            variacionAparente = todaySet.size - yesterdaySet.size;

            // Almacenar globalmente para identificación (drill-down)
            window.currentAgtGroups = {
                activos: Array.from(todaySet),
                ausentes: Array.from(ausentesSet),
                retornos: Array.from(retornosSet)
            };
        } else {
            // Caso semanal (no hay fecha específica seleccionada)
            window.currentAgtGroups = {
                activos: Array.from(uniqueWorkers),
                ausentes: [],
                retornos: []
            };
        }

        const varIcon = variacionAparente >= 0 ? 'ph-trend-up' : 'ph-trend-down';
        const varColor = variacionAparente >= 0 ? '#16a34a' : '#ea580c';
        const varBg = variacionAparente >= 0 ? '#f0fdf4' : '#fff7ed';
        const activeWorkers = uniqueWorkers.size;
        const activeLotes = uniqueLots.size;

        // Renderizar KPIs
        kpiContainer.innerHTML = `
            <div class="stat-card" style="border-bottom: 3px solid #16a34a;" onclick="filterByAgtGroup('activos', 'Trabajadores Presentes')">
                <div class="stat-icon" style="background:rgba(22,163,74,0.1);color:#16a34a;"><i class="ph ph-users"></i></div>
                <div class="stat-info">
                    <span class="stat-label">Trabajadores</span>
                    <span class="stat-value">${activeWorkers.toLocaleString()}</span>
                    <span class="stat-desc">${selectedDate ? 'Presentes hoy' : 'Únicos en la semana'}</span>
                </div>
            </div>
            <div class="stat-card" style="border-bottom: 3px solid var(--primary-color);">
                <div class="stat-icon" style="background:rgba(0,75,147,0.1);color:var(--primary-color);"><i class="ph ph-grid-four"></i></div>
                <div class="stat-info">
                    <span class="stat-label">Lotes Operativos</span>
                    <span class="stat-value">${activeLotes}</span>
                    <span class="stat-desc">Semanal</span>
                </div>
            </div>
            <div class="stat-card" style="border-bottom: 3px solid #ef4444;" onclick="filterByAgtGroup('ausentes', 'Trabajadores Ausentes')">
                <div class="stat-icon" style="background:rgba(239,68,68,0.1);color:#ef4444;"><i class="ph ph-user-minus"></i></div>
                <div class="stat-info">
                    <span class="stat-label">Ausentes</span>
                    <span class="stat-value">${ausentesCount}</span>
                    <span class="stat-desc">Vs ayer</span>
                </div>
            </div>
            <div class="stat-card" style="border-bottom: 3px solid #0891b2;" onclick="filterByAgtGroup('retornos', 'Trabajadores Retornos')">
                <div class="stat-icon" style="background:rgba(8,145,178,0.1);color:#0891b2;"><i class="ph ph-user-plus"></i></div>
                <div class="stat-info">
                    <span class="stat-label">Retornos</span>
                    <span class="stat-value">${retornosCount}</span>
                    <span class="stat-desc">Nuevos hoy</span>
                </div>
            </div>
            <div class="stat-card" style="border-bottom: 3px solid ${varColor}; background: ${varBg}33;">
                <div class="stat-icon" style="background:${varBg};color:${varColor};"><i class="ph ${varIcon}"></i></div>
                <div class="stat-info">
                    <span class="stat-label">Variación Aparente</span>
                    <span class="stat-value">${variacionAparente > 0 ? '+' : ''}${variacionAparente}</span>
                    <span class="stat-desc">Saldo neto vs ayer</span>
                </div>
            </div>
        `;

        renderAgtCharts(activityMap, fundoMap, attendanceMap);

    } catch (err) {
        console.error("Error cargando métricas Agritracer:", err);
        kpiContainer.innerHTML = '<div class="empty-state" style="grid-column: 1/-1;">Error al consultar la base de datos.</div>';
    }
}

function renderAgtCharts(activityData, fundoData, attendanceMap) {
    // 1. Gráfico de Asistencia por Fecha (Columnas)
        const attCtx = document.getElementById('agtAttendanceChart').getContext('2d');
        if (attCtx && attendanceMap) {
            if (agtAttendanceChartInstance) agtAttendanceChartInstance.destroy();
            
            // Crear Gradiente Premium
            const gradient = attCtx.createLinearGradient(0, 0, 0, 320);
            gradient.addColorStop(0, 'rgba(0, 75, 147, 0.9)');
            gradient.addColorStop(1, 'rgba(0, 75, 147, 0.3)');

            // Ordenar de más antiguo a más reciente (Lunes a Domingo)
            const sortedDates = Object.keys(attendanceMap).sort((a,b) => a.localeCompare(b));
            const counts = [];
            const flowData = []; 

            sortedDates.forEach((date) => {
                const todaySet = attendanceMap[date];
                counts.push(todaySet.size);

                // El flujo siempre se calcula contra su día anterior cronológico real
                const yesterdayDate = getYesterday(date);
                const yesterdaySet = attendanceMap[yesterdayDate] || new Set();
                let a = 0;
                let r = 0;
                yesterdaySet.forEach(dni => { if (!todaySet.has(dni)) a++; });
                todaySet.forEach(dni => { if (!yesterdaySet.has(dni)) r++; });
                flowData.push({ v: todaySet.size - yesterdaySet.size, a, r });
            });
            
            agtAttendanceChartInstance = new Chart(attCtx.canvas, {
                type: 'bar',
                data: {
                    labels: sortedDates.map(d => d.split('-').reverse().slice(0,2).join('/')),
                    datasets: [{
                        label: 'Personal Asistente',
                        data: counts,
                        backgroundColor: gradient,
                        hoverBackgroundColor: 'var(--primary-color)',
                        borderRadius: 8,
                        maxBarThickness: 80,
                        barPercentage: 0.8,
                        categoryPercentage: 0.9
                    }]
                },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                layout: {
                    padding: {
                        top: 45, 
                        bottom: 0,
                        left: 10,
                        right: 10
                    }
                },
                plugins: { 
                    legend: { display: false },
                    tooltip: { enabled: true },
                    datalabels: {
                        anchor: 'end',
                        align: 'top',
                        offset: 4,
                        color: 'var(--text-primary)',
                        textAlign: 'center',
                        font: { weight: '700', size: 10 },
                        formatter: (val, ctx) => {
                            const i = ctx.dataIndex;
                            const f = flowData[i];
                            const vSign = f.v > 0 ? '+' : '';
                            
                            // Presentación estética mejorada para V, A, R
                            return [
                                `${val}`,
                                `Δ: ${vSign}${f.v}`,
                                `A: ${f.a} | R: ${f.r}`
                            ];
                        }
                    }
                },
                scales: { 
                    x: { grid: { display: false } }, 
                    y: { 
                        display: false, // Quitar eje vertical según solicitud
                        beginAtZero: true,
                        grid: { display: false }
                    } 
                }
            }
        });
        // 2. Renderizar Tabla de Asistencia Diaria
        const dailyTableBody = document.getElementById('agtDailyAttendanceTable');
        if (dailyTableBody) {
            let tableHtml = '';
            sortedDates.forEach((date, i) => {
                const f = flowData[i];
                const vSign = f.v > 0 ? '+' : '';
                const vColor = f.v > 0 ? '#16a34a' : (f.v < 0 ? '#ea580c' : 'var(--text-secondary)');
                
                tableHtml += `
                    <tr style="border-bottom: 1px solid var(--border-color); cursor: default; transition: background 0.2s;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='transparent'">
                        <td style="padding: 0.45rem 0.5rem; font-weight: 600; color: var(--text-primary);"><i class="ph-duotone ph-calendar-blank" style="margin-right:0.25rem;"></i>${date.split('-').reverse().join('/')}</td>
                        <td style="padding: 0.45rem 0.5rem; text-align: center; font-weight: 700;">${counts[i]}</td>
                        <td style="padding: 0.45rem 0.5rem; text-align: center; font-weight: 600; color: ${vColor}; background: ${f.v !== 0 ? vColor+'15' : 'transparent'}; border-radius: 4px;">${vSign}${f.v}</td>
                        <td style="padding: 0.45rem 0.5rem; text-align: center; font-weight: 600; color: #ef4444;">${f.a}</td>
                        <td style="padding: 0.45rem 0.5rem; text-align: center; font-weight: 600; color: #3b82f6;">${f.r}</td>
                    </tr>
                `;
            });
            dailyTableBody.innerHTML = tableHtml || `<tr><td colspan="5" style="text-align:center; padding:1.5rem; color:var(--text-secondary);">No hay datos para la semana</td></tr>`;
        }
    }
    // 3. Gráfico de Fundos (Concentración)
    const fundoCtx = document.getElementById('agtFundoChart');
    if (fundoCtx) {
        if (agtFundoChartInstance) agtFundoChartInstance.destroy();
        
        const sortedFundos = Object.entries(fundoData).sort((a,b) => b[1] - a[1]);
        
        agtFundoChartInstance = new Chart(fundoCtx, {
            type: 'doughnut',
            data: {
                labels: sortedFundos.map(x => x[0]),
                datasets: [{
                    data: sortedFundos.map(x => Math.round(x[1])),
                    backgroundColor: ['#004b93', '#8ec63f', '#f59e0b', '#0ea5e9', '#6366f1', '#f43f5e', '#a855f7'],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { 
                    legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } },
                    datalabels: { display: false } // Deshabilitar para evitar el desorden de números decimales
                },
                cutout: '65%'
            }
        });
    }
}

// Variables para el modal
let agtGroupModalData = [];

window.filterByAgtGroup = async function(group, title) {
    let dniList = window.currentAgtGroups ? window.currentAgtGroups[group] : [];
    
    if (!dniList || dniList.length === 0) {
        alert(`No hay registros de ${group} para la fecha o periodo seleccionado. Por favor, selecciona un día específico en el calendario superior.`);
        return;
    }

    // Normalizar DNIs: crear variaciones con y sin ceros a la izquierda
    let expandedDniSet = new Set();
    dniList.forEach(d => {
        let str = d.toString().trim();
        expandedDniSet.add(str);
        expandedDniSet.add(str.padStart(8, '0'));
        expandedDniSet.add(str.replace(/^0+/, ''));
    });
    
    let normalizedDniList = Array.from(expandedDniSet);
    let countReal = dniList.length; 
    
    // Abrir Modal
    const modal = document.getElementById('agtGroupModal');
    const modalTitle = document.getElementById('agtGroupModalTitle');
    const modalSubtitle = document.getElementById('agtGroupModalSubtitle');
    const listBody = document.getElementById('agtGroupListBody');
    const searchInput = document.getElementById('agtGroupSearch');
    const loadingState = document.getElementById('agtGroupLoading');
    const listContainer = document.getElementById('agtGroupListContainer');

    if (!modal) return;
    
    modalTitle.textContent = title;
    modalSubtitle.textContent = `Total: ${countReal} trabajadores identificados`;
    searchInput.value = '';
    listBody.innerHTML = '';
    agtGroupModalData = [];
    
    listContainer.style.display = 'none';
    loadingState.style.display = 'block';
    modal.style.display = 'flex';

    try {
        // Consultar Nombres en t_trabajador (Limitar a 1000 máximo para rendimiento del Modal)
        let safeList = normalizedDniList;
        if (safeList.length > 3000) safeList = safeList.slice(0, 3000); // 1000 originarios * 3 combinaciones

        const { data, error } = await dbClient
            .from('t_trabajador')
            .select('dni, trabajador, procedencia')
            .in('dni', safeList)
            .limit(1000); // Límite razonable visualmente

        if (error) throw error;
        
        // Remover duplicados si es que t_trabajador los tuviese, o por padding
        const uniqueData = [];
        const seenDNI = new Set();
        (data || []).forEach(r => {
             // Agrupar visualmente por el DNI numérico crudo
             const numDni = Number(r.dni).toString();
             if (!seenDNI.has(numDni)) {
                 seenDNI.add(numDni);
                 uniqueData.push(r);
             }
        });

        agtGroupModalData = uniqueData;
        renderAgtGroupList(agtGroupModalData);

    } catch (err) {
        console.error("Error al cargar lista del grupo Agritracer:", err);
        listBody.innerHTML = `<tr><td colspan="3" style="text-align:center; padding: 2rem; color: #ef4444;">Ocurrió un error al cargar la lista.</td></tr>`;
    } finally {
        loadingState.style.display = 'none';
        listContainer.style.display = 'block';
    }
};

window.renderAgtGroupList = function(dataToRender) {
    const listBody = document.getElementById('agtGroupListBody');
    if (!listBody) return;
    
    if (dataToRender.length === 0) {
        listBody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding: 2rem; color: var(--text-secondary);">No se encontraron los perfiles detallados de estos DNIs en el directorio maestro.</td></tr>`;
        return;
    }

    listBody.innerHTML = dataToRender.map((i, index) => `
        <tr style="border-bottom: 1px solid var(--border-color);">
            <td style="padding: 0.5rem 0.75rem; text-align: center; color: var(--text-secondary); font-weight: 600;">${index + 1}</td>
            <td style="padding: 0.5rem 0.75rem; font-weight: 500;">${i.dni || '-'}</td>
            <td style="padding: 0.5rem 0.75rem;">${i.trabajador || 'SIN NOMBRE REGISTRADO'}</td>
            <td style="padding: 0.5rem 0.75rem;"><span class="tag tag-secondary">${i.procedencia || '-'}</span></td>
        </tr>
    `).join('');
};

window.filterAgtGroupList = function() {
    const query = document.getElementById('agtGroupSearch').value.toLowerCase();
    const filtered = agtGroupModalData.filter(d => 
        (d.trabajador && d.trabajador.toLowerCase().includes(query)) ||
        (d.dni && d.dni.toLowerCase().includes(query)) ||
        (d.procedencia && d.procedencia.toLowerCase().includes(query))
    );
    renderAgtGroupList(filtered);
};

window.closeAgtGroupModal = function() {
    const modal = document.getElementById('agtGroupModal');
    if (modal) modal.style.display = 'none';
};

// Inicialización de Filtros Agritracer
initAgtFilters();
