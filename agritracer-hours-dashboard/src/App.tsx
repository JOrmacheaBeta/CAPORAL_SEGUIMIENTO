/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import Dashboard from './components/Dashboard';
import ProgramaCaporalDashboard from './components/ProgramaCaporalDashboard';
import ReporteHoras from './components/ReporteHoras';
import { AppSidebar } from './components/AppSidebar';
import { SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";

export default function App() {
  const [currentView, setCurrentView] = useState('caporal');

  return (
    <TooltipProvider>
      <SidebarProvider>
        <div className="flex min-h-screen w-full bg-background font-sans antialiased">
          <AppSidebar currentView={currentView} onViewChange={setCurrentView} />
          <SidebarInset className="flex flex-col flex-1">
            <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4 sticky top-0 bg-background/80 backdrop-blur-md z-10">
              <SidebarTrigger className="-ml-1" />
              <div className="flex items-center gap-2 ml-2">
                <div className="w-6 h-6 bg-primary rounded flex items-center justify-center text-primary-foreground font-bold text-xs">
                  A
                </div>
                <span className="font-bold text-lg tracking-tight">Agritracer <span className="text-primary">Analytics</span></span>
              </div>
              <div className="ml-auto flex items-center gap-4">
                <div className="hidden md:flex items-center gap-1 text-xs text-muted-foreground">
                  <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  Conectado a Supabase
                </div>
              </div>
            </header>
            
            <main className="flex-1 overflow-auto">
              {currentView === 'caporal' ? (
                <Dashboard />
              ) : currentView === 'programa_caporal' ? (
                <ProgramaCaporalDashboard />
              ) : (
                <ReporteHoras />
              )}
            </main>

            <footer className="border-t py-6 bg-muted/30">
              <div className="max-w-7xl mx-auto px-4 text-center text-xs text-muted-foreground">
                &copy; {new Date().getFullYear()} Agritracer Hours Reporting System. Todos los derechos reservados.
              </div>
            </footer>
          </SidebarInset>
        </div>
      </SidebarProvider>
    </TooltipProvider>
  );
}

