/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import Dashboard from './components/Dashboard';
import ProgramaCaporalDashboard from './components/ProgramaCaporalDashboard';
import ReporteHoras from './components/ReporteHoras';
import GestionVacaciones from './components/GestionVacaciones';
import GestionLicencias from './components/GestionLicencias';
import Login from './components/Login';
import { AppSidebar } from './components/AppSidebar';
import { SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { supabase } from './lib/supabase';
import { Button } from "@/components/ui/button";
import { LogOut, User, Loader2 } from "lucide-react";

export default function App() {
  const [currentView, setCurrentView] = useState('caporal');
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check active sessions and subscribe to auth changes
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  if (loading) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-10 h-10 text-primary animate-spin" />
          <p className="text-slate-500 font-bold text-xs uppercase tracking-widest animate-pulse">Cargando Sistema...</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return <Login />;
  }

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
                <div className="hidden md:flex items-center gap-3 mr-2">
                  <div className="flex flex-col items-end">
                    <span className="text-[10px] font-black text-slate-900 uppercase leading-none">{session.user.email?.split('@')[0]}</span>
                    <span className="text-[8px] text-slate-500 font-bold uppercase tracking-tighter">Administrador</span>
                  </div>
                  <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center">
                    <User className="w-4 h-4 text-slate-600" />
                  </div>
                </div>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={handleLogout}
                  className="text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-colors h-9 px-3 gap-2 font-bold text-xs uppercase tracking-tight"
                >
                  <LogOut className="w-4 h-4" />
                  <span className="hidden sm:inline">Salir</span>
                </Button>
              </div>
            </header>
            
            <main className="flex-1 overflow-auto">
              {currentView === 'caporal' ? (
                <Dashboard />
              ) : currentView === 'programa_caporal' ? (
                <ProgramaCaporalDashboard />
              ) : currentView === 'vacaciones' ? (
                <GestionVacaciones />
              ) : currentView === 'licencias' ? (
                <GestionLicencias />
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

