import React from 'react';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Users, GraduationCap, LayoutDashboard, Clock, Palmtree, Stethoscope } from "lucide-react";

interface AppSidebarProps {
  currentView: string;
  onViewChange: (view: string) => void;
}

export function AppSidebar({ currentView, onViewChange }: AppSidebarProps) {
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="p-4 flex flex-row items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <LayoutDashboard className="h-5 w-5" />
        </div>
        <div className="flex flex-col gap-0.5 leading-none group-data-[collapsible=icon]:hidden">
          <span className="font-semibold">Agritracer</span>
          <span className="text-xs text-muted-foreground">Analytics v1.0</span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Menú Principal</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton 
                  isActive={currentView === 'caporal'} 
                  onClick={() => onViewChange('caporal')}
                  tooltip="Caporal"
                  className={currentView === 'caporal' ? "bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary font-bold border-l-2 border-primary rounded-l-none" : ""}
                >
                  <Users className={currentView === 'caporal' ? "text-primary" : "h-4 w-4"} />
                  <span>Caporal</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton 
                  isActive={currentView === 'programa_caporal'} 
                  onClick={() => onViewChange('programa_caporal')}
                  tooltip="Programa Caporal"
                  className={currentView === 'programa_caporal' ? "bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary font-bold border-l-2 border-primary rounded-l-none" : ""}
                >
                  <GraduationCap className={currentView === 'programa_caporal' ? "text-primary" : "h-4 w-4"} />
                  <span>Programa Caporal</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton 
                  isActive={currentView === 'reporte_horas'} 
                  onClick={() => onViewChange('reporte_horas')}
                  tooltip="Reporte de Horas"
                  className={currentView === 'reporte_horas' ? "bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary font-bold border-l-2 border-primary rounded-l-none" : ""}
                >
                  <Clock className={currentView === 'reporte_horas' ? "text-primary" : "h-4 w-4"} />
                  <span>Reporte de Horas</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton 
                  isActive={currentView === 'vacaciones'} 
                  onClick={() => onViewChange('vacaciones')}
                  tooltip="Gestión de Vacaciones"
                  className={currentView === 'vacaciones' ? "bg-emerald-50 text-emerald-600 hover:bg-emerald-100 hover:text-emerald-700 font-bold border-l-2 border-emerald-600 rounded-l-none" : ""}
                >
                  <Palmtree className={currentView === 'vacaciones' ? "text-emerald-600" : "h-4 w-4"} />
                  <span>Vacaciones</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton 
                  isActive={currentView === 'licencias'} 
                  onClick={() => onViewChange('licencias')}
                  tooltip="Gestión de Licencias"
                  className={currentView === 'licencias' ? "bg-blue-50 text-blue-600 hover:bg-blue-100 hover:text-blue-700 font-bold border-l-2 border-blue-600 rounded-l-none" : ""}
                >
                  <Stethoscope className={currentView === 'licencias' ? "text-blue-600" : "h-4 w-4"} />
                  <span>Licencias</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
